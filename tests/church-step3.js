#!/usr/bin/env node
/**
 * tests/church-step3.js   (npm run check:church3)
 *
 * Checks Church step 3 (shared contact info) against the RUNNING server, like tests/church-role-matrix.js:
 *   - contact sharing (opt-in, what is and is not exposed, live list in Contacts),
 *   - it disappears on switch-off, leave, removal and suspension.
 *
 *   1. Start the server and wait about 10 seconds.
 *   2. From the project root:  node tests/church-step3.js
 *
 * Creates throwaway users named testchu3_<time>_a..f, one admin among them, and
 * throwaway churches, and removes them at the end. Run it against test data.
 * Exit code 0 = all checks passed, 1 = a failure.
 */
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const PW = 'Chk-Pass-123!';
const stamp = Date.now();
const names = ['a', 'b', 'c', 'd', 'e', 'f'].reduce((o, k) => ({ ...o, [k]: `testchu3_${stamp}_${k}` }), {});

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}${detail ? '  -> ' + detail : ''}`); }
}
const section = (t) => console.log(`\n${t}`);

async function api(method, url, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json: json || {} };
}
async function makeUser(userName, first) {
  const up = await api('POST', '/auth/signup', { body: { firstName: first, lastName: 'Steptwo', userName, email: `${userName}@example.invalid`, password: PW } });
  if (up.status !== 201) throw new Error(`signup failed for ${userName}: ${up.status} ${JSON.stringify(up.json)}`);
  const r = await api('POST', '/auth/signin', { body: { userName, password: PW } });
  const u = r.json.results && r.json.results[0];
  return { name: userName, token: r.json.token, id: u && u.id };
}

const dbs = require('../db/db');
const q = async (pool, sql, params) => (await pool.promise().query(sql, params))[0];
const root = path.resolve(__dirname, '..');
const makeAdmin = (...args) => execFileSync('node', [path.resolve(root, 'db/makeAdmin.js'), ...args], { encoding: 'utf8', cwd: root });

async function cleanup(created) {
  section('Cleanup');
  try {
    for (const id of created.churchIds) await q(dbs.church, 'DELETE FROM churches WHERE id=?', [id]);
    const deleteUser = require('../db/maintenance/deleteUser');
    // The tool refuses to delete the last admin, so demote the test admin first.
    try { makeAdmin(names.f, 'revoke'); } catch { /* not promoted */ }
    for (const n of Object.values(names)) {
      try { await deleteUser(n, true, () => {}); console.log(`  cleanup: removed ${n}`); }
      catch (e) { if (!/no user named/.test(e.message)) console.log(`  cleanup: could not remove ${n}: ${e.message}`); }
    }
  } catch (e) { console.log(`  cleanup problem: ${e.message}`); }
}

async function main() {
  console.log(`Church step 3 check against ${BASE}`);
  const created = { churchIds: [] };
  try {
    const A = await makeUser(names.a, 'Alice');   // owner
    const B = await makeUser(names.b, 'Bob');     // member who shares
    const C = await makeUser(names.c, 'Carol');   // member who never shares
    const D = await makeUser(names.d, 'Dave');    // outsider
    const E = await makeUser(names.e, 'Erin');    // member of a different church
    const F = await makeUser(names.f, 'Frank');   // admin
    makeAdmin(F.name);
    const adminTok = (await api('POST', '/auth/signin', { body: { userName: F.name, password: PW } })).json.token;

    async function mkChurch(owner, label) {
      const mk = await api('POST', `/church/create/${owner.id}`, { token: owner.token, body: { name: `Step3 ${label} ${stamp}`, missionStatement: '' } });
      const id = mk.json.churchId; created.churchIds.push(id);
      await api('POST', `/admin/churches/${id}/status`, { token: adminTok, body: { status: 'approved' } });
      const code = (await api('GET', `/church/mine/${owner.id}`, { token: owner.token })).json.results.find((r) => r.churchId === id).joinCode;
      return { id, code };
    }
    async function joinAndApprove(owner, ch, user, first) {
      await api('POST', `/church/join/${user.id}`, { token: user.token, body: { joinCode: ch.code } });
      const m = (await api('GET', `/church/${ch.id}/members/${owner.id}`, { token: owner.token })).json.results.find((x) => x.name.startsWith(first));
      await api('POST', `/church/${ch.id}/members/approve/${owner.id}`, { token: owner.token, body: { memberId: m.memberId } });
      return m.memberId;
    }
    const ch1 = await mkChurch(A, 'One');
    const ch2 = await mkChurch(E, 'Two');
    const mB = await joinAndApprove(A, ch1, B, 'Bob');
    await joinAndApprove(A, ch1, C, 'Carol');
    const contactsOf = async (u) => (await api('GET', `/church/contacts/${u.id}`, { token: u.token }));
    const share = (u, ch, body) => api('POST', `/church/${ch.id}/contact/share/${u.id}`, { token: u.token, body });

    section('Off by default');
    const mineB = (await api('GET', `/church/mine/${B.id}`, { token: B.token })).json.results[0];
    check('/mine says shareContact false with empty phone and address', mineB.shareContact === false && mineB.contactPhone === '' && mineB.contactAddress === '');
    check('nobody shared: Alice sees an empty list (200)', (await contactsOf(A)).status === 200 && (await contactsOf(A)).json.results.length === 0);
    check('no token: 401', (await api('GET', `/church/contacts/${A.id}`)).status === 401);
    check("another user's id in the URL is refused (403)", (await api('GET', `/church/contacts/${A.id}`, { token: B.token })).status === 403);

    section('Who may switch it on');
    check('an outsider cannot (403)', (await share(D, ch1, { share: true })).status === 403);
    check("the owner cannot switch it on for Bob (403)", (await api('POST', `/church/${ch1.id}/contact/share/${B.id}`, { token: A.token, body: { share: true } })).status === 403);
    check('too long a phone is refused (400)', (await share(B, ch1, { share: true, phone: 'x'.repeat(51) })).status === 400);
    check('too long an address is refused (400)', (await share(B, ch1, { share: true, address: 'x'.repeat(501) })).status === 400);

    section('Sharing, and exactly what is visible');
    const on = await share(B, ch1, { share: true, phone: '555-0142', address: '12 Mission Rd' });
    check('Bob switches it on (200)', on.status === 200 && on.json.shareContact === true, JSON.stringify(on.json));
    const aSees = await contactsOf(A);
    const bc = aSees.json.results[0];
    check('Alice sees exactly one contact: Bob', aSees.json.results.length === 1 && bc.firstName === 'Bob' && bc.lastName === 'Steptwo', JSON.stringify(aSees.json));
    check('with his account email, phone, address and church name', bc.email === `${B.name}@example.invalid` && bc.phoneNum === '555-0142' && bc.address === '12 Mission Rd' && bc.church === `Step3 One ${stamp}`, JSON.stringify(bc));
    check('no user id, user name or password in the answer', !/user_id|userId|userName|password|"id"/.test(JSON.stringify(aSees.json)), JSON.stringify(aSees.json));
    check('Carol (a member, not sharing) also sees Bob', (await contactsOf(C)).json.results.length === 1);
    check('Bob does not see himself', (await contactsOf(B)).json.results.length === 0);
    check('Carol is not listed (she did not share)', !JSON.stringify(aSees.json).includes('Carol'));
    check('an outsider (Dave) sees nothing', (await contactsOf(D)).json.results.length === 0);
    check('a member of ANOTHER church (Erin) sees nothing', (await contactsOf(E)).json.results.length === 0);
    check('Bob\'s own contacts table was NOT written to', (await q(dbs.communitylibrary, 'SELECT COUNT(*) AS n FROM contacts WHERE user_id IN (?,?,?)', [A.id, B.id, C.id]))[0].n === 0);
    const mineB2 = (await api('GET', `/church/mine/${B.id}`, { token: B.token })).json.results[0];
    check('/mine shows the saved phone and address', mineB2.shareContact === true && mineB2.contactPhone === '555-0142' && mineB2.contactAddress === '12 Mission Rd');
    check("Bob's MFA phone is not involved (only the typed phone is shown)", bc.phoneNum === '555-0142');
    check('Bob updates his phone (200) and Alice sees the new one', (await share(B, ch1, { share: true, phone: '555-0199', address: '' })).status === 200 && (await contactsOf(A)).json.results[0].phoneNum === '555-0199');
    check("library catalog is still separate (no email there)", !/@example/.test(JSON.stringify((await api('GET', `/church/${ch1.id}/library/${A.id}`, { token: A.token })).json)));

    section('Switching off');
    check('Bob switches it off (200)', (await share(B, ch1, { share: false, phone: '555-0199', address: 'keep?' })).status === 200);
    check('he disappears from Alice\'s contacts', (await contactsOf(A)).json.results.length === 0);
    const row = (await q(dbs.church, 'SELECT shareContact, contactPhone, contactAddress FROM members WHERE church_id=? AND user_id=?', [ch1.id, B.id]))[0];
    check('the stored phone and address are erased', row.shareContact === 0 && row.contactPhone === '' && row.contactAddress === '');

    section('Leave, removal, suspension');
    await share(B, ch1, { share: true, phone: '555-0100', address: 'A St' });
    check('before leaving, Alice sees Bob', (await contactsOf(A)).json.results.length === 1);
    check('Bob leaves (200)', (await api('POST', `/church/${ch1.id}/leave/${B.id}`, { token: B.token, body: {} })).status === 200);
    check('Bob is gone from Alice\'s contacts at once', (await contactsOf(A)).json.results.length === 0);
    const row2 = (await q(dbs.church, 'SELECT shareContact, contactPhone, contactAddress FROM members WHERE church_id=? AND user_id=?', [ch1.id, B.id]))[0];
    check('and his phone and address are erased', row2.shareContact === 0 && row2.contactPhone === '' && row2.contactAddress === '');
    const mB2 = await joinAndApprove(A, ch1, B, 'Bob');
    check('coming back: still not shared until he switches it on', (await contactsOf(A)).json.results.length === 0 && (await api('GET', `/church/mine/${B.id}`, { token: B.token })).json.results[0].shareContact === false);
    await share(B, ch1, { share: true, phone: '555-0111', address: '' });
    await share(C, ch1, { share: true, phone: '', address: '' });
    const both = (await contactsOf(A)).json.results;
    check('Alice now sees Bob and Carol, sorted by name, empty phone allowed', both.length === 2 && both[0].firstName === 'Bob' && both[1].firstName === 'Carol' && both[1].phoneNum === '');
    await api('POST', `/church/${ch1.id}/members/remove/${A.id}`, { token: A.token, body: { memberId: mB2 } });
    check('the owner removes Bob: he disappears for Carol too', (await contactsOf(C)).json.results.length === 0);
    check('Bob (removed) sees nobody and cannot read the list of members', (await contactsOf(B)).json.results.length === 0);
    check('Bob (removed) cannot switch it on (403)', (await share(B, ch1, { share: true })).status === 403);

    section('Two churches, one person');
    await joinAndApprove(E, ch2, A, 'Alice');
    await joinAndApprove(A, ch1, B, 'Bob');   // Bob back (not sharing)
    await share(C, ch1, { share: true, phone: '', address: '' });
    await share(A, ch2, { share: true, phone: '555-0001', address: '' });
    const eSees = (await contactsOf(E)).json.results;
    check('Erin (church two) sees Alice only', eSees.length === 1 && eSees[0].firstName === 'Alice');
    check("Erin does not see Carol (a different church)", !JSON.stringify(eSees).includes('Carol'));
    await share(A, ch1, { share: true, phone: '555-0001', address: '' });
    await joinAndApprove(A, ch1, E, 'Erin');
    const eSees2 = (await contactsOf(E)).json.results;
    const aRows = eSees2.filter((x) => x.firstName === 'Alice');
    check('Alice shares in both churches: Erin sees her ONCE with both church names', aRows.length === 1 && aRows[0].church.includes('One') && aRows[0].church.includes('Two'), JSON.stringify(eSees2));

    section('Suspension');
    check('admin suspends church one (200)', (await api('POST', `/admin/churches/${ch1.id}/status`, { token: adminTok, body: { status: 'suspended' } })).status === 200);
    check('nobody is shared from a suspended church', (await q(dbs.church, 'SELECT COUNT(*) AS n FROM members WHERE church_id=? AND (shareContact=1 OR contactPhone<>"" OR contactAddress<>"")', [ch1.id]))[0].n === 0);
    check('Carol (removed) sees nothing', (await contactsOf(C)).json.results.length === 0);
    check('Alice (owner of the suspended church) is not listed for Erin via church one', (await contactsOf(E)).json.results.every((x) => !x.church.includes('One')));
  } catch (e) {
    failed++;
    console.log(`  FAIL  unexpected error: ${e.stack || e.message}`);
  } finally {
    await cleanup(created);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
