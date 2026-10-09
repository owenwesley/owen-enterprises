#!/usr/bin/env node
/**
 * tests/church-roles.js   (npm run check:church5)
 *
 * Checks Church step 3 (roles and per-church area switches) against the RUNNING server, like tests/church-role-matrix.js:
 *   - roles: only the owner sets them; a leader posts announcements and approves / removes ordinary members,
 *     treasurer and mission leader have no extra access, nobody can make an owner this way,
 *   - area switches: owner only, enforced for everyone (the owner too), sharing erased when switched off.
 *
 *   1. Start the server and wait about 10 seconds.
 *   2. From the project root:  node tests/church-roles.js
 *
 * Creates throwaway users named testchr_<time>_a..f, one admin among them, and
 * throwaway churches, and removes them at the end. Run it against test data.
 * Exit code 0 = all checks passed, 1 = a failure.
 */
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const PW = 'Chk-Pass-123!';
const stamp = Date.now();
const names = ['a', 'b', 'c', 'd', 'e', 'f'].reduce((o, k) => ({ ...o, [k]: `testchr_${stamp}_${k}` }), {});

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
  const up = await api('POST', '/auth/signup', { body: { firstName: first, lastName: 'Steproles', userName, email: `${userName}@example.invalid`, password: PW } });
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
  console.log(`Church roles and area switches check against ${BASE}`);
  const created = { churchIds: [] };
  try {
    const A = await makeUser(names.a, 'Alice');   // owner
    const B = await makeUser(names.b, 'Bob');     // becomes leader
    const C = await makeUser(names.c, 'Carol');   // ordinary member, later treasurer
    const D = await makeUser(names.d, 'Dave');    // outsider
    const E = await makeUser(names.e, 'Erin');    // second leader / mission leader
    const F = await makeUser(names.f, 'Frank');   // admin
    makeAdmin(F.name);
    const adminTok = (await api('POST', '/auth/signin', { body: { userName: F.name, password: PW } })).json.token;

    const mk = await api('POST', `/church/create/${A.id}`, { token: A.token, body: { name: `Roles ${stamp}`, missionStatement: '' } });
    const cid = mk.json.churchId; created.churchIds.push(cid);
    await api('POST', `/admin/churches/${cid}/status`, { token: adminTok, body: { status: 'approved' } });
    const code = (await api('GET', `/church/mine/${A.id}`, { token: A.token })).json.results.find((r) => r.churchId === cid).joinCode;
    async function join(user, first) {
      await api('POST', `/church/join/${user.id}`, { token: user.token, body: { joinCode: code } });
      const m = (await api('GET', `/church/${cid}/members/${A.id}`, { token: A.token })).json.results.find((x) => x.name.startsWith(first));
      return m.memberId;
    }
    const approve = (m) => api('POST', `/church/${cid}/members/approve/${A.id}`, { token: A.token, body: { memberId: m } });
    const mB = await join(B, 'Bob'); await approve(mB);
    const mC = await join(C, 'Carol'); await approve(mC);
    const mE = await join(E, 'Erin'); await approve(mE);
    const setRole = (by, m, role) => api('POST', `/church/${cid}/members/role/${by.id}`, { token: by.token, body: { memberId: m, role } });
    const mine = async (u) => (await api('GET', `/church/mine/${u.id}`, { token: u.token })).json.results.find((r) => r.churchId === cid);
    const roleOf = async (m) => (await q(dbs.church, 'SELECT role FROM members WHERE id=?', [m]))[0].role;
    const post = (u, title) => api('POST', `/church/${cid}/announcements/post/${u.id}`, { token: u.token, body: { title, body: 'x' } });

    section('Defaults');
    const mA = await mine(A);
    check('/mine: areas all on by default', JSON.stringify(mA.areas) === JSON.stringify({ announcements: true, library: true, contacts: true }), JSON.stringify(mA.areas));
    check('/mine: owner permissions include members.roles and areas.manage', mA.permissions.includes('members.roles') && mA.permissions.includes('areas.manage'));
    check('/mine: a plain member has neither', !(await mine(C)).permissions.includes('members.roles') && !(await mine(C)).permissions.includes('announcements.post'));
    check('a plain member cannot post (403)', (await post(C, 'no')).status === 403);

    section('Who may set roles');
    check('a plain member cannot set roles (403)', (await setRole(C, mB, 'leader')).status === 403);
    check('an outsider cannot (403)', (await setRole(D, mB, 'leader')).status === 403);
    check('owner makes Bob a leader (200)', (await setRole(A, mB, 'leader')).status === 200);
    check('the role is stored', (await roleOf(mB)) === 'leader');
    check('an unknown role is refused (400)', (await setRole(A, mC, 'bishop')).status === 400);
    check("'owner' cannot be given this way (400)", (await setRole(A, mC, 'owner')).status === 400 && (await roleOf(mC)) === 'member');
    check('the owner cannot change their own role (404)', (await setRole(A, mA.churchId && (await q(dbs.church, 'SELECT id FROM members WHERE church_id=? AND user_id=?', [cid, A.id]))[0].id, 'member')).status === 404);
    check('a leader cannot set roles (403)', (await setRole(B, mC, 'leader')).status === 403);
    check('a person still waiting cannot be given a role (404)', await (async () => {
      const w = await api('POST', '/auth/signup', { body: { firstName: 'Wendy', lastName: 'X', userName: `${names.a}_w`, email: `${names.a}_w@example.invalid`, password: PW } });
      const sign = await api('POST', '/auth/signin', { body: { userName: `${names.a}_w`, password: PW } });
      const u = sign.json.results[0];
      await api('POST', `/church/join/${u.id}`, { token: sign.json.token, body: { joinCode: code } });
      const wid = (await q(dbs.church, 'SELECT id FROM members WHERE church_id=? AND user_id=?', [cid, u.id]))[0].id;
      const r = (await setRole(A, wid, 'leader')).status;
      const deleteUser = require('../db/maintenance/deleteUser');
      await deleteUser(`${names.a}_w`, true, () => {});
      return r === 404;
    })());

    section('What a leader can do');
    const bMine = await mine(B);
    check('/mine: leader may post and manage members, not set roles', bMine.permissions.includes('announcements.post') && bMine.permissions.includes('members.manage') && !bMine.permissions.includes('members.roles'));
    const p1 = await post(B, 'From the leader');
    check('leader posts an announcement (201)', p1.status === 201);
    check('leader edits it (200)', (await api('POST', `/church/${cid}/announcements/edit/${B.id}`, { token: B.token, body: { announcementId: p1.json.announcementId, title: 'Edited', body: '' } })).status === 200);
    check('leader deletes it (200)', (await api('POST', `/church/${cid}/announcements/delete/${B.id}`, { token: B.token, body: { announcementId: p1.json.announcementId } })).status === 200);
    check('leader cannot edit the mission (403)', (await api('POST', `/church/${cid}/edit/${B.id}`, { token: B.token, body: { missionStatement: 'x' } })).status === 403);
    check('leader cannot reset the join code (403)', (await api('POST', `/church/${cid}/joincode/reset/${B.id}`, { token: B.token, body: {} })).status === 403);
    check('leader cannot hand over the church (403)', (await api('POST', `/church/${cid}/transfer/${B.id}`, { token: B.token, body: { memberId: mC, password: PW } })).status === 403);
    check('leader cannot change area switches (403)', (await api('POST', `/church/${cid}/areas/${B.id}`, { token: B.token, body: { library: false } })).status === 403);
    const mD = await join(D, 'Dave');
    const lSees = (await api('GET', `/church/${cid}/members/${B.id}`, { token: B.token })).json.results;
    check('leader sees the person waiting', lSees.some((x) => x.status === 'pending' && x.name.startsWith('Dave')));
    check('a plain member does not see waiting people', !(await api('GET', `/church/${cid}/members/${C.id}`, { token: C.token })).json.results.some((x) => x.status === 'pending'));
    check('leader approves Dave (200)', (await api('POST', `/church/${cid}/members/approve/${B.id}`, { token: B.token, body: { memberId: mD } })).status === 200);
    check('leader removes the ordinary member Dave (200)', (await api('POST', `/church/${cid}/members/remove/${B.id}`, { token: B.token, body: { memberId: mD } })).status === 200);
    await setRole(A, mE, 'leader');
    check('leader cannot remove another leader (404, still active)', (await api('POST', `/church/${cid}/members/remove/${B.id}`, { token: B.token, body: { memberId: mE } })).status === 404 && (await q(dbs.church, 'SELECT status FROM members WHERE id=?', [mE]))[0].status === 'active');
    check('leader cannot remove the owner (404)', (await api('POST', `/church/${cid}/members/remove/${B.id}`, { token: B.token, body: { memberId: (await q(dbs.church, 'SELECT id FROM members WHERE church_id=? AND role="owner"', [cid]))[0].id } })).status === 404);

    section('Treasurer and mission leader: labels only for now');
    check('owner makes Carol treasurer (200)', (await setRole(A, mC, 'treasurer')).status === 200);
    check('owner makes Erin a mission leader (200)', (await setRole(A, mE, 'missions')).status === 200);
    const cMine = await mine(C);
    check('treasurer has exactly the member permissions', JSON.stringify(cMine.permissions) === JSON.stringify((await mine(E)).permissions) && !cMine.permissions.includes('announcements.post') && !cMine.permissions.includes('members.manage'));
    check('treasurer cannot post (403)', (await post(C, 'no')).status === 403);
    check('treasurer can still read announcements (200)', (await api('GET', `/church/${cid}/announcements/${C.id}`, { token: C.token })).status === 200);
    check('treasurer can still switch contact sharing (200)', (await api('POST', `/church/${cid}/contact/share/${C.id}`, { token: C.token, body: { share: true, phone: '1', address: '' } })).status === 200);
    check('treasurer can leave (200)', (await api('POST', `/church/${cid}/leave/${C.id}`, { token: C.token, body: {} })).status === 200);
    check('leaving erased the stored phone', (await q(dbs.church, 'SELECT contactPhone, shareContact FROM members WHERE church_id=? AND user_id=?', [cid, C.id]))[0].contactPhone === '');
    check('owner removes a mission leader (200)', (await api('POST', `/church/${cid}/members/remove/${A.id}`, { token: A.token, body: { memberId: mE } })).status === 200);
    check('a removed mission leader is shut out (403)', (await api('GET', `/church/${cid}/announcements/${E.id}`, { token: E.token })).status === 403);

    section('Hand-over still works with roles');
    const mB2 = mB;
    check('owner hands the church to the leader Bob (200)', (await api('POST', `/church/${cid}/transfer/${A.id}`, { token: A.token, body: { memberId: mB2, password: PW } })).status === 200);
    check('Bob is owner, Alice a plain member', (await roleOf(mB)) === 'owner' && (await q(dbs.church, 'SELECT role FROM members WHERE church_id=? AND user_id=?', [cid, A.id]))[0].role === 'member');
    check('exactly one owner', (await q(dbs.church, 'SELECT COUNT(*) AS n FROM members WHERE church_id=? AND role="owner"', [cid]))[0].n === 1);
    check('Alice (now a member) cannot post (403)', (await post(A, 'no')).status === 403);
    await api('POST', `/church/${cid}/transfer/${B.id}`, { token: B.token, body: { memberId: (await q(dbs.church, 'SELECT id FROM members WHERE church_id=? AND user_id=?', [cid, A.id]))[0].id, password: PW } });
    check('and handed back to Alice', (await q(dbs.church, 'SELECT role FROM members WHERE church_id=? AND user_id=?', [cid, A.id]))[0].role === 'owner');
    // Re-add people for the area checks: Bob (member again), Carol back.
    await api('POST', `/church/join/${C.id}`, { token: C.token, body: { joinCode: code } });
    const mC2 = (await q(dbs.church, 'SELECT id FROM members WHERE church_id=? AND user_id=?', [cid, C.id]))[0].id;
    await approve(mC2);
    check('Bob is a plain member again after the hand-back', (await roleOf(mB)) === 'member');
    await setRole(A, mB, 'leader');

    section('Area switches');
    const area = (u, body) => api('POST', `/church/${cid}/areas/${u.id}`, { token: u.token, body });
    check('a member cannot (403)', (await area(C, { library: false })).status === 403);
    check('a leader cannot (403)', (await area(B, { library: false })).status === 403);
    check('an outsider cannot (403)', (await area(E, { library: false })).status === 403);
    check('nothing to change is refused (400)', (await area(A, {})).status === 400);
    // Sharing set up first
    await api('POST', `/church/${cid}/library/share/${C.id}`, { token: C.token, body: { share: true } });
    await api('POST', `/church/${cid}/contact/share/${C.id}`, { token: C.token, body: { share: true, phone: '555-0100', address: '1 Main' } });
    await api('POST', `/church/${cid}/contact/share/${B.id}`, { token: B.token, body: { share: true, phone: '', address: '' } });
    const contactsOf = async (u) => (await api('GET', `/church/contacts/${u.id}`, { token: u.token })).json.results;
    check('before: Bob sees Carol in Contacts', (await contactsOf(B)).some((x) => x.firstName === 'Carol'));

    check('owner switches contacts off (200)', (await area(A, { contacts: false })).status === 200);
    check('/mine shows contacts off, the others on', JSON.stringify((await mine(C)).areas) === JSON.stringify({ announcements: true, library: true, contacts: false }));
    check('Contacts page: nobody listed any more', (await contactsOf(B)).length === 0);
    check('contact sharing is refused for a member (403)', (await api('POST', `/church/${cid}/contact/share/${C.id}`, { token: C.token, body: { share: true } })).status === 403);
    check('the owner is refused too (403)', (await api('POST', `/church/${cid}/contact/share/${A.id}`, { token: A.token, body: { share: true } })).status === 403);
    const rowsC = (await q(dbs.church, 'SELECT shareContact, contactPhone, contactAddress FROM members WHERE church_id=?', [cid]));
    check('every stored phone, address and switch was erased', rowsC.every((r) => r.shareContact === 0 && r.contactPhone === '' && r.contactAddress === ''));
    check('switching contacts back on shares nothing by itself', (await area(A, { contacts: true })).status === 200 && (await contactsOf(B)).length === 0);
    check('Carol must opt in again, and then appears', (await api('POST', `/church/${cid}/contact/share/${C.id}`, { token: C.token, body: { share: true, phone: '', address: '' } })).status === 200 && (await contactsOf(B)).some((x) => x.firstName === 'Carol'));

    check('library is readable before switching off (200)', (await api('GET', `/church/${cid}/library/${B.id}`, { token: B.token })).status === 200);
    check('owner switches library off (200)', (await area(A, { library: false })).status === 200);
    check('catalog is closed to a member (403)', (await api('GET', `/church/${cid}/library/${B.id}`, { token: B.token })).status === 403);
    check('catalog is closed to the owner too (403)', (await api('GET', `/church/${cid}/library/${A.id}`, { token: A.token })).status === 403);
    check('library sharing is refused (403)', (await api('POST', `/church/${cid}/library/share/${C.id}`, { token: C.token, body: { share: true } })).status === 403);
    check('everyone is no longer listed (shareLibrary 0)', (await q(dbs.church, 'SELECT COUNT(*) AS n FROM members WHERE church_id=? AND shareLibrary=1', [cid]))[0].n === 0);
    check('contacts still work while library is off', (await contactsOf(B)).some((x) => x.firstName === 'Carol'));
    await area(A, { library: true });

    const p2 = await post(A, 'Kept while hidden');
    check('owner posts one announcement (201)', p2.status === 201);
    check('owner switches announcements off (200)', (await area(A, { announcements: false })).status === 200);
    check('reading is closed (403)', (await api('GET', `/church/${cid}/announcements/${C.id}`, { token: C.token })).status === 403);
    check('posting is closed even for the owner (403)', (await post(A, 'no')).status === 403);
    check('the announcement was not deleted', (await q(dbs.church, 'SELECT COUNT(*) AS n FROM announcements WHERE church_id=?', [cid]))[0].n === 1);
    check('switching it back on brings it back', (await area(A, { announcements: true })).status === 200 && (await api('GET', `/church/${cid}/announcements/${C.id}`, { token: C.token })).json.results.length === 1);
    check('only the keys sent are changed', JSON.stringify((await mine(A)).areas) === JSON.stringify({ announcements: true, library: true, contacts: true }));
    check('areas do not affect members, roles or leaving', (await area(A, { announcements: false, library: false, contacts: false })).status === 200
      && (await api('GET', `/church/${cid}/members/${C.id}`, { token: C.token })).status === 200
      && (await setRole(A, mB, 'member')).status === 200
      && (await api('GET', `/church/mine/${A.id}`, { token: A.token })).status === 200);
    check('with all areas off the owner still sees the church (/mine permissions kept)', (await mine(A)).permissions.includes('areas.manage'));
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
