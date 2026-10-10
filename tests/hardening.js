#!/usr/bin/env node
/**
 * tests/hardening.js   (npm run check:hardening)   - 1.11.29
 *
 * Starts its OWN copies of the server on other ports (4101 / 4102 / a refusing one) with tiny rate limits,
 * so it does not disturb the server you have running. Checks:
 *   - no route sends err.message / e.message to the browser (source scan) and serverError() hides details,
 *   - security headers (helmet) and the CSP are present, bad JSON gets a clean 400,
 *   - the sign-in, sign-up, MFA and borrow-request rate limits answer 429 after the limit,
 *   - STRICT_SECURITY=on refuses to start in production with a missing / short JWT_SECRET or empty CORS_ORIGIN,
 *     and starts with good values.
 * Needs the database (same .env as the server). Creates throwaway users testhard_<time>_N and removes them.
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const root = path.resolve(__dirname, '..');
const PW = 'Chk-Pass-123!';
const stamp = Date.now();
const made = [];
let passed = 0; let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; console.log(`  PASS  ${label}`); } else { failed++; console.log(`  FAIL  ${label}${detail ? '  -> ' + detail : ''}`); }
}
const section = (t) => console.log(`\n${t}`);

function startServer(port, env, { waitFor = 'server running on port' } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), RATE_LIMIT: '', ...env } });
    let out = '';
    const done = (v) => { clearTimeout(t); resolve(v); };
    const t = setTimeout(() => done({ child, out, started: false, code: null }), 45000);
    child.stdout.on('data', (d) => { out += d; if (out.includes(waitFor)) done({ child, out, started: true }); });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => done({ child, out, started: false, code }));
  });
}
const stop = (c) => { try { c.kill(); } catch { /* gone */ } };
async function call(base, method, url, { token, body, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + url, { method, headers, body: raw !== undefined ? raw : (body === undefined ? undefined : JSON.stringify(body)) });
  let json = null; try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json: json || {}, headers: res.headers };
}
function walk(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    if (['node_modules', 'client', 'tests', 'scripts', '.git'].includes(f)) continue;
    const p = path.join(d, f); const s = fs.statSync(p);
    if (s.isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

async function main() {
  section('No error details sent to the browser');
  const leaks = [];
  for (const f of walk(root)) {
    if (f.endsWith(path.join('utils', 'serverError.js'))) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/res\.(status\(\d+\)\.)?(json|send)\(.*\b(err|e|error)\.message/.test(line) && !/console\./.test(line) && !/safe: a deliberate/.test(line)) leaks.push(`${path.relative(root, f)}:${i + 1}`);
    });
  }
  check('no res.json / res.send(...err.message) left in the server code', leaks.length === 0, leaks.join(', '));
  const { serverError, GENERIC } = require('../utils/serverError');
  const fake = () => { const r = { headersSent: false, req: { method: 'GET', originalUrl: '/x?y=1' }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const origErr = console.error; console.error = () => {};
  const r1 = fake(); serverError(r1, new Error("Table 'bgtracker.readings' doesn't exist"));
  const r2 = fake(); const ex = new Error('Pick another code'); ex.expose = true; serverError(r2, ex);
  console.error = origErr;
  check('serverError hides a database error behind a generic message', r1.code === 500 && r1.body.error === GENERIC && !/Table/.test(JSON.stringify(r1.body)));
  check('serverError passes through a deliberately exposed message', r2.code === 500 && r2.body.error === 'Pick another code');

  section('Headers, bad JSON, rate limits (test server on :4101, tiny limits)');
  const S = await startServer(4101, { RATE_LIMIT_SIGNIN_MAX: '3', RATE_LIMIT_SIGNUP_MAX: '3', RATE_LIMIT_MFA_MAX: '2', RATE_LIMIT_BORROW_MAX: '2' });
  try {
    if (!S.started) throw new Error('test server did not start:\n' + S.out.slice(-600));
    const base = 'http://localhost:4101';
    const h = await call(base, 'POST', '/auth/signin', { raw: '{bad' });
    check('bad JSON: 400 with a clean message', h.status === 400 && /not valid JSON/.test(h.json.error || ''), JSON.stringify(h.json));
    const csp = h.headers.get('content-security-policy') || '';
    check('Content-Security-Policy is set (default-src self, no framing, no objects)', /default-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp), csp);
    check('X-Content-Type-Options: nosniff', h.headers.get('x-content-type-options') === 'nosniff');
    check('no HSTS over plain HTTP / without FORCE_HTTPS', !h.headers.get('strict-transport-security'));
    check('no X-Powered-By', !h.headers.get('x-powered-by'));

    const names = [0, 1, 2].map((i) => `testhard_${stamp}_${i}`);
    const signup = (n) => call(base, 'POST', '/auth/signup', { body: { firstName: 'H', lastName: 'Ard', userName: n, email: `${n}@example.invalid`, password: PW } });
    const s0 = await signup(names[0]); made.push(names[0]);
    const s1 = await signup(names[1]); made.push(names[1]);
    const s2 = await signup(names[2]); made.push(names[2]);
    check('three sign-ups allowed', [s0, s1, s2].every((s) => s.status === 201), JSON.stringify([s0.status, s1.status, s2.status]));
    const s3 = await signup(`testhard_${stamp}_3`);
    check('the 4th sign-up from this address: 429 with a wait time', s3.status === 429 && /minute/.test(s3.json.error || ''), JSON.stringify(s3.json));
    check('the 429 carries RateLimit headers', !!(s3.headers.get('ratelimit') || s3.headers.get('ratelimit-policy') || s3.headers.get('retry-after')));

    // successful sign-ins are not counted (the first one also gives the token used for the borrow check below)
    const first = await call(base, 'POST', '/auth/signin', { body: { userName: names[0], password: PW } });
    const token = first.json.token;
    let ok = 0; for (let i = 0; i < 5; i++) if ((await call(base, 'POST', '/auth/signin', { body: { userName: names[0], password: PW } })).status === 200) ok++;
    check('five correct sign-ins in a row are all fine (successes are not counted)', ok === 5, `ok=${ok}`);
    const bad = [];
    for (let i = 0; i < 3; i++) bad.push((await call(base, 'POST', '/auth/signin', { body: { userName: names[0], password: 'wrong-' + i } })).status);
    check('three wrong passwords: refused (400/401), not yet limited', bad.every((x) => x === 400 || x === 401), JSON.stringify(bad));
    const locked = await call(base, 'POST', '/auth/signin', { body: { userName: names[0], password: 'wrong-3' } });
    check('the 4th wrong password: 429', locked.status === 429 && /failed sign-in/i.test(locked.json.error || ''), JSON.stringify(locked.json));

    check('have a token for the borrow check', !!token);
    const id = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).id;
    const br = [];
    for (let i = 0; i < 3; i++) br.push((await call(base, 'POST', `/church/borrow/request/${id}`, { token, body: { kind: 'book', ref: 1 } })).status);
    check('borrow requests: 2 allowed (they answer 400/404 here), the 3rd is 429', br[0] !== 429 && br[1] !== 429 && br[2] === 429, JSON.stringify(br));
    const mf = [];
    for (let i = 0; i < 3; i++) mf.push((await call(base, 'POST', '/auth/mfa/send', { body: { challengeToken: 'x' } })).status);
    check('MFA send: limited after the configured number', mf[2] === 429 && mf[0] !== 429, JSON.stringify(mf));
  } catch (e) { failed++; console.log(`  FAIL  ${e.stack || e.message}`); } finally { stop(S.child); }

  section('STRICT_SECURITY');
  const prodGood = { NODE_ENV: 'production', STRICT_SECURITY: 'on', JWT_SECRET: 'x'.repeat(40), CORS_ORIGIN: 'https://portal.example.com', RATE_LIMIT: 'off' };
  const noSecret = await startServer(4102, { ...prodGood, JWT_SECRET: '' }, { waitFor: 'NEVER' });
  check('production + STRICT_SECURITY + no JWT_SECRET: refuses to start (exit 1)', noSecret.code === 1 && /JWT_SECRET/.test(noSecret.out), `${noSecret.code} ${noSecret.out.slice(-200)}`);
  const shortSecret = await startServer(4102, { ...prodGood, JWT_SECRET: 'short' }, { waitFor: 'NEVER' });
  check('a short JWT_SECRET is refused too', shortSecret.code === 1, String(shortSecret.code));
  const noCors = await startServer(4102, { ...prodGood, CORS_ORIGIN: '' }, { waitFor: 'NEVER' });
  check('empty CORS_ORIGIN is refused', noCors.code === 1 && /CORS_ORIGIN/.test(noCors.out), `${noCors.code}`);
  const good = await startServer(4102, prodGood);
  try {
    check('good values: starts normally', good.started, good.out.slice(-300));
    if (good.started) {
      const home = await call('http://localhost:4102', 'GET', '/');
      check('production server still serves the app page', home.status === 200 || home.status === 404 /* 404 only if client/build is missing */, String(home.status));
      const w = await call('http://localhost:4102', 'GET', '/auth/tokenIsValid');
      const pre = await fetch('http://localhost:4102/auth/signin', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
      check('CORS locked to the configured origin (evil origin gets no allow header)', !pre.headers.get('access-control-allow-origin'), String(pre.headers.get('access-control-allow-origin')));
      const pre2 = await fetch('http://localhost:4102/auth/signin', { method: 'OPTIONS', headers: { Origin: 'https://portal.example.com', 'Access-Control-Request-Method': 'POST' } });
      check('CORS allows the configured origin', pre2.headers.get('access-control-allow-origin') === 'https://portal.example.com', String(pre2.headers.get('access-control-allow-origin')));
      void w;
    }
  } finally { stop(good.child); }
}

main().catch((e) => { failed++; console.log(`  FAIL  unexpected error: ${e.stack || e.message}`); }).finally(async () => {
  section('Cleanup');
  try {
    const deleteUser = require('../db/maintenance/deleteUser');
    for (const n of made) { try { await deleteUser(n, true, () => {}); console.log(`  cleanup: removed ${n}`); } catch (e) { if (!/no user named/.test(e.message)) console.log(`  cleanup: ${n}: ${e.message}`); } }
  } catch (e) { console.log(`  cleanup problem: ${e.message}`); }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
