#!/usr/bin/env node
/**
 * tests/church-step2.js   (npm run check:church2)
 *
 * Checks Church step 2 against the RUNNING server, like tests/church-role-matrix.js:
 *   - join-code reset, wrong-code rate limit, ownership hand-over,
 *   - library sharing (opt-in, whitelisted fields, resets on leave),
 *   - the admin churches API (/admin/churches).
 *
 *   1. Start the server and wait about 10 seconds.
 *   2. From the project root:  node tests/church-step2.js
 *
 * Creates throwaway users named testchu2_<time>_a..f, one admin among them, and
 * throwaway churches, and removes them at the end. Run it against test data.
 * Exit code 0 = all checks passed, 1 = a failure.
 */
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const PW = 'Chk-Pass-123!';
const stamp = Date.now();
const names = ['a', 'b', 'c', 'd', 'e', 'f'].reduce((o, k) => ({ ...o, [k]: `testchu2_${stamp}_${k}` }), {});

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
  console.log(`Church step 2 check against ${BASE}`);
  const created = { churchIds: [] };
  try {
    const A = await makeUser(names.a, 'Alice');   // owner
    const B = await makeUser(names.b, 'Bob');     // member
    const C = await makeUser(names.c, 'Carol');   // member who never shares
    const D = await makeUser(names.d, 'Dave');    // outsider, tries wrong codes
    const E = await makeUser(names.e, 'Erin');    // applicant
    const F = await makeUser(names.f, 'Frank');   // admin
    check('six test users signed in', [A, B, C, D, E, F].every((u) => u.token && Number.isInteger(u.id)));
    makeAdmin(F.name);
    const adminTok = (await api('POST', '/auth/signin', { body: { userName: F.name, password: PW } })).json.token;

    section('Admin churches API');
    check('a normal user cannot list churches (403)', (await api('GET', '/admin/churches', { token: A.token })).status === 403);
    check('no token: 401', (await api('GET', '/admin/churches')).status === 401);
    const mk = await api('POST', `/church/create/${A.id}`, { token: A.token, body: { name: `Step2 Church ${stamp}`, missionStatement: 'Step two.' } });
    check('A requests a church', mk.status === 201);
    const churchId = mk.json.churchId;
    created.churchIds.push(churchId);
    let list = await api('GET', '/admin/churches', { token: adminTok });
    let row = (list.json.results || []).find((c) => c.id === churchId);
    check('admin sees it pending with the owner user name', row && row.status === 'pending' && row.ownerUserName === A.name && row.ownerName === 'Alice Steptwo', JSON.stringify(row));
    check('admin list never carries an email', !JSON.stringify(list.json).includes('@example.invalid'));
    check('a non-admin cannot approve (403)', (await api('POST', `/admin/churches/${churchId}/status`, { token: A.token, body: { status: 'approved' } })).status === 403);
    check('a bad status is refused (400)', (await api('POST', `/admin/churches/${churchId}/status`, { token: adminTok, body: { status: 'banana' } })).status === 400);
    check('an unknown church id is 404', (await api('POST', '/admin/churches/999999/status', { token: adminTok, body: { status: 'approved' } })).status === 404);
    check('admin approves (200)', (await api('POST', `/admin/churches/${churchId}/status`, { token: adminTok, body: { status: 'approved' } })).status === 200);
    const mineA = (await api('GET', `/church/mine/${A.id}`, { token: A.token })).json.results.find((r) => r.churchId === churchId);
    check('the church is now approved for its owner, who sees the join code', mineA && mineA.churchStatus === 'approved' && /^[A-Z0-9]{8}$/.test(mineA.joinCode || ''));
    let code = mineA.joinCode;

    section('Joining and the wrong-code limit');
    for (const u of [B, C]) {
      await api('POST', `/church/join/${u.id}`, { token: u.token, body: { joinCode: code } });
    }
    const pendList = (await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token })).json.results;
    for (const u of [B, C]) {
      const m = pendList.find((x) => x.name.startsWith(u === B ? 'Bob' : 'Carol'));
      await api('POST', `/church/${churchId}/members/approve/${A.id}`, { token: A.token, body: { memberId: m.memberId } });
    }
    check('B and C are active members', (await api('GET', `/church/${churchId}/members/${B.id}`, { token: B.token })).json.results.filter((m) => m.status === 'active').length === 3);
    const dStatuses = [];
    for (let i = 0; i < 5; i++) dStatuses.push((await api('POST', `/church/join/${D.id}`, { token: D.token, body: { joinCode: `WRONG${i}ZZ` } })).status);
    check('D: five wrong codes answer 404 each', dStatuses.every((s) => s === 404), dStatuses.join(','));
    const locked = await api('POST', `/church/join/${D.id}`, { token: D.token, body: { joinCode: code } });
    check('D: the sixth try is locked (429) even with the RIGHT code', locked.status === 429 && /minute/.test(locked.json.error || ''), JSON.stringify(locked));
    check('D is still not a member', (await api('GET', `/church/mine/${D.id}`, { token: D.token })).json.results.length === 0);
    check('the lock does not stop D using other routes', (await api('GET', `/church/mine/${D.id}`, { token: D.token })).status === 200);
    check('the lock is per person: B-type user E is not locked', (await api('POST', `/church/join/${E.id}`, { token: E.token, body: { joinCode: 'NOPE1234' } })).status === 404);
    for (let i = 0; i < 3; i++) await api('POST', `/church/join/${E.id}`, { token: E.token, body: { joinCode: `BAD${i}BAD1` } });
    const eJoin = await api('POST', `/church/join/${E.id}`, { token: E.token, body: { joinCode: code } });
    check('E: four wrong codes then the right one still works (200)', eJoin.status === 200, JSON.stringify(eJoin));
    const eAfter = [];
    for (let i = 0; i < 3; i++) eAfter.push((await api('POST', `/church/join/${E.id}`, { token: E.token, body: { joinCode: `AFT${i}ERR1` } })).status);
    check('a right code clears E\'s count (later wrong codes are 404, not 429)', eAfter.every((s) => s === 404), eAfter.join(','));

    section('Join-code reset');
    check('a member cannot reset the code (403)', (await api('POST', `/church/${churchId}/joincode/reset/${B.id}`, { token: B.token, body: {} })).status === 403);
    check('an outsider cannot reset the code (403)', (await api('POST', `/church/${churchId}/joincode/reset/${D.id}`, { token: D.token, body: {} })).status === 403);
    check("another user's id in the URL is refused (403)", (await api('POST', `/church/${churchId}/joincode/reset/${A.id}`, { token: B.token, body: {} })).status === 403);
    const rs = await api('POST', `/church/${churchId}/joincode/reset/${A.id}`, { token: A.token, body: {} });
    check('the owner resets the code (200, new 8-character code)', rs.status === 200 && /^[A-Z0-9]{8}$/.test(rs.json.joinCode || '') && rs.json.joinCode !== code, JSON.stringify(rs.json));
    const oldCode = code;
    code = rs.json.joinCode;
    check('the owner sees the new code in /mine', (await api('GET', `/church/mine/${A.id}`, { token: A.token })).json.results.find((r) => r.churchId === churchId).joinCode === code);
    check('the database holds the new code', (await q(dbs.church, 'SELECT joinCode FROM churches WHERE id=?', [churchId]))[0].joinCode === code);
    check('B (a member) is unaffected', (await api('GET', `/church/${churchId}/members/${B.id}`, { token: B.token })).status === 200);
    check("E's pending request is unaffected", (await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token })).json.results.some((m) => m.name.startsWith('Erin') && m.status === 'pending'));
    check('the OLD code no longer works (404)', (await api('POST', `/church/join/${F.id}`, { token: F.token, body: { joinCode: oldCode } })).status === 404);
    check('the NEW code works (200)', (await api('POST', `/church/join/${F.id}`, { token: F.token, body: { joinCode: code } })).status === 200);
    const fRow = (await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token })).json.results.find((m) => m.name.startsWith('Frank'));
    await api('POST', `/church/${churchId}/members/remove/${A.id}`, { token: A.token, body: { memberId: fRow.memberId } });

    section('Library sharing');
    const mineB = (await api('GET', `/church/mine/${B.id}`, { token: B.token })).json.results[0];
    check('sharing is OFF by default', mineB.shareLibrary === false);
    await api('POST', `/communitylibrary/books/add/${B.id}`, { token: B.token, body: { title: 'Mere Christianity', author: 'C. S. Lewis', io: 'In', who: '', lost: 'No' } });
    await api('POST', `/communitylibrary/books/add/${B.id}`, { token: B.token, body: { title: 'Lent Out Book', author: 'Someone', io: 'Out', who: 'Zebediah Borrower', lost: 'No' } });
    await api('POST', `/communitylibrary/movies/add/${B.id}`, { token: B.token, body: { name: 'Narnia Set', numMovie: 2, name1: 'The Lion', name2: 'Caspian', io: 'In' } });
    await api('POST', `/communitylibrary/contacts/add/${B.id}`, { token: B.token, body: { firstName: 'Secretcontact', lastName: 'Person', phoneNum: '555-0100', email: 'secret@example.invalid', address: '1 Hidden Rd' } });
    await api('POST', `/communitylibrary/books/add/${C.id}`, { token: C.token, body: { title: 'Carol Private Book', author: 'X', io: 'In', who: '', lost: 'No' } });
    let cat = await api('GET', `/church/${churchId}/library/${A.id}`, { token: A.token });
    check('nobody shares yet: the catalog is empty', cat.status === 200 && cat.json.results.length === 0, JSON.stringify(cat.json));
    check('an outsider cannot read the catalog (403)', (await api('GET', `/church/${churchId}/library/${D.id}`, { token: D.token })).status === 403);
    check('a pending applicant cannot read the catalog (403)', (await api('GET', `/church/${churchId}/library/${E.id}`, { token: E.token })).status === 403);
    check('an outsider cannot switch sharing on (403)', (await api('POST', `/church/${churchId}/library/share/${D.id}`, { token: D.token, body: { share: true } })).status === 403);
    check("the owner cannot switch sharing on for B (URL id must be the caller's: 403)", (await api('POST', `/church/${churchId}/library/share/${B.id}`, { token: A.token, body: { share: true } })).status === 403);
    check('B switches sharing on (200)', (await api('POST', `/church/${churchId}/library/share/${B.id}`, { token: B.token, body: { share: true } })).status === 200);
    check('switching it on twice is still 200', (await api('POST', `/church/${churchId}/library/share/${B.id}`, { token: B.token, body: { share: true } })).status === 200);
    check('/mine now says B shares', (await api('GET', `/church/mine/${B.id}`, { token: B.token })).json.results[0].shareLibrary === true);
    cat = await api('GET', `/church/${churchId}/library/${A.id}`, { token: A.token });
    const bCat = (cat.json.results || [])[0];
    check('the owner sees exactly one sharer: Bob', cat.json.results.length === 1 && bCat.name === 'Bob Steptwo', JSON.stringify(cat.json));
    check('Bob\'s books and film are listed', bCat && bCat.books.length === 2 && bCat.movies.length === 1 && bCat.books.some((b) => b.title === 'Mere Christianity'));
    check('the lent book shows as Out, the other as In', bCat.books.find((b) => b.title === 'Lent Out Book').available === false && bCat.books.find((b) => b.title === 'Mere Christianity').available === true);
    check('the two films of the set are named', bCat.movies[0].films.length === 2 && bCat.movies[0].films[0].name === 'The Lion');
    const text = JSON.stringify(cat.json);
    check('no borrower name, contact, email, phone or address leaks', !/Zebediah|Secretcontact|secret@|555-0100|Hidden Rd/.test(text));
    check('no user ids or emails in the catalog', !/user_id|"email"|userId/.test(text));
    check("Carol did not share, so her book is not listed", !text.includes('Carol Private Book'));
    check('B (a member) can read the catalog too', (await api('GET', `/church/${churchId}/library/${B.id}`, { token: B.token })).json.results.length === 1);
    check('B switches sharing off (200)', (await api('POST', `/church/${churchId}/library/share/${B.id}`, { token: B.token, body: { share: false } })).status === 200);
    check('the catalog is empty again', (await api('GET', `/church/${churchId}/library/${A.id}`, { token: A.token })).json.results.length === 0);
    await api('POST', `/church/${churchId}/library/share/${B.id}`, { token: B.token, body: { share: true } });
    check('B leaves the church (200)', (await api('POST', `/church/${churchId}/leave/${B.id}`, { token: B.token, body: {} })).status === 200);
    check('leaving switches sharing off in the database', (await q(dbs.church, 'SELECT shareLibrary FROM members WHERE church_id=? AND user_id=?', [churchId, B.id]))[0].shareLibrary === 0);
    check("B's books are gone from the catalog", (await api('GET', `/church/${churchId}/library/${A.id}`, { token: A.token })).json.results.length === 0);
    await api('POST', `/church/join/${B.id}`, { token: B.token, body: { joinCode: code } });
    const bRow = (await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token })).json.results.find((m) => m.name.startsWith('Bob'));
    await api('POST', `/church/${churchId}/members/approve/${A.id}`, { token: A.token, body: { memberId: bRow.memberId } });
    check('coming back: sharing is still off until Bob switches it on', (await api('GET', `/church/mine/${B.id}`, { token: B.token })).json.results[0].shareLibrary === false);
    await api('POST', `/church/${churchId}/library/share/${B.id}`, { token: B.token, body: { share: true } });
    await api('POST', `/church/${churchId}/members/remove/${A.id}`, { token: A.token, body: { memberId: bRow.memberId } });
    check('being removed by the owner also switches sharing off', (await q(dbs.church, 'SELECT shareLibrary FROM members WHERE church_id=? AND user_id=?', [churchId, B.id]))[0].shareLibrary === 0);
    await api('POST', `/church/join/${B.id}`, { token: B.token, body: { joinCode: code } });
    const bRow2 = (await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token })).json.results.find((m) => m.name.startsWith('Bob'));
    await api('POST', `/church/${churchId}/members/approve/${A.id}`, { token: A.token, body: { memberId: bRow2.memberId } });

    section('Ownership hand-over');
    const ml = (await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token })).json.results;
    const mB = ml.find((m) => m.name.startsWith('Bob'));
    const mC = ml.find((m) => m.name.startsWith('Carol'));
    const mE = ml.find((m) => m.name.startsWith('Erin'));
    check('a member cannot hand the church over (403)', (await api('POST', `/church/${churchId}/transfer/${C.id}`, { token: C.token, body: { memberId: mC.memberId, password: PW } })).status === 403);
    check('no password: 400', (await api('POST', `/church/${churchId}/transfer/${A.id}`, { token: A.token, body: { memberId: mB.memberId } })).status === 400);
    check('no member chosen: 400', (await api('POST', `/church/${churchId}/transfer/${A.id}`, { token: A.token, body: { password: PW } })).status === 400);
    const wrong = await api('POST', `/church/${churchId}/transfer/${A.id}`, { token: A.token, body: { memberId: mB.memberId, password: 'nope' } });
    check('wrong password: 400 and nothing changes', wrong.status === 400 && (await q(dbs.church, "SELECT role FROM members WHERE church_id=? AND user_id=?", [churchId, A.id]))[0].role === 'owner');
    check('a waiting (not yet approved) person cannot be made owner (404)', (await api('POST', `/church/${churchId}/transfer/${A.id}`, { token: A.token, body: { memberId: mE.memberId, password: PW } })).status === 404);
    check('the owner cannot "hand over" to themselves (404)', (await api('POST', `/church/${churchId}/transfer/${A.id}`, { token: A.token, body: { memberId: ml.find((m) => m.isYou).memberId, password: PW } })).status === 404);
    check("a member row of ANOTHER church is not accepted (404)", (await api('POST', `/church/${churchId}/transfer/${A.id}`, { token: A.token, body: { memberId: 99999999, password: PW } })).status === 404);
    check('still exactly one owner after the refusals', (await q(dbs.church, "SELECT COUNT(*) AS n FROM members WHERE church_id=? AND role='owner'", [churchId]))[0].n === 1);
    const tr = await api('POST', `/church/${churchId}/transfer/${A.id}`, { token: A.token, body: { memberId: mB.memberId, password: PW } });
    check('the owner hands the church to Bob (200)', tr.status === 200, JSON.stringify(tr.json));
    check('there is still exactly one owner, and it is Bob', (await q(dbs.church, "SELECT user_id FROM members WHERE church_id=? AND role='owner'", [churchId])).map((r) => r.user_id).join() === String(B.id));
    check('Alice is now a member: no join code, cannot edit', (await api('GET', `/church/mine/${A.id}`, { token: A.token })).json.results[0].joinCode === undefined && (await api('POST', `/church/${churchId}/edit/${A.id}`, { token: A.token, body: { missionStatement: 'x' } })).status === 403);
    check('Alice cannot reset the code any more (403)', (await api('POST', `/church/${churchId}/joincode/reset/${A.id}`, { token: A.token, body: {} })).status === 403);
    check('Bob now sees the join code and can reset it (200)', (await api('GET', `/church/mine/${B.id}`, { token: B.token })).json.results[0].joinCode === code && (await api('POST', `/church/${churchId}/joincode/reset/${B.id}`, { token: B.token, body: {} })).status === 200);
    check('Bob can approve Erin (200)', (await api('POST', `/church/${churchId}/members/approve/${B.id}`, { token: B.token, body: { memberId: mE.memberId } })).status === 200);
    check('Alice can now leave like any member (200)', (await api('POST', `/church/${churchId}/leave/${A.id}`, { token: A.token, body: {} })).status === 200);
    check('the new owner cannot delete the account while owning the church (409)', (await api('DELETE', '/auth/account', { token: B.token, body: { password: PW } })).status === 409);
    check('the former owner can delete the account (200)', (await api('DELETE', '/auth/account', { token: A.token, body: { password: PW } })).status === 200);
    const pwStatuses = [];
    for (let i = 0; i < 5; i++) pwStatuses.push((await api('POST', `/church/${churchId}/transfer/${B.id}`, { token: B.token, body: { memberId: mC.memberId, password: `bad${i}` } })).status);
    check('five wrong passwords answer 400', pwStatuses.every((s) => s === 400), pwStatuses.join());
    check('the next try is locked (429) even with the right password', (await api('POST', `/church/${churchId}/transfer/${B.id}`, { token: B.token, body: { memberId: mC.memberId, password: PW } })).status === 429);
    check('the church did not change hands while locked', (await q(dbs.church, "SELECT user_id FROM members WHERE church_id=? AND role='owner'", [churchId]))[0].user_id === B.id);

    section('Admin suspend, reject, delete');
    const sus = await api('POST', `/admin/churches/${churchId}/status`, { token: adminTok, body: { status: 'suspended' } });
    check('admin suspends: members removed, count reported', sus.status === 200 && sus.json.removedMembers === 2, JSON.stringify(sus.json));
    check('the owner is locked out while suspended (403)', (await api('GET', `/church/${churchId}/members/${B.id}`, { token: B.token })).status === 403);
    check('Carol (removed) sees nothing', (await api('GET', `/church/mine/${C.id}`, { token: C.token })).json.results.length === 0);
    check('sharing is off for the removed members', (await q(dbs.church, "SELECT COUNT(*) AS n FROM members WHERE church_id=? AND shareLibrary=1", [churchId]))[0].n === 0);
    check('admin puts it back to pending (200, nobody else removed)', (await api('POST', `/admin/churches/${churchId}/status`, { token: adminTok, body: { status: 'pending' } })).status === 200);
    await api('POST', `/admin/churches/${churchId}/status`, { token: adminTok, body: { status: 'approved' } });
    check('approved again: the owner works, Carol stays out', (await api('GET', `/church/${churchId}/members/${B.id}`, { token: B.token })).status === 200 && (await api('GET', `/church/mine/${C.id}`, { token: C.token })).json.results.length === 0);
    check('reject works (200)', (await api('POST', `/admin/churches/${churchId}/status`, { token: adminTok, body: { status: 'rejected' } })).status === 200);
    check('the list shows it rejected', ((await api('GET', '/admin/churches', { token: adminTok })).json.results.find((c) => c.id === churchId) || {}).status === 'rejected');
    check('a non-admin cannot delete (403)', (await api('DELETE', `/admin/churches/${churchId}`, { token: B.token })).status === 403);
    check('admin deletes the church (200)', (await api('DELETE', `/admin/churches/${churchId}`, { token: adminTok })).status === 200);
    check('deleting it again is 404', (await api('DELETE', `/admin/churches/${churchId}`, { token: adminTok })).status === 404);
    check('no member rows are left', (await q(dbs.church, 'SELECT COUNT(*) AS n FROM members WHERE church_id=?', [churchId]))[0].n === 0);
    created.churchIds = created.churchIds.filter((x) => x !== churchId);
    check('the former owner can now delete the account (200)', (await api('DELETE', '/auth/account', { token: B.token, body: { password: PW } })).status === 200);
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
