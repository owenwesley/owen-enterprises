#!/usr/bin/env node
/**
 * tests/church-role-matrix.js
 *
 * Checks the Church module (routes/church.js, middleware/church.js,
 * db/approveChurch.js, the delete-account guard and the chkChurch switch)
 * against the RUNNING server, the same way tests/prerelease-check.js does.
 *
 *   1. Start the server and wait about 10 seconds.
 *   2. From the project root:  node tests/church-role-matrix.js
 *      (another address:  BASE_URL=http://localhost:4001 node tests/church-role-matrix.js)
 *
 * It creates throwaway accounts named testchu_<time>_a / _b / _c / _d and
 * throwaway churches, and removes them at the end even if a check fails. The
 * names start with "test" so the weekly renumber treats them as test accounts.
 * Run it against test data, not a database with real congregations in it: it
 * only touches rows it created, but it does use the real server and database.
 *
 * Roles used:  A = church owner,  B = member,  C = outsider,  D = second applicant.
 * Needs Node 18 or newer. Exit code 0 = all checks passed, 1 = a failure.
 */
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const PW = 'Chk-Pass-123!';
const stamp = Date.now();
const names = ['a', 'b', 'c', 'd'].reduce((o, k) => ({ ...o, [k]: `testchu_${stamp}_${k}` }), {});

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
  const up = await api('POST', '/auth/signup', { body: { firstName: first, lastName: 'Churchtest', userName, email: `${userName}@example.invalid`, password: PW } });
  if (up.status !== 201) throw new Error(`signup failed for ${userName}: ${up.status} ${JSON.stringify(up.json)}`);
  const r = await api('POST', '/auth/signin', { body: { userName, password: PW } });
  const u = r.json.results && r.json.results[0];
  return { name: userName, token: r.json.token, id: u && u.id };
}

const dbs = require('../db/db');
const q = async (pool, sql, params) => (await pool.promise().query(sql, params))[0];
const admin = (...args) => execFileSync('node', [path.resolve(__dirname, '../db/approveChurch.js'), ...args], { encoding: 'utf8' });

async function cleanup(created) {
  section('Cleanup');
  try {
    for (const id of created.churchIds) await q(dbs.church, 'DELETE FROM churches WHERE id=?', [id]);
    const deleteUser = require('../db/maintenance/deleteUser');
    for (const n of Object.values(names)) {
      try { await deleteUser(n, true, () => {}); console.log(`  cleanup: removed ${n}`); }
      catch (e) { if (!/no user named/.test(e.message)) console.log(`  cleanup: could not remove ${n}: ${e.message}`); }
    }
  } catch (e) { console.log(`  cleanup problem: ${e.message}`); }
}

