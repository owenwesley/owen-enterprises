#!/usr/bin/env node
/**
 * tests/run-all.js   (npm run check)   - 1.11.29
 *
 * Runs EVERY automated check in one go and prints one summary line per suite. It starts its own copies of
 * the server on ports 4110 / 4111 (so the server you normally run is left alone, and no rate limits or
 * weekly maintenance get in the way), runs the suites, then stops them. Uses the database in your .env;
 * the suites only create and remove throwaway test_* users and churches.
 *
 *   server on :4110  HIPAA gate off, rate limits off   -> check, church 1-7
 *   server on :4111  HIPAA gate on, text messages mocked -> hipaa, mfa
 *   no server        -> twilio (local fake), hardening (starts its own)
 *
 *   npm run check                         everything
 *   node tests/run-all.js church7 mfa     only the named suites
 *   npm run check:basic                   the old short pre-release check against the server already running
 *
 * Exit code 0 = every suite passed.
 */
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const root = path.resolve(__dirname, '..');

const SUITES = [
  { name: 'check',     file: 'prerelease-check.js',        server: 'plain' },
  { name: 'church',    file: 'church-role-matrix.js',      server: 'plain' },
  { name: 'church2',   file: 'church-step2.js',            server: 'plain' },
  { name: 'church3',   file: 'church-step3.js',            server: 'plain' },
  { name: 'church4',   file: 'church-announce.js',         server: 'plain' },
  { name: 'church5',   file: 'church-roles.js',            server: 'plain' },
  { name: 'church6',   file: 'church-shared-library.js',   server: 'plain' },
  { name: 'church7',   file: 'church-borrow-extras.js',    server: 'plain' },
  { name: 'hipaa',     file: 'hipaa-gate.js',              server: 'hipaa' },
  { name: 'mfa',       file: 'mfa.js',                     server: 'hipaa' },
  { name: 'twilio',    file: 'twilio-request.js',          server: null },
  { name: 'hardening', file: 'hardening.js',               server: null },
];
const only = process.argv.slice(2);
const todo = only.length ? SUITES.filter((s) => only.includes(s.name)) : SUITES;
if (!todo.length) { console.error('No such suite. Names: ' + SUITES.map((s) => s.name).join(', ')); process.exit(2); }

const SERVERS = {
  plain: { port: 4110, env: { HIPAA_GATE: 'off', RATE_LIMIT: 'off', MAINTENANCE_REBUILD_ENABLED: 'false' } },
  hipaa: { port: 4111, env: { HIPAA_GATE: 'on', MFA_SMS_PROVIDER: 'mock', RATE_LIMIT: 'off', MAINTENANCE_REBUILD_ENABLED: 'false' } },
};
const running = {};
function startServer(kind) {
  if (running[kind]) return running[kind];
  const { port, env } = SERVERS[kind];
  running[kind] = new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), NODE_ENV: '', ...env } });
    let out = '';
    const t = setTimeout(() => reject(new Error(`server :${port} did not start in 60 s:\n${out.slice(-500)}`)), 60000);
    const onData = (d) => { out += d; if (out.includes('server running on port')) { clearTimeout(t); setTimeout(() => resolve({ child, port }), 6000); } };   // a few seconds for start-up jobs
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('exit', (c) => { clearTimeout(t); reject(new Error(`server :${port} exited (${c}):\n${out.slice(-500)}`)); });
  });
  return running[kind];
}
function runSuite(s, base) {
  return new Promise((resolve) => {
    const env = { ...process.env, RATE_LIMIT: 'off' };
    if (base) env.BASE_URL = base;
    if (s.server === 'hipaa' && s.name === 'mfa') env.MFA_SMS_PROVIDER = 'mock';
    const child = spawn(process.execPath, [path.join('tests', s.file)], { cwd: root, env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => resolve({ code, out }));
  });
}

(async () => {
  const results = [];
  try {
    for (const s of todo) {
      let base = null;
      if (s.server) { const r = await startServer(s.server); base = `http://localhost:${r.port}`; }
      process.stdout.write(`▶ ${s.name.padEnd(10)} `);
      const r = await runSuite(s, base);
      const m = /(\d+) passed, (\d+) failed/.exec(r.out);
      const res = { name: s.name, code: r.code, passed: m ? +m[1] : 0, failed: m ? +m[2] : (r.code ? 1 : 0) };
      results.push(res);
      console.log(r.code === 0 ? `${res.passed} passed` : `FAILED (${res.passed} passed, ${res.failed} failed)`);
      if (r.code !== 0) console.log(r.out.split('\n').filter((l) => /FAIL|Error|error/.test(l)).slice(0, 15).map((l) => '     ' + l).join('\n'));
    }
  } catch (e) {
    console.error('\n' + e.message); results.push({ name: 'setup', code: 1, passed: 0, failed: 1 });
  } finally {
    for (const k of Object.keys(running)) { try { (await running[k]).child.kill(); } catch { /* not started */ } }
  }
  const total = results.reduce((a, r) => a + r.passed, 0);
  const bad = results.filter((r) => r.code !== 0);
  console.log(`\n${bad.length ? 'FAILED: ' + bad.map((r) => r.name).join(', ') : 'ALL SUITES PASSED'}  (${total} checks in ${results.length} suites)`);
  process.exit(bad.length ? 1 : 0);
})();
