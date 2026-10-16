#!/usr/bin/env node
/**
 * tests/mfa-lockout.js  (npm run check:mfalockout)  - 1.13.8
 *
 * The wrong-code lockout when there is NO Redis: it is kept in MySQL (table mfa_lockout), so it survives a
 * restart of the app. Also: the half-finished sign-in token is not accepted as a session, and sign-in does
 * not say whether a username exists. Needs the database from your .env and the app running at BASE_URL
 * (default http://localhost:4000) for the last two parts. Creates one throwaway testlock_* user and removes it.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
delete process.env.REDIS_URL;
process.env.MFA_MAX_ATTEMPTS = '3';
let passed = 0, failed = 0;
const check = (l, c, d) => { c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}${d ? '  -> ' + d : ''}`)); };
const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const dbs = require('../db/db');

(async () => {
  await new Promise((r) => setTimeout(r, 2500));          // let db.js create its tables
  const ID = 2147000000 + (Date.now() % 100000);
  let store = require('../utils/mfaStore');
  console.log('\nLockout kept in MySQL');
  check('mode is mysql without REDIS_URL', store.mode() === 'mysql');
  check('nobody is locked at the start', (await store.lockRemainingMs(ID)) === 0);
  const r1 = await store.recordFailure(ID), r2 = await store.recordFailure(ID);
  check('two wrong codes: counted, not locked', r1.count === 1 && r2.count === 2 && !r2.locked);
  const r3 = await store.recordFailure(ID);
  check('third wrong code locks (limit set to 3 here)', r3.locked === true && r3.count === 3);
  check('locked for about 15 minutes', (await store.lockRemainingMs(ID)) > 14 * 60 * 1000);
  delete require.cache[require.resolve('../utils/mfaStore')];     // "restart": a fresh copy with empty memory
  store = require('../utils/mfaStore');
  check('still locked after a restart', (await store.lockRemainingMs(ID)) > 14 * 60 * 1000);
  await store.clearFailures(ID);
  check('a correct code clears it', (await store.lockRemainingMs(ID)) === 0);
  await dbs.owenenterprises.promise().query(
    'INSERT INTO mfa_lockout (user_id, failCount, windowEnd, lockedUntil) VALUES (?, 2, ?, 0)', [ID, Date.now() - 1000]);
  const r4 = await store.recordFailure(ID);
  check('failures older than the window are forgotten', r4.count === 1 && !r4.locked, JSON.stringify(r4));
  await store.clearFailures(ID);

  console.log('\nSign-in');
  const post = async (url, body, headers = {}) => {
    const res = await fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const a = await post('/auth/signin', { userName: 'nobody_' + Date.now(), password: 'x' });
  const jwt = require('jsonwebtoken');
  const SECRET = process.env.JWT_SECRET || 'owenenterprises_secret_change_in_prod';
  const name = 'testlock_' + Date.now();
  await post('/auth/signup', { firstName: 'T', lastName: 'L', userName: name, email: name + '@example.com', password: 'Lock-Pass-123!', role: 'patient' });
  const [[u]] = await dbs.owenenterprises.promise().query('SELECT id, userName FROM users WHERE userName=?', [name]);
  if (u) {
    const b = await post('/auth/signin', { userName: u.userName, password: 'definitely-wrong-' + Date.now() });
    check('unknown user and wrong password get the same message', a.body.error === b.body.error && a.status === b.status, `${a.body.error} / ${b.body.error}`);
    const half = jwt.sign({ id: u.id, userName: u.userName, purpose: 'mfa' }, SECRET, { expiresIn: '10m' });
    const g = await fetch(BASE + '/auth/mfa/status', { headers: { Authorization: 'Bearer ' + half } });
    check('an mfaToken is not accepted as a session', g.status === 401, String(g.status));
    await dbs.owenenterprises.promise().query('DELETE FROM users WHERE id=?', [u.id]);
  } else check('test user could be created', false);

  await dbs.owenenterprises.promise().query('DELETE FROM mfa_lockout WHERE user_id=?', [ID]);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('  ERROR ', e.message); process.exit(1); });