async function main() {
  console.log(`Church role-matrix check against ${BASE}`);
  const created = { churchIds: [] };
  try {
    const A = await makeUser(names.a, 'Alice');
    const B = await makeUser(names.b, 'Bob');
    const C = await makeUser(names.c, 'Carol');
    const D = await makeUser(names.d, 'Dave');
    check('four test users signed in', [A, B, C, D].every((u) => u.token && Number.isInteger(u.id)));

    section('Feature switch (chkChurch)');
    let f = await api('GET', `/owenenterprises/features/${A.id}`, { token: A.token });
    check('Church is OFF by default for a new user', f.json.results && f.json.results.chkChurch === 0, JSON.stringify(f.json));
    await api('POST', `/owenenterprises/features/edit/${A.id}`, { token: A.token, body: { chkBgtracker: 1, chkCommunityLibrary: 1, chkMeetings: 1, chkChurch: 1 } });
    f = await api('GET', `/owenenterprises/features/${A.id}`, { token: A.token });
    check('saving chkChurch=1 turns it on', f.json.results.chkChurch === 1);
    await api('POST', `/owenenterprises/features/edit/${A.id}`, { token: A.token, body: { chkBgtracker: 1, chkCommunityLibrary: 1, chkMeetings: 0 } });
    f = await api('GET', `/owenenterprises/features/${A.id}`, { token: A.token });
    check('an older client saving WITHOUT chkChurch keeps it on', f.json.results.chkChurch === 1 && f.json.results.chkMeetings === 0);

    section('Access without being signed in or as someone else');
    check('no token: 401', (await api('GET', `/church/mine/${A.id}`)).status === 401);
    check("another user's id in the URL: 403", (await api('GET', `/church/mine/${A.id}`, { token: B.token })).status === 403);
    check('a path with no user id: 403', (await api('GET', '/church/mine', { token: A.token })).status === 403);

    section('Requesting a church');
    check('empty name is refused (400)', (await api('POST', `/church/create/${A.id}`, { token: A.token, body: { name: '  ' } })).status === 400);
    check('a 151-character name is refused (400)', (await api('POST', `/church/create/${A.id}`, { token: A.token, body: { name: 'x'.repeat(151) } })).status === 400);
    const mk = await api('POST', `/church/create/${A.id}`, { token: A.token, body: { name: `Test Church ${stamp}`, missionStatement: 'To test things.' } });
    check('A requests a church (201)', mk.status === 201 && Number.isInteger(mk.json.churchId), JSON.stringify(mk.json));
    const churchId = mk.json.churchId;
    created.churchIds.push(churchId);
    const again = await api('POST', `/church/create/${A.id}`, { token: A.token, body: { name: 'Second' } });
    check('a second church while one is waiting is refused (409)', again.status === 409);
    let mine = await api('GET', `/church/mine/${A.id}`, { token: A.token });
    const mineRow = (mine.json.results || []).find((r) => r.churchId === churchId);
    check('A is the owner and the church is pending', mineRow && mineRow.role === 'owner' && mineRow.churchStatus === 'pending');
    check('a pending church shows no join code', mineRow && mineRow.joinCode === undefined);
    check('the owner cannot use a pending church (members: 403)', (await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token })).status === 403);
    const code = (await q(dbs.church, 'SELECT joinCode FROM churches WHERE id=?', [churchId]))[0].joinCode;
    check('the join code is 8 characters', /^[A-Z0-9]{8}$/.test(code), code);
    check('joining a PENDING church looks like an unknown code (404)', (await api('POST', `/church/join/${B.id}`, { token: B.token, body: { joinCode: code } })).status === 404);

    section('Admin approval script');
    check('--list shows the church', admin('--list').includes(`"Test Church ${stamp}"`));
    check('approve works', admin(String(churchId), 'approve').includes('pending -> approved'));
    mine = await api('GET', `/church/mine/${A.id}`, { token: A.token });
    const ownerRow = mine.json.results.find((r) => r.churchId === churchId);
    check('now the owner sees the join code', ownerRow && ownerRow.joinCode === code);

    section('Joining');
    check('unknown code: 404', (await api('POST', `/church/join/${B.id}`, { token: B.token, body: { joinCode: 'NOPE1234' } })).status === 404);
    check('empty code: 400', (await api('POST', `/church/join/${B.id}`, { token: B.token, body: { joinCode: '' } })).status === 400);
    const j = await api('POST', `/church/join/${B.id}`, { token: B.token, body: { joinCode: code.toLowerCase() } });
    check('B joins with the code in lower case (200, pending)', j.status === 200, JSON.stringify(j.json));
    check('joining twice is refused (409)', (await api('POST', `/church/join/${B.id}`, { token: B.token, body: { joinCode: code } })).status === 409);
    check('a pending member cannot see the member list (403)', (await api('GET', `/church/${churchId}/members/${B.id}`, { token: B.token })).status === 403);
    check('a pending member cannot see the church data through /mine join code', (await api('GET', `/church/mine/${B.id}`, { token: B.token })).json.results[0].joinCode === undefined);

    section('Owner approves');
    let list = await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token });
    const pendingB = (list.json.results || []).find((m) => m.status === 'pending');
    check('the owner sees B waiting, by display name', pendingB && pendingB.name === 'Bob Churchtest', JSON.stringify(list.json));
    check('member rows carry no email or user id', list.json.results.every((m) => !('email' in m) && !('user_id' in m) && !('userId' in m)));
    check('a non-owner cannot approve (403)', (await api('POST', `/church/${churchId}/members/approve/${B.id}`, { token: B.token, body: { memberId: pendingB.memberId } })).status === 403);
    check('the outsider cannot approve (403)', (await api('POST', `/church/${churchId}/members/approve/${C.id}`, { token: C.token, body: { memberId: pendingB.memberId } })).status === 403);
    check('owner approves B (200)', (await api('POST', `/church/${churchId}/members/approve/${A.id}`, { token: A.token, body: { memberId: pendingB.memberId } })).status === 200);
    check('approving the same row again is 404', (await api('POST', `/church/${churchId}/members/approve/${A.id}`, { token: A.token, body: { memberId: pendingB.memberId } })).status === 404);

    section('Member and outsider permissions');
    const bList = await api('GET', `/church/${churchId}/members/${B.id}`, { token: B.token });
    check('B (member) can see the active member list', bList.status === 200 && bList.json.results.length === 2);
    check('B marks itself in the list', bList.json.results.some((m) => m.isYou && m.name === 'Bob Churchtest'));
    check('B (member) cannot edit the mission (403)', (await api('POST', `/church/${churchId}/edit/${B.id}`, { token: B.token, body: { missionStatement: 'hacked' } })).status === 403);
    check('B (member) cannot remove anyone (403)', (await api('POST', `/church/${churchId}/members/remove/${B.id}`, { token: B.token, body: { memberId: 1 } })).status === 403);
    check('B never sees the join code', (await api('GET', `/church/mine/${B.id}`, { token: B.token })).json.results[0].joinCode === undefined);
    check('C (outsider) cannot see the member list (403)', (await api('GET', `/church/${churchId}/members/${C.id}`, { token: C.token })).status === 403);
    check('C cannot edit the mission (403)', (await api('POST', `/church/${churchId}/edit/${C.id}`, { token: C.token, body: { missionStatement: 'x' } })).status === 403);
    check('C cannot use B\'s id to read the list (403)', (await api('GET', `/church/${churchId}/members/${B.id}`, { token: C.token })).status === 403);
    check('a church id that does not exist gives the same 403', (await api('GET', `/church/999999/members/${C.id}`, { token: C.token })).status === 403);
    check('a non-numeric church id gives 403', (await api('GET', `/church/abc/members/${C.id}`, { token: C.token })).status === 403);

    section('Mission statement');
    check('owner saves the mission (200)', (await api('POST', `/church/${churchId}/edit/${A.id}`, { token: A.token, body: { missionStatement: 'Serve everyone.' } })).status === 200);
    check('a 2001-character mission is refused (400)', (await api('POST', `/church/${churchId}/edit/${A.id}`, { token: A.token, body: { missionStatement: 'x'.repeat(2001) } })).status === 400);
    check('B reads the new mission', (await api('GET', `/church/mine/${B.id}`, { token: B.token })).json.results[0].missionStatement === 'Serve everyone.');

    section('Leaving, removing, owner rules');
    check('the owner cannot leave (400)', (await api('POST', `/church/${churchId}/leave/${A.id}`, { token: A.token, body: {} })).status === 400);
    const ownerMember = list.json.results.find((m) => m.role === 'owner');
    check('the owner cannot be removed (404)', (await api('POST', `/church/${churchId}/members/remove/${A.id}`, { token: A.token, body: { memberId: ownerMember.memberId } })).status === 404);
    check('B leaves (200)', (await api('POST', `/church/${churchId}/leave/${B.id}`, { token: B.token, body: {} })).status === 200);
    check('after leaving, B is locked out (403)', (await api('GET', `/church/${churchId}/members/${B.id}`, { token: B.token })).status === 403);
    check('B can ask to join again (200)', (await api('POST', `/church/join/${B.id}`, { token: B.token, body: { joinCode: code } })).status === 200);
    const dj = await api('POST', `/church/join/${D.id}`, { token: D.token, body: { joinCode: code } });
    check('D asks to join (200)', dj.status === 200);
    list = await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token });
    const waiting = list.json.results.filter((m) => m.status === 'pending');
    check('the owner now sees two people waiting', waiting.length === 2, JSON.stringify(list.json.results));
    const dRow = waiting.find((m) => m.name.startsWith('Dave'));
    check('owner declines D (200)', (await api('POST', `/church/${churchId}/members/remove/${A.id}`, { token: A.token, body: { memberId: dRow.memberId } })).status === 200);
    check('D can withdraw nothing now (leave is 404)', (await api('POST', `/church/${churchId}/leave/${D.id}`, { token: D.token, body: {} })).status === 404);
    const bRow = waiting.find((m) => m.name.startsWith('Bob'));
    await api('POST', `/church/${churchId}/members/approve/${A.id}`, { token: A.token, body: { memberId: bRow.memberId } });

    section('Suspend and reject');
    check('suspend removes the non-owner members', admin(String(churchId), 'suspend').includes('marked removed'));
    check('B is now locked out of a suspended church (403)', (await api('GET', `/church/${churchId}/members/${B.id}`, { token: B.token })).status === 403);
    check('the owner is locked out too while suspended (403)', (await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token })).status === 403);
    check('nobody can join a suspended church (404)', (await api('POST', `/church/join/${C.id}`, { token: C.token, body: { joinCode: code } })).status === 404);
    check('B sees no memberships after being removed', (await api('GET', `/church/mine/${B.id}`, { token: B.token })).json.results.length === 0);
    admin(String(churchId), 'approve');
    check('re-approving does NOT bring B back on its own (403)', (await api('GET', `/church/${churchId}/members/${B.id}`, { token: B.token })).status === 403);
    check('but the owner works again', (await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token })).status === 200);

    section('Deleting accounts');
    const delOwner = await api('DELETE', '/auth/account', { token: A.token, body: { password: PW } });
    check('the owner of a church cannot delete the account (409, clear message)', delOwner.status === 409 && /owner of a church/.test(delOwner.json.error || ''), `${delOwner.status} ${JSON.stringify(delOwner.json)}`);
    check('...and the account still works', (await api('GET', `/church/mine/${A.id}`, { token: A.token })).status === 200);
    await api('POST', `/church/join/${B.id}`, { token: B.token, body: { joinCode: code } });
    const bRow2 = (await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token })).json.results.find((m) => m.name.startsWith('Bob'));
    await api('POST', `/church/${churchId}/members/approve/${A.id}`, { token: A.token, body: { memberId: bRow2.memberId } });
    const delB = await api('DELETE', '/auth/account', { token: B.token, body: { password: PW } });
    check('a plain member can delete the account (200)', delB.status === 200, JSON.stringify(delB.json));
    check("B's membership rows are gone", (await q(dbs.church, 'SELECT COUNT(*) AS n FROM members WHERE user_id=?', [B.id]))[0].n === 0);
    check('the owner list no longer shows a deleted user as a name', !((await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token })).json.results || []).some((m) => m.name.startsWith('Bob')));

    section('Deleting a church');
    check('delete removes the church and its members', admin(String(churchId), 'delete').includes('Deleted church'));
    check('no member rows are left behind', (await q(dbs.church, 'SELECT COUNT(*) AS n FROM members WHERE church_id=?', [churchId]))[0].n === 0);
    created.churchIds = created.churchIds.filter((x) => x !== churchId);
    const delA = await api('DELETE', '/auth/account', { token: A.token, body: { password: PW } });
    check('with the church gone the former owner can delete the account (200)', delA.status === 200, JSON.stringify(delA.json));

    section('New church after rejection');
    const E = await makeUser(`testchu_${stamp}_e`, 'Erin');
    names.e = E.name;
    const mk2 = await api('POST', `/church/create/${E.id}`, { token: E.token, body: { name: `Second Test ${stamp}` } });
    created.churchIds.push(mk2.json.churchId);
    check('E requests a church', mk2.status === 201);
    check('reject marks it rejected', admin(String(mk2.json.churchId), 'reject').includes('pending -> rejected'));
    const mine2 = await api('GET', `/church/mine/${E.id}`, { token: E.token });
    check('E still sees it as rejected', mine2.json.results[0].churchStatus === 'rejected');
    const mk3 = await api('POST', `/church/create/${E.id}`, { token: E.token, body: { name: `Third Test ${stamp}` } });
    created.churchIds.push(mk3.json.churchId);
    check('after a rejection E can request another (201)', mk3.status === 201);
  } catch (e) {
    failed++;
    console.log(`  FAIL  unexpected error: ${e.message}`);
  } finally {
    await cleanup(created);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
