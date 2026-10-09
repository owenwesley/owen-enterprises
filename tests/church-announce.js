#!/usr/bin/env node
/**
 * tests/church-announce.js   (npm run check:church4)
 *
 * Checks Church step 3 (shared contact info) against the RUNNING server, like tests/church-role-matrix.js:
 *   - announcements: only the owner posts / edits / deletes, active members read,
 *   - access ends on leave, removal and suspension; deleting a church deletes its announcements.
 *
 *   1. Start the server and wait about 10 seconds.
 *   2. From the project root:  node tests/church-step3.js
 *
 * Creates throwaway users named testchan_<time>_a..f, one admin among them, and
 * throwaway churches, and removes them at the end. Run it against test data.
 * Exit code 0 = all checks passed, 1 = a failure.
 */
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const PW = 'Chk-Pass-123!';
const stamp = Date.now();
const names = ['a', 'b', 'c', 'd', 'e', 'f'].reduce((o, k) => ({ ...o, [k]: `testchan_${stamp}_${k}` }), {});

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
  console.log(`Church announcements check against ${BASE}`);
  const created = { churchIds: [] };
  try {
    const A = await makeUser(names.a, 'Alice');   // owner
    const B = await makeUser(names.b, 'Bob');     // member
    const C = await makeUser(names.c, 'Carol');   // member who leaves
    const D = await makeUser(names.d, 'Dave');    // outsider
    const E = await makeUser(names.e, 'Erin');    // owner of a different church
    const F = await makeUser(names.f, 'Frank');   // admin
    makeAdmin(F.name);
    const adminTok = (await api('POST', '/auth/signin', { body: { userName: F.name, password: PW } })).json.token;

    async function mkChurch(owner, label) {
      const mk = await api('POST', `/church/create/${owner.id}`, { token: owner.token, body: { name: `News ${label} ${stamp}`, missionStatement: '' } });
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
    const list = (u, ch) => api('GET', `/church/${ch.id}/announcements/${u.id}`, { token: u.token });
    const post = (u, ch, body) => api('POST', `/church/${ch.id}/announcements/post/${u.id}`, { token: u.token, body });
    const edit = (u, ch, body) => api('POST', `/church/${ch.id}/announcements/edit/${u.id}`, { token: u.token, body });
    const del = (u, ch, body) => api('POST', `/church/${ch.id}/announcements/delete/${u.id}`, { token: u.token, body });

    section('Starts empty');
    const l0 = await list(B, ch1);
    check('a member sees an empty list (200)', l0.status === 200 && l0.json.results.length === 0, JSON.stringify(l0.json));
    check('no token: 401', (await api('GET', `/church/${ch1.id}/announcements/${B.id}`)).status === 401);
    check("another user's id in the URL is refused (403)", (await api('GET', `/church/${ch1.id}/announcements/${A.id}`, { token: B.token })).status === 403);

    section('Who may post');
    check('a regular member cannot post (403)', (await post(B, ch1, { title: 'Hi', body: 'x' })).status === 403);
    check('an outsider cannot post (403)', (await post(D, ch1, { title: 'Hi', body: 'x' })).status === 403);
    check("another church's owner cannot post here (403)", (await post(E, ch1, { title: 'Hi', body: 'x' })).status === 403);
    check('missing title is refused (400)', (await post(A, ch1, { title: '  ', body: 'x' })).status === 400);
    check('too long a title is refused (400)', (await post(A, ch1, { title: 'x'.repeat(151), body: '' })).status === 400);
    check('too long a message is refused (400)', (await post(A, ch1, { title: 'Hi', body: 'x'.repeat(4001) })).status === 400);
    const p1 = await post(A, ch1, { title: 'Sunday service', body: 'Moved to 10am.\nBring a dish.' });
    check('the owner posts (201)', p1.status === 201 && p1.json.announcementId > 0, JSON.stringify(p1.json));
    await post(A, ch1, { title: 'Second notice', body: '' });

    section('Who may read');
    const lB = await list(B, ch1);
    const first = lB.json.results[0];
    check('a member reads both, newest first', lB.status === 200 && lB.json.results.length === 2 && first.title === 'Second notice', JSON.stringify(lB.json));
    const sun = lB.json.results.find((x) => x.title === 'Sunday service');
    check('author shown by name, line breaks kept', sun.author === 'Alice Steptwo' && sun.body === 'Moved to 10am.\nBring a dish.', JSON.stringify(sun));
    check('no user id or email in the answer', !/user_id|userId|userName|email|password/i.test(JSON.stringify(lB.json)), JSON.stringify(lB.json));
    check('an outsider cannot read (403)', (await list(D, ch1)).status === 403);
    check("another church's owner cannot read (403)", (await list(E, ch1)).status === 403);
    check("the other church has no announcements", (await list(E, ch2)).json.results.length === 0);

    section('Edit and delete');
    check('a member cannot edit (403)', (await edit(B, ch1, { announcementId: sun.announcementId, title: 'Hacked', body: '' })).status === 403);
    check('a member cannot delete (403)', (await del(B, ch1, { announcementId: sun.announcementId })).status === 403);
    check("the other church's owner cannot delete it (403)", (await del(E, ch1, { announcementId: sun.announcementId })).status === 403);
    check("the other church's owner cannot touch it through their own church (404)", (await del(E, ch2, { announcementId: sun.announcementId })).status === 404);
    check('the owner edits (200)', (await edit(A, ch1, { announcementId: sun.announcementId, title: 'Sunday service (updated)', body: 'Now at 11am.' })).status === 200);
    check('edit with no title is refused (400)', (await edit(A, ch1, { announcementId: sun.announcementId, title: '', body: 'x' })).status === 400);
    check('editing a missing one is 404', (await edit(A, ch1, { announcementId: 999999999, title: 'x', body: '' })).status === 404);
    const lAfter = (await list(B, ch1)).json.results.find((x) => x.announcementId === sun.announcementId);
    check('the member sees the change', lAfter.title === 'Sunday service (updated)' && lAfter.body === 'Now at 11am.', JSON.stringify(lAfter));
    const second = (await list(B, ch1)).json.results.find((x) => x.title === 'Second notice');
    check('the owner deletes one (200)', (await del(A, ch1, { announcementId: second.announcementId })).status === 200);
    check('it is gone', (await list(B, ch1)).json.results.length === 1);
    check('deleting it again is 404', (await del(A, ch1, { announcementId: second.announcementId })).status === 404);

    section('Access ends with membership');
    check('Carol can read now', (await list(C, ch1)).status === 200);
    check('Carol leaves (200)', (await api('POST', `/church/${ch1.id}/leave/${C.id}`, { token: C.token, body: {} })).status === 200);
    check('Carol can no longer read (403)', (await list(C, ch1)).status === 403);
    check('the owner removes Bob (200)', (await api('POST', `/church/${ch1.id}/members/remove/${A.id}`, { token: A.token, body: { memberId: mB } })).status === 200);
    check('Bob can no longer read (403)', (await list(B, ch1)).status === 403);
    check('the owner still can', (await list(A, ch1)).status === 200);
    check('admin suspends church one (200)', (await api('POST', `/admin/churches/${ch1.id}/status`, { token: adminTok, body: { status: 'suspended' } })).status === 200);
    check('even the owner cannot read or post while suspended (403)', (await list(A, ch1)).status === 403 && (await post(A, ch1, { title: 'x', body: '' })).status === 403);
    check('reinstating brings them back for the owner', (await api('POST', `/admin/churches/${ch1.id}/status`, { token: adminTok, body: { status: 'approved' } })).status === 200 && (await list(A, ch1)).json.results.length === 1);

    section('Deleting a church deletes its announcements');
    check('rows exist', (await q(dbs.church, 'SELECT COUNT(*) AS n FROM announcements WHERE church_id=?', [ch1.id]))[0].n === 1);
    await q(dbs.church, 'DELETE FROM churches WHERE id=?', [ch1.id]);
    check('and are gone with the church', (await q(dbs.church, 'SELECT COUNT(*) AS n FROM announcements WHERE church_id=?', [ch1.id]))[0].n === 0);
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
