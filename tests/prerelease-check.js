/**
 * tests/prerelease-check.js
 *
 * A small pre-release check. It talks to the RUNNING server over HTTP (the same
 * calls the app makes) and, when it can, looks at the database directly to prove
 * nothing was left behind. It never touches your real accounts: it creates
 * throwaway users named testchk_<time>_a / _b / _doc and removes them at the end,
 * even if a check fails.
 *
 *   1. Start the server (npm run dev, or npm run server) and wait for
 *      "OwenEnterprises server running on port 4000" plus about 10 seconds.
 *   2. From the project root:   node tests/prerelease-check.js
 *      (npm run check does the same). Another address:  BASE_URL=http://localhost:4001
 *
 * What it checks
 *   - (production server only) a browser refresh on /meetings, /doctor and /admin
 *     gets the app, not the API's JSON error; skipped on the dev server
 *   - sign-up and sign-in, wrong password refused
 *   - weights: 95 adds keep only the newest 90 (the cap), oldest 5 gone
 *   - one patient cannot read another patient's weights (403), no token (401)
 *   - DELETE /auth/account: no token 401, missing or wrong password 400 (nothing
 *     deleted), a doctor is refused 403, a patient succeeds, then the old token
 *     is 401, sign-in fails and (with database access) no weights rows remain
 *   - INFO only: whether the users table is currently in rebuilt order (ids 1..N,
 *     test accounts last). New sign-ups legitimately break that between rebuilds.
 *
 * It does NOT run the weekly rebuild: that renumbers real ids and signs everyone
 * out. Run  node db/maintenance/scheduleRebuild.js --now  yourself after a backup.
 *
 * Needs Node 18 or newer (built-in fetch). Exit code 0 = all passed, 1 = a failure.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const PW = 'Chk-Pass-123!';
const stamp = Date.now();
const names = { a: `testchk_${stamp}_a`, b: `testchk_${stamp}_b`, doc: `testchk_${stamp}_doc` };

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}${detail ? '  -> ' + detail : ''}`); }
}
function info(label) { console.log(`  INFO  ${label}`); }
function section(t) { console.log(`\n${t}`); }

async function api(method, url, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json: json || {} };
}

async function makePatient(userName) {
  const up = await api('POST', '/auth/signup', { body: {
    firstName: 'Chk', lastName: 'Tester', userName, email: `${userName}@example.invalid`, password: PW } });
  if (up.status !== 201) throw new Error(`signup failed for ${userName}: ${up.status} ${JSON.stringify(up.json)}`);
  return signIn(userName);
}
async function signIn(userName, password = PW) {
  const r = await api('POST', '/auth/signin', { body: { userName, password } });
  const user = r.json.results && r.json.results[0];
  return { status: r.status, token: r.json.token, id: user && user.id, json: r.json };
}

// "MM-DD-YY" (what the API returns) or "YYYY-MM-DD" -> "YYYY-MM-DD"
function isoKey(d) {
  const m = /^(\d\d)-(\d\d)-(\d\d)$/.exec(d);
  return m ? `20${m[3]}-${m[1]}-${m[2]}` : d;
}
function dayString(i) {
  return new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10);
}

// Optional direct database access (read-only checks plus cleanup).
let dbs = null;
let deleteUserModule = null;
try {
  dbs = require('../db/db');
  deleteUserModule = require('../db/maintenance/deleteUser');
} catch (e) {
  info(`no direct database access (${e.message}); database checks will be skipped`);
}
async function dbRows(pool, sql, params) {
  const [rows] = await pool.promise().query(sql, params);
  return rows;
}

async function main() {
  console.log(`Pre-release check against ${BASE}`);

  section('Server');
  let probe;
  try { probe = await api('POST', '/auth/signin', { body: {} }); }
  catch (e) { console.log(`  FAIL  cannot reach ${BASE} (${e.message}). Is the server running?`); process.exit(1); }
  check('server answers; empty sign-in is refused with 400', probe.status === 400, `status ${probe.status}`);

  section('Browser refresh on pages that share a name with an API prefix');
  const pageHeaders = { Accept: 'text/html,application/xhtml+xml' };
  const home = await fetch(BASE + '/', { headers: pageHeaders }).then(async (r) => ({ type: r.headers.get('content-type') || '', text: await r.text() })).catch(() => null);
  if (home && /text\/html/.test(home.type) && /id="root"/.test(home.text)) {
    for (const p of ['/meetings', '/doctor', '/doctor/clinic', '/admin']) {
      const r = await fetch(BASE + p, { headers: pageHeaders });
      const t = await r.text();
      check(`browser refresh on ${p} gets the app, not API JSON`, r.status === 200 && /id="root"/.test(t), `status ${r.status}, starts ${JSON.stringify(t.slice(0, 40))}`);
    }
    const apiCall = await api('GET', '/meetings/1');
    check('the same path without text/html still reaches the API (401 without a token)', apiCall.status === 401, `status ${apiCall.status}`);
  } else {
    info('skipped: this server is not serving client/build (normal for npm run dev). To run these checks: build the client, then NODE_ENV=production npm start.');
  }

  section('Sign-up and sign-in');
  const A = await makePatient(names.a);
  const B = await makePatient(names.b);
  check('patient A signs in and gets a token and an id', A.status === 200 && !!A.token && Number.isInteger(A.id));
  check('patient B signs in', B.status === 200 && !!B.token && Number.isInteger(B.id) && B.id !== A.id);
  const bad = await signIn(names.a, 'wrong-password');
  check('wrong password at sign-in is refused (400)', bad.status === 400, `status ${bad.status}`);

  section('Weights: 95 adds keep the newest 90');
  let addFailures = 0;
  for (let i = 0; i < 95; i++) {
    const r = await api('POST', `/bgtracker/weights/add/${A.id}`, { token: A.token,
      body: { date: dayString(i), kg: 70 + (i % 5), lbs: 154 + (i % 5), bmi: 24 } });
    if (r.status !== 200) addFailures++;
  }
  check('all 95 adds were accepted', addFailures === 0, `${addFailures} failed`);
  const list = await api('GET', `/bgtracker/weights/${A.id}`, { token: A.token });
  const rows = list.json.results || [];
  const have = new Set(rows.map((r) => isoKey(r.date)));
  check('exactly 90 rows remain', rows.length === 90, `got ${rows.length}`);
  check('the 5 oldest dates were trimmed', [0, 1, 2, 3, 4].every((i) => !have.has(dayString(i))));
  check('the newest date is kept', have.has(dayString(94)));
  check('the 90th-newest date is kept', have.has(dayString(5)));

  section("Ownership: one patient cannot touch another's data");
  const peek = await api('GET', `/bgtracker/weights/${A.id}`, { token: B.token });
  check("patient B reading patient A's weights is refused (403)", peek.status === 403, `status ${peek.status}`);
  const anon = await api('GET', `/bgtracker/weights/${A.id}`);
  check('no token is refused (401)', anon.status === 401, `status ${anon.status}`);

  section('Delete my account: refusals leave everything in place');
  const noTok = await api('DELETE', '/auth/account', { body: { password: PW } });
  check('no token -> 401', noTok.status === 401, `status ${noTok.status}`);
  const noPw = await api('DELETE', '/auth/account', { token: B.token, body: {} });
  check('missing password -> 400', noPw.status === 400, `status ${noPw.status}`);
  const wrongPw = await api('DELETE', '/auth/account', { token: B.token, body: { password: 'nope' } });
  check('wrong password -> 400 with a password message',
    wrongPw.status === 400 && !!(wrongPw.json.fieldErrors && wrongPw.json.fieldErrors.password), `status ${wrongPw.status}`);
  const still = await signIn(names.b);
  check('patient B can still sign in after the refused deletes', still.status === 200);

  const docUp = await api('POST', '/auth/signup', { body: {
    firstName: 'Chk', lastName: 'Doctor', userName: names.doc, email: `${names.doc}@example.invalid`,
    password: PW, role: 'doctor', licenseNumber: 'CHK-0000', specialty: 'test' } });
  if (docUp.status === 201) {
    const D = await signIn(names.doc);
    if (D.status === 200 && D.token) {
      const dd = await api('DELETE', '/auth/account', { token: D.token, body: { password: PW } });
      check('a doctor account is refused (403)', dd.status === 403, `status ${dd.status}`);
      const dStill = await signIn(names.doc);
      check('the doctor can still sign in', dStill.status === 200);
    } else {
      info(`pending doctor cannot sign in (status ${D.status}); the doctor refusal was not checked`);
    }
  } else {
    info(`doctor sign-up returned ${docUp.status}; the doctor refusal was not checked`);
  }
  info('admin refusal is not checked here (admins can only be made from the command line)');

  section('Delete my account: success');
  const okDel = await api('DELETE', '/auth/account', { token: A.token, body: { password: PW } });
  check('patient A deletes with the right password (200)', okDel.status === 200, `status ${okDel.status} ${JSON.stringify(okDel.json)}`);
  const oldTok = await api('GET', `/bgtracker/weights/${A.id}`, { token: A.token });
  check('the old token is rejected (401)', oldTok.status === 401, `status ${oldTok.status}`);
  const reSign = await signIn(names.a);
  check('signing in as the deleted user fails (400)', reSign.status === 400, `status ${reSign.status}`);
  if (dbs) {
    try {
      const w = await dbRows(dbs.bgtracker, 'SELECT COUNT(*) AS n FROM weights WHERE user_id=?', [A.id]);
      check('no weights rows left for the deleted user', Number(w[0].n) === 0, `${w[0].n} left`);
      const u = await dbRows(dbs.owenenterprises, 'SELECT COUNT(*) AS n FROM users WHERE userName=?', [names.a]);
      check('the users row is gone', Number(u[0].n) === 0);
      const fp = await dbRows(dbs.owenenterprises, 'SELECT COUNT(*) AS n FROM feature_preferences WHERE user_id=?', [A.id]);
      check('no feature_preferences row left', Number(fp[0].n) === 0);
    } catch (e) { info(`database checks skipped (${e.message})`); }
  }

  section('Users table layout (information only)');
  if (dbs) {
    try {
      const users = await dbRows(dbs.owenenterprises, 'SELECT id, userName FROM users ORDER BY id', []);
      const contiguous = users.every((u, i) => u.id === i + 1);
      const firstTest = users.findIndex((u) => /^test/i.test(u.userName));
      const testLast = firstTest === -1 || users.slice(firstTest).every((u) => /^test/i.test(u.userName));
      info(`${users.length} users; ids 1..N with no gaps: ${contiguous ? 'yes' : 'no'}; test accounts all last: ${testLast ? 'yes' : 'no'}`);
      info('"no" is normal between weekly rebuilds (deletes leave gaps, new sign-ups go after test accounts)');
    } catch (e) { info(`skipped (${e.message})`); }
  } else {
    info('skipped (no database access)');
  }
}

async function cleanup() {
  if (!deleteUserModule) return;
  for (const name of Object.values(names)) {
    try {
      await deleteUserModule(name, true, () => {});
      console.log(`  cleanup: removed ${name}`);
    } catch (e) {
      if (!/no user named/.test(e.message)) console.log(`  cleanup: could not remove ${name}: ${e.message}`);
    }
  }
}

main()
  .catch((e) => { failed++; console.log(`\n  FAIL  unexpected error: ${e.message}`); })
  .then(async () => {
    console.log('\nCleanup');
    await cleanup();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
