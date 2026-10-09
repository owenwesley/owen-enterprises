#!/usr/bin/env node
/**
 * tests/church-shared-library.js   (npm run check:church6)
 *
 * Checks the read-only shared library shown under the search on Books and Movies:
 *   - a member who shares sees other sharing members' books and movies (with who has them),
 *   - it is reciprocal (not sharing yourself = you see nothing), never includes yourself,
 *   - no borrower names, pictures or ids leak,
 *   - the other person's rows cannot be edited or deleted by you.
 * Needs the server running with the HIPAA gate off and a Church-enabled database.
 * Creates throwaway users testchu6_<time>_a/_b/_c and a throwaway church, and removes them at the end.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const PW = 'Chk-Pass-123!';
const stamp = Date.now();
const names = ['a', 'b', 'c'].reduce((o, k) => ({ ...o, [k]: `testchu6_${stamp}_${k}` }), {});
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
  const up = await api('POST', '/auth/signup', { body: { firstName: first, lastName: 'Sharer', userName, email: `${userName}@example.invalid`, password: PW } });
  if (up.status !== 201) throw new Error(`signup failed for ${userName}: ${up.status}`);
  const r = await api('POST', '/auth/signin', { body: { userName, password: PW } });
  return { name: userName, token: r.json.token, id: r.json.results[0].id };
}
const dbs = require('../db/db');
const q = async (pool, sql, params) => (await pool.promise().query(sql, params))[0];

async function main() {
  console.log(`Shared library check against ${BASE}`);
  let churchId = null;
  try {
    const A = await makeUser(names.a, 'Owen');   // viewer, shares
    const B = await makeUser(names.b, 'Russ');   // shares
    const C = await makeUser(names.c, 'Cara');   // member who never shares
    const mk = await api('POST', `/church/create/${A.id}`, { token: A.token, body: { name: `Shared Lib ${stamp}`, missionStatement: 'x' } });
    churchId = mk.json.churchId;
    await q(dbs.church, "UPDATE churches SET status='approved' WHERE id=?", [churchId]);
    const code = (await q(dbs.church, 'SELECT joinCode FROM churches WHERE id=?', [churchId]))[0].joinCode;
    for (const u of [B, C]) await api('POST', `/church/join/${u.id}`, { token: u.token, body: { joinCode: code } });
    const members = (await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token })).json.results;
    for (const m of members.filter((x) => x.status === 'pending')) await api('POST', `/church/${churchId}/members/approve/${A.id}`, { token: A.token, body: { memberId: m.memberId } });

    await api('POST', `/communitylibrary/books/add/${B.id}`, { token: B.token, body: { title: 'Russ Book Alpha', author: 'R. Author', io: 'Out', who: 'Zebediah Borrower', lost: 'No', img_url: '/images/secret.png' } });
    await api('POST', `/communitylibrary/movies/add/${B.id}`, { token: B.token, body: { name: 'Russ Set', numMovie: 2, name1: 'Russ Film One', name2: 'Russ Film Two', io: 'In' } });
    await api('POST', `/communitylibrary/books/add/${A.id}`, { token: A.token, body: { title: 'Owen Own Book', author: 'O', io: 'In', who: '', lost: 'No' } });
    await api('POST', `/communitylibrary/books/add/${C.id}`, { token: C.token, body: { title: 'Cara Private Book', author: 'C', io: 'In', who: '', lost: 'No' } });

    section('Reciprocal: both must share');
    const none = await api('GET', `/church/shared-library/${A.id}`, { token: A.token });
    check('nobody sharing: empty', none.status === 200 && none.json.books.length === 0 && none.json.movies.length === 0, JSON.stringify(none.json));
    await api('POST', `/church/${churchId}/library/share/${B.id}`, { token: B.token, body: { share: true } });
    const oneWay = await api('GET', `/church/shared-library/${A.id}`, { token: A.token });
    check('Russ shares but Owen does not: Owen sees nothing', oneWay.json.books.length === 0 && oneWay.json.movies.length === 0, JSON.stringify(oneWay.json));
    await api('POST', `/church/${churchId}/library/share/${A.id}`, { token: A.token, body: { share: true } });

    section('What Owen sees');
    const r = await api('GET', `/church/shared-library/${A.id}`, { token: A.token });
    const book = (r.json.books || []).find((b) => b.title === 'Russ Book Alpha');
    check("Russ's book is listed, shared by Russ Sharer, marked Out", book && book.sharedBy === 'Russ Sharer' && book.available === false, JSON.stringify(r.json));
    const movie = (r.json.movies || []).find((m) => m.name === 'Russ Set');
    check("Russ's movie set is listed with its films", movie && movie.films.length === 2 && movie.sharedBy === 'Russ Sharer', JSON.stringify(r.json));
    check("Owen's own book is not in the shared list", !(r.json.books || []).some((b) => b.title === 'Owen Own Book'));
    check("Cara (not sharing) is not listed", !JSON.stringify(r.json).includes('Cara Private Book'));
    const s = JSON.stringify(r.json);
    check('no borrower name, picture path or user id leaks', !s.includes('Zebediah') && !s.includes('secret.png') && !/user_id|"id"/.test(s), s);
    check('no token: 401', (await api('GET', `/church/shared-library/${A.id}`)).status === 401);
    check("another user's id in the URL: 403", (await api('GET', `/church/shared-library/${B.id}`, { token: A.token })).status === 403);

    section("Owen cannot change Russ's rows");
    const rb = (await q(dbs.communitylibrary, 'SELECT id FROM books WHERE user_id=? AND title=?', [B.id, 'Russ Book Alpha']))[0];
    const rm = (await q(dbs.communitylibrary, 'SELECT id FROM movies WHERE user_id=? AND name=?', [B.id, 'Russ Set']))[0];
    await api('POST', `/communitylibrary/books/delete/${A.id}`, { token: A.token, body: { id: rb.id } });
    await api('POST', `/communitylibrary/movies/delete/${A.id}`, { token: A.token, body: { id: rm.id } });
    await api('POST', `/communitylibrary/books/edit/${A.id}`, { token: A.token, body: { id: rb.id, title: 'HACKED', author: 'x', io: 'In', who: '', lost: 'No' } });
    await api('POST', `/communitylibrary/movies/edit/${A.id}`, { token: A.token, body: { id: rm.id, name: 'HACKED', numMovie: 1, io: 'In' } });
    await api('POST', `/communitylibrary/books/delete/${B.id}`, { token: A.token, body: { id: rb.id } });
    check("Russ's book is untouched", (await q(dbs.communitylibrary, 'SELECT title FROM books WHERE id=?', [rb.id]))[0]?.title === 'Russ Book Alpha');
    check("Russ's movie is untouched", (await q(dbs.communitylibrary, 'SELECT name FROM movies WHERE id=?', [rm.id]))[0]?.name === 'Russ Set');

    section('Switching off');
    await api('POST', `/church/${churchId}/library/share/${B.id}`, { token: B.token, body: { share: false } });
    const off = await api('GET', `/church/shared-library/${A.id}`, { token: A.token });
    check('Russ switches sharing off: gone at once', off.json.books.length === 0 && off.json.movies.length === 0);
  } catch (e) {
    failed++; console.log(`  FAIL  unexpected error: ${e.stack || e.message}`);
  } finally {
    section('Cleanup');
    try {
      if (churchId) await q(dbs.church, 'DELETE FROM churches WHERE id=?', [churchId]);
      const deleteUser = require('../db/maintenance/deleteUser');
      for (const n of Object.values(names)) { try { await deleteUser(n, true, () => {}); console.log(`  cleanup: removed ${n}`); } catch (e) { if (!/no user named/.test(e.message)) console.log(`  cleanup: ${n}: ${e.message}`); } }
    } catch (e) { console.log(`  cleanup problem: ${e.message}`); }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
}
main();
