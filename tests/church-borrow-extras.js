#!/usr/bin/env node
/**
 * tests/church-borrow-extras.js   (npm run check:church7)   - 1.11.29
 *
 * Checks the three borrow additions:
 *   - GET /church/borrow-count/:user_id (the nav badge number, per Books / Movies),
 *   - requests nobody answers for 21 days expire (never a "No", asking again is allowed),
 *   - POST /communitylibrary/returned/:user_id ("Returned": Out -> In, only your own, only if Out and not Lost).
 * Needs the server running with the HIPAA gate off and a Church-enabled database.
 * Creates throwaway users testchu7_<time>_a/_b and a throwaway church, and removes them at the end.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const PW = 'Chk-Pass-123!';
const stamp = Date.now();
const names = ['a', 'b'].reduce((o, k) => ({ ...o, [k]: `testchu7_${stamp}_${k}` }), {});
let passed = 0; let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; console.log(`  PASS  ${label}`); } else { failed++; console.log(`  FAIL  ${label}${detail ? '  -> ' + detail : ''}`); }
}
const section = (t) => console.log(`\n${t}`);
async function api(method, url, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json: json || {} };
}
async function makeUser(userName, first) {
  const up = await api('POST', '/auth/signup', { body: { firstName: first, lastName: 'Extras', userName, email: `${userName}@example.invalid`, password: PW } });
  if (up.status !== 201) throw new Error(`signup failed for ${userName}: ${up.status}`);
  const r = await api('POST', '/auth/signin', { body: { userName, password: PW } });
  return { name: userName, token: r.json.token, id: r.json.results[0].id };
}
const dbs = require('../db/db');
const q = async (pool, sql, params) => (await pool.promise().query(sql, params))[0];

async function main() {
  console.log(`Borrow extras check against ${BASE}`);
  let churchId = null;
  try {
    const A = await makeUser(names.a, 'Alma');   // owns the items
    const B = await makeUser(names.b, 'Ben');    // asks
    const mk = await api('POST', `/church/create/${A.id}`, { token: A.token, body: { name: `Extras ${stamp}`, missionStatement: 'x' } });
    churchId = mk.json.churchId;
    await q(dbs.church, "UPDATE churches SET status='approved' WHERE id=?", [churchId]);
    const code = (await q(dbs.church, 'SELECT joinCode FROM churches WHERE id=?', [churchId]))[0].joinCode;
    await api('POST', `/church/join/${B.id}`, { token: B.token, body: { joinCode: code } });
    const members = (await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token })).json.results;
    for (const m of members.filter((x) => x.status === 'pending')) await api('POST', `/church/${churchId}/members/approve/${A.id}`, { token: A.token, body: { memberId: m.memberId } });
    for (const u of [A, B]) await api('POST', `/church/${churchId}/library/share/${u.id}`, { token: u.token, body: { share: true } });

    const add = (title) => api('POST', `/communitylibrary/books/add/${A.id}`, { token: A.token, body: { title, author: 'X', io: 'In', who: '', lost: 'No' } });
    await add('Extras Book One'); await add('Extras Book Two');
    await api('POST', `/communitylibrary/movies/add/${A.id}`, { token: A.token, body: { name: 'Extras Set', numMovie: 3, name1: 'F1', name2: 'F2', name3: 'F3', io: 'In' } });
    const bookId = async (t) => (await q(dbs.communitylibrary, 'SELECT id FROM books WHERE user_id=? AND title=?', [A.id, t]))[0].id;
    const b1 = await bookId('Extras Book One'); const b2 = await bookId('Extras Book Two');
    const mset = (await q(dbs.communitylibrary, 'SELECT id FROM movies WHERE user_id=? AND name=?', [A.id, 'Extras Set']))[0].id;

    section('Badge count');
    const count = (U) => api('GET', `/church/borrow-count/${U.id}`, { token: U.token });
    const c0 = await count(A);
    check('nothing waiting: 0 / 0 / 0', c0.status === 200 && c0.json.pending === 0 && c0.json.books === 0 && c0.json.movies === 0, JSON.stringify(c0.json));
    const ask = (kind, ref) => api('POST', `/church/borrow/request/${B.id}`, { token: B.token, body: { kind, ref } });
    check('Ben asks for book one', (await ask('book', b1)).status === 201);
    check('Ben asks for the movie set', (await ask('movie', mset)).status === 201);
    const c1 = await count(A);
    check('Alma: 2 waiting (1 book, 1 movie)', c1.json.pending === 2 && c1.json.books === 1 && c1.json.movies === 1, JSON.stringify(c1.json));
    const cb = await count(B);
    check('Ben (the asker) has 0 waiting for HIS answer', cb.json.pending === 0, JSON.stringify(cb.json));
    check('no token: 401', (await api('GET', `/church/borrow-count/${A.id}`)).status === 401);
    check("another user's id in the URL: 403", (await api('GET', `/church/borrow-count/${A.id}`, { token: B.token })).status === 403);
    check('no ids in the count answer', !/user_id|requester_id/.test(JSON.stringify(c1.json)));

    section('Expiry (21 days)');
    const reqRow = (await q(dbs.church, "SELECT id FROM borrow_requests WHERE requester_id=? AND kind='book' AND item_id=?", [B.id, b1]))[0];
    await q(dbs.church, 'UPDATE borrow_requests SET createdAt = (NOW() - INTERVAL 22 DAY) WHERE id=?', [reqRow.id]);
    const c2 = await count(A);
    check('the 22-day-old book request no longer counts; the movie one still does', c2.json.books === 0 && c2.json.movies === 1 && c2.json.pending === 1, JSON.stringify(c2.json));
    const st = (await q(dbs.church, 'SELECT status, auto, answeredAt FROM borrow_requests WHERE id=?', [reqRow.id]))[0];
    check("it is stored as expired, auto=1 (not a 'No'), with an answered time", st.status === 'expired' && st.auto === 1 && st.answeredAt, JSON.stringify(st));
    const outg = (await api('GET', `/church/borrow/${B.id}`, { token: B.token })).json.outgoing;
    check('Ben sees it as expired', outg.some((r) => r.title === 'Extras Book One' && r.status === 'expired'), JSON.stringify(outg));
    const inc = (await api('GET', `/church/borrow/${A.id}`, { token: A.token })).json.incoming;
    check("Alma's list no longer shows it", !inc.some((r) => r.title === 'Extras Book One'), JSON.stringify(inc));
    check('Alma cannot answer an expired request', (await api('POST', `/church/borrow/answer/${A.id}`, { token: A.token, body: { id: reqRow.id, accept: true } })).status === 404);
    check('Ben can ask again right away (no cooldown after expiry)', (await ask('book', b1)).status === 201);
    const exId = outg.find((r) => r.status === 'expired').id;
    check('Ben can Clear the expired row', (await api('POST', `/church/borrow/clear/${B.id}`, { token: B.token, body: { id: exId } })).status === 200
      && !(await api('GET', `/church/borrow/${B.id}`, { token: B.token })).json.outgoing.some((r) => r.id === exId));

    section('Returned');
    const ret = (U, body) => api('POST', `/communitylibrary/returned/${U.id}`, { token: U.token, body });
    await q(dbs.communitylibrary, "UPDATE books SET io=0, who='Neighbour' WHERE id=?", [b2]);
    check("Ben (own id) cannot return Alma's book: 404, row untouched",
      (await ret(B, { kind: 'book', id: b2 })).status === 404 && (await q(dbs.communitylibrary, 'SELECT io, who FROM books WHERE id=?', [b2]))[0].who === 'Neighbour');
    check('wrong user id in the URL: 403', (await api('POST', `/communitylibrary/returned/${A.id}`, { token: B.token, body: { kind: 'book', id: b2 } })).status === 403);
    check('no token: 401', (await api('POST', `/communitylibrary/returned/${A.id}`, { body: { kind: 'book', id: b2 } })).status === 401);
    check('bad kind / id: 400', (await ret(A, { kind: 'cd', id: b2 })).status === 400 && (await ret(A, { kind: 'book', id: 'x' })).status === 400);
    const r1 = await ret(A, { kind: 'book', id: b2 });
    const row = (await q(dbs.communitylibrary, 'SELECT io, who FROM books WHERE id=?', [b2]))[0];
    check('Alma returns her Out book: In / "In Library"', r1.status === 200 && row.io === 1 && row.who === 'In Library', JSON.stringify([r1.json, row]));
    check('returning it again: 404 (already In)', (await ret(A, { kind: 'book', id: b2 })).status === 404);
    await q(dbs.communitylibrary, "UPDATE books SET io=0, who='Gone', lost=1 WHERE id=?", [b2]);
    check('a Lost book cannot be returned this way: 404, still Out', (await ret(A, { kind: 'book', id: b2 })).status === 404
      && (await q(dbs.communitylibrary, 'SELECT io FROM books WHERE id=?', [b2]))[0].io === 0);
    await q(dbs.communitylibrary, "UPDATE movies SET io=0, who='Several', io1=0, who1='Neighbour', io2=1, io3=0, who3='Cousin' WHERE id=?", [mset]);
    const r2 = await ret(A, { kind: 'movie', id: mset });
    const m = (await q(dbs.communitylibrary, 'SELECT * FROM movies WHERE id=?', [mset]))[0];
    check('movie set: disc and every film back In, borrowers reset',
      r2.status === 200 && m.io === 1 && m.who === 'In Library' && m.io1 === 1 && m.io3 === 1 && m.who1 === 'In Library' && m.who3 === 'In Library' && m.io12 === 1, JSON.stringify([r2.json, m]));
    check('movie set returned again: 404', (await ret(A, { kind: 'movie', id: mset })).status === 404);
    check('the film titles are untouched', m.name1 === 'F1' && m.name2 === 'F2' && m.name3 === 'F3');
  } catch (e) {
    failed++; console.log(`  FAIL  unexpected error: ${e.stack || e.message}`);
  } finally {
    section('Cleanup');
    try {
      if (churchId) await q(dbs.church, 'DELETE FROM churches WHERE id=?', [churchId]);
      const ids = (await q(dbs.gateway || dbs.owenenterprises, 'SELECT id FROM users WHERE userName IN (?)', [Object.values(names)])).map((x) => x.id);
      if (ids.length) await q(dbs.church, 'DELETE FROM borrow_requests WHERE user_id IN (?) OR requester_id IN (?)', [ids, ids]);
      const deleteUser = require('../db/maintenance/deleteUser');
      for (const n of Object.values(names)) { try { await deleteUser(n, true, () => {}); console.log(`  cleanup: removed ${n}`); } catch (e) { if (!/no user named/.test(e.message)) console.log(`  cleanup: ${n}: ${e.message}`); } }
    } catch (e) { console.log(`  cleanup problem: ${e.message}`); }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
}
main();
