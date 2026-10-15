#!/usr/bin/env node
/**
 * tests/mfa-redis.js  (npm run check:mfaredis)   - 1.13.7
 *
 * The two-step sign-in state with a REAL Redis: one-time codes, lockout, the per-IP limit, what
 * survives an app restart, and what happens when Redis disappears. Starts its own throwaway
 * redis-server (port 6391, nothing saved to disk) and its own copies of the app (port 4114), so
 * it needs the `redis-server` program and the database from your .env. Without redis-server it
 * prints SKIPPED and exits 0.
 *
 * Creates testmfar_<time>_* users and removes them.
 */
const path = require('path');
const { spawn, spawnSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const root = path.resolve(__dirname, '..');

if (spawnSync('redis-server', ['--version']).status !== 0) {
  console.log('SKIPPED: redis-server is not installed here, so the Redis checks were not run.');
  process.exit(0);
}

const PORT = 4114, RPORT = 6391, BASE = `http://127.0.0.1:${PORT}`;
const REDIS_URL = `redis://127.0.0.1:${RPORT}`;
const PW = 'Mfa-Pass-123!';
const stamp = Date.now();
const names = ['a', 'b', 'c', 'd'].map((x) => `testmfar_${stamp}_${x}`);
let passed = 0, failed = 0;
const check = (l, c, d) => { c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}${d ? '  -> ' + d : ''}`)); };
const section = (t) => console.log(`\n${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbs = require('../db/db');
const totp = require('../utils/totp');
const q = async (sql, params) => (await dbs.owenenterprises.promise().query(sql, params))[0];
const Redis = require('ioredis');

let redisProc = null, appProc = null;
function startRedis() {
  return new Promise((resolve, reject) => {
    redisProc = spawn('redis-server', ['--port', String(RPORT), '--save', '', '--appendonly', 'no', '--bind', '127.0.0.1']);
    let out = ''; const t = setTimeout(() => reject(new Error('redis did not start')), 10000);
    redisProc.stdout.on('data', (d) => { out += d; if (out.includes('Ready to accept connections')) { clearTimeout(t); resolve(); } });
  });
}
function startApp(extraEnv = {}) {
  return new Promise((resolve, reject) => {
    appProc = spawn(process.execPath, ['server.js'], { cwd: root, env: {
      ...process.env, PORT: String(PORT), NODE_ENV: '', HIPAA_GATE: 'off', MFA_SMS_PROVIDER: 'mock',
      MAINTENANCE_REBUILD_ENABLED: 'false', RATE_LIMIT: 'on', RATE_LIMIT_MFA_VERIFY_MAX: '3', RATE_LIMIT_SIGNUP_MAX: '100',
      RATE_LIMIT_SIGNIN_MAX: '100', REDIS_URL, ...extraEnv } });
    let out = ''; const t = setTimeout(() => reject(new Error(`app did not start:\n${out.slice(-400)}`)), 60000);
    const onData = (d) => { out += d; if (out.includes('Redis connected') && out.includes('server running on port')) { clearTimeout(t); resolve(() => out); } };
    appProc.stdout.on('data', onData); appProc.stderr.on('data', onData);
    appProc.on('exit', (c) => { clearTimeout(t); reject(new Error(`app exited (${c}):\n${out.slice(-400)}`)); });
  });
}
const stopApp = () => new Promise((resolve) => { if (!appProc) return resolve(); appProc.removeAllListeners('exit'); appProc.on('exit', () => resolve()); appProc.kill('SIGTERM'); appProc = null; });

async function api(method, url, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json: json === null ? {} : json };
}
async function makeUser(userName) {
  const up = await api('POST', '/auth/signup', { body: { firstName: 'Mfa', lastName: 'Redis', userName, email: `${userName}@example.invalid`, password: PW } });
  if (up.status !== 201) throw new Error(`signup failed: ${up.status} ${JSON.stringify(up.json)}`);
  const r = await api('POST', '/auth/signin', { body: { userName, password: PW } });
  return { name: userName, token: r.json.token, id: r.json.results[0].id };
}
const STEP = 30000;
const codeFor = (secret, steps = 0) => totp.codeAt(secret, Date.now() + steps * STEP);
const wrongCodeFor = (secret) => {
  const ok = new Set([-1, 0, 1].map((d) => codeFor(secret, d)));
  for (let n = 0; ; n++) { const c = String(n).padStart(6, '0'); if (!ok.has(c)) return c; }
};
async function settle() { const m = Date.now() % STEP; if (m > 24000) await sleep(STEP - m + 400); }
const verify = (mfaToken, code) => api('POST', '/auth/mfa/verify', { body: { mfaToken, code } });
async function enrol(u, steps = -1) {
  const s = await api('POST', '/auth/mfa/totp/start', { token: u.token, body: {} });
  const c = await api('POST', '/auth/mfa/totp/confirm', { token: u.token, body: { code: codeFor(s.json.secret, steps) } });
  if (c.status !== 200) throw new Error(`enrol failed ${c.status} ${JSON.stringify(c.json)}`);
  return s.json.secret;
}
const signinToken = async (u) => (await api('POST', '/auth/signin', { body: { userName: u.name, password: PW } })).json.mfaToken;

async function main() {
  console.log('MFA with Redis check');
  let rc = null;
  try {
    await startRedis();
    rc = new Redis(REDIS_URL);
    rc.on('error', () => { /* Redis is killed on purpose near the end */ });
    await startApp();
    const users = [];
    for (const n of names) users.push(await makeUser(n));
    const [UA, UB, UC, UD] = users;

    section('One-time codes are claimed in Redis');
    await settle();
    const secA = await enrol(UA, -1);
    let mt = await signinToken(UA);
    const step = totp.timeStepAt();
    let r = await verify(mt, codeFor(secA, 0));
    check('a correct code signs in', r.status === 200 && r.json.token, JSON.stringify(r.json));
    const keys = await rc.keys('oe:mfa:otp:*');
    const mine = keys.filter((k) => k.startsWith(`oe:mfa:otp:${UA.id}:`));
    check('its time step is a key in Redis that expires by itself', mine.length >= 1 && (await rc.pttl(mine[0])) > 0 && (await rc.pttl(mine[0])) <= 120000, mine.join(','));
    check('the key holds no code or secret', mine.every((k) => !k.includes(secA) && !k.includes(codeFor(secA, 0))));
    check('the key names the step', mine.some((k) => k.endsWith(`:${step}`)), mine.join(','));
    r = await verify(mt, codeFor(secA, 0));
    check('the same code again is refused', r.status === 400 && /already used/.test(r.json.error || ''), JSON.stringify(r.json));

    section('Lockout lives in Redis and survives an app restart');
    await settle();
    const secB = await enrol(UB, -1);
    mt = await signinToken(UB);
    const sts = [];
    for (let i = 0; i < 3; i++) sts.push((await verify(mt, wrongCodeFor(secB))).status);
    check('wrong codes: 400 each', sts.every((s) => s === 400), sts.join(','));
    check('the failure counter is a key that expires', (await rc.get(`oe:mfa:fail:${UB.id}`)) === '3' && (await rc.pttl(`oe:mfa:fail:${UB.id}`)) > 0);
    r = await verify(mt, wrongCodeFor(secB));
    check('the per-IP limit on FAILED attempts answers 429 (limit set to 3 here)', r.status === 429 && /Too many wrong verification attempts/.test(r.json.error || ''), JSON.stringify(r.json));
    const rl = await rc.keys('oe:mfa:rl:mfaverify:*');
    check('the per-IP counter is in Redis too', rl.length >= 1 && (await rc.pttl(rl[0])) > 0, rl.join(','));
    // lock this person for real: clear the IP counter, raise the IP limit by restarting with a bigger one
    await stopApp();
    await rc.del(...rl);
    await startApp({ RATE_LIMIT_MFA_VERIFY_MAX: '50' });
    mt = await signinToken(UB);
    const more = [];
    for (let i = 0; i < 3; i++) more.push((await verify(mt, wrongCodeFor(secB))).status);   // 3 earlier + 2 more = 5 -> locked
    check('5 wrong codes in total lock the person (counted across the earlier failures)', more[0] === 400 && more[1] === 400 && more[2] === 429, more.join(','));
    check('the lock is a Redis key of about 15 minutes', (await rc.pttl(`oe:mfa:lock:${UB.id}`)) > 14 * 60000 && (await rc.pttl(`oe:mfa:lock:${UB.id}`)) <= 15 * 60000);
    await stopApp();
    await startApp({ RATE_LIMIT_MFA_VERIFY_MAX: '50' });
    mt = await signinToken(UB);
    r = await verify(mt, codeFor(secB, 0));
    check('after an app restart the person is STILL locked, even with the right code', r.status === 429, `${r.status} ${JSON.stringify(r.json)}`);
    const aud = await q("SELECT action FROM audit_log WHERE user_id=? AND action='MFA_LOCKOUT'", [UB.id]);
    check('the lockout was audited once', aud.length === 1, String(aud.length));

    section('Clearing: a correct code forgets earlier failures');
    await settle();
    const secC = await enrol(UC, -1);
    mt = await signinToken(UC);
    await verify(mt, wrongCodeFor(secC)); await verify(mt, wrongCodeFor(secC));
    check('two failures are counted', (await rc.get(`oe:mfa:fail:${UC.id}`)) === '2');
    r = await verify(mt, codeFor(secC, 0));
    check('a correct code signs in and clears the counter', r.status === 200 && (await rc.get(`oe:mfa:fail:${UC.id}`)) === null, JSON.stringify(r.json));

    section('Redis goes away: sign-in keeps working and a code still works only once');
    await settle();
    const secD = await enrol(UD, -1);
    const mtD = await signinToken(UD);
    redisProc.kill('SIGKILL'); redisProc = null;
    await sleep(800);
    r = await verify(mtD, codeFor(secD, 0));
    check('with Redis down a correct code still signs in', r.status === 200 && r.json.token, JSON.stringify(r.json));
    r = await verify(mtD, codeFor(secD, 0));
    check('...and the same code is still refused (MySQL step record + memory claim)', r.status === 400 && /already used/.test(r.json.error || ''), JSON.stringify(r.json));
    const bad = [];
    const mtD2 = await signinToken(UD);
    for (let i = 0; i < 6; i++) bad.push((await verify(mtD2, wrongCodeFor(secD))).status);
    check('...and the lockout still works from memory', bad.slice(0, 5).every((s) => s === 400) && bad[5] === 429, bad.join(','));
  } catch (e) {
    failed++; console.log(`  ERROR  ${e.stack || e.message}`);
  } finally {
    section('Cleanup');
    try { if (rc) rc.disconnect(); } catch { /* ignore */ }
    await stopApp();
    if (redisProc) redisProc.kill('SIGKILL');
    const deleteUser = require('../db/maintenance/deleteUser');
    for (const n of names) { try { await deleteUser(n, true, () => {}); } catch (e) { console.log(`  could not remove ${n}: ${e.message}`); } }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
}
main();
