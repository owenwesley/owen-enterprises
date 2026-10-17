#!/usr/bin/env node
/**
 * tests/route-layout.js (npm run check:routes). No server, no database.
 * routes/church.js and routes/meetings.js are split into one file per area / action. This mounts both on a
 * throwaway Express app (a fake database, ownerOnly in front like server.js) and checks:
 *   - every route in the list is wired (anything but 404), including the fixed church paths that must never be
 *     read as a :church_id (mine, create, join, shared-library, contacts, borrow, borrow-count);
 *   - every route inside a church answers 403 when the person is not an active member (requireChurch is on it);
 *   - a wrong user id in the URL is refused (ownerOnly), and an unknown path is 404.
 * Run it after moving or renaming any file under routes/church or routes/meetings.
 */
const path = require('path');
const express = require('express');
const root = path.resolve(__dirname, '..');

// Fake database: every query answers "no rows" and every write "nothing changed".
const pool = { promise: () => ({
  query: async (sql) => (/^\s*SELECT/i.test(sql) ? [[]] : [{ affectedRows: 0, insertId: 0 }]),
  getConnection: async () => ({ beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {}, query: async () => [[], {}] }),
}) };
const dbPath = require.resolve(path.join(root, 'db/db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: new Proxy({}, { get: (t, k) => (k === '__esModule' ? undefined : pool) }) };
const ownerOnly = require(path.join(root, 'middleware/ownerOnly.js'));

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = { id: 7 }; next(); });
app.use('/church', ownerOnly(), require(path.join(root, 'routes/church.js')));
app.use('/meetings', ownerOnly(), require(path.join(root, 'routes/meetings.js')));

// [method, path, insideAChurch]
const CHURCH = [
  ['GET', '/church/mine/7'], ['POST', '/church/create/7'], ['POST', '/church/join/7'],
  ['GET', '/church/shared-library/7'], ['GET', '/church/contacts/7'],
  ['GET', '/church/borrow/7'], ['GET', '/church/borrow-count/7'],
  ['POST', '/church/borrow/request/7'], ['POST', '/church/borrow/answer/7'],
  ['POST', '/church/borrow/cancel/7'], ['POST', '/church/borrow/clear/7'],
  ['POST', '/church/1/leave/7'],   // no permission on purpose (a pending member must be able to leave): checked as "not 403" below
].map(([m, p]) => [m, p, false]).concat([
  ['GET', '/church/1/members/7'], ['POST', '/church/1/members/approve/7'], ['POST', '/church/1/members/remove/7'],
  ['POST', '/church/1/members/role/7'], ['POST', '/church/1/edit/7'], ['POST', '/church/1/joincode/reset/7'],
  ['POST', '/church/1/transfer/7'], ['POST', '/church/1/areas/7'],
  ['GET', '/church/1/library/7'], ['POST', '/church/1/library/share/7'], ['POST', '/church/1/contact/share/7'],
  ['GET', '/church/1/announcements/7'], ['POST', '/church/1/announcements/post/7'],
  ['POST', '/church/1/announcements/edit/7'], ['POST', '/church/1/announcements/delete/7'],
].map(([m, p]) => [m, p, true]));
const MEETINGS = [
  ['GET', '/meetings/7'], ['POST', '/meetings/add/7'], ['POST', '/meetings/edit/7'], ['POST', '/meetings/delete/7'],
  ['GET', '/meetings/chairs/7'], ['POST', '/meetings/chairs/add/7'], ['POST', '/meetings/chairs/edit/7'], ['POST', '/meetings/chairs/delete/7'],
  ['GET', '/meetings/memos/7'], ['POST', '/meetings/memos/add/7'], ['POST', '/meetings/memos/edit/7'], ['POST', '/meetings/memos/delete/7'],
  ['GET', '/meetings/reports/7'],
];

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL  ' + m); } };

(async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  // A handler may answer 404 itself ("row not found"); Express's own "no such route" 404 says "Cannot GET /..." in HTML.
  let missing = false;
  const hit = async (m, p) => {
    const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: m === 'POST' ? '{}' : undefined });
    missing = r.status === 404 && /^Cannot /.test((await r.text()).replace(/<[^>]*>/g, '').trim().replace(/^[^C]*/, ''));
    return r.status;
  };
  const quiet = console.error; console.error = () => {};
  for (const [m, p, inside] of CHURCH) {
    const s = await hit(m, p);
    ok(!missing, `${m} ${p} is wired (got ${s})`);
    if (inside) ok(s === 403, `${m} ${p} refuses a person who is not an active member (got ${s})`);
  }
  for (const [m, p] of MEETINGS) {
    const s = await hit(m, p);
    ok(!missing && s !== 403, `${m} ${p} is wired (got ${s})`);
  }
  ok(await hit('GET', '/church/mine/8') === 403, 'church: another person\'s id in the URL is refused');
  ok(await hit('GET', '/meetings/8') === 403, 'meetings: another person\'s id in the URL is refused');
  ok(await hit('GET', '/church/1/nothing/7') === 404 && missing, 'church: unknown path is 404');
  ok(await hit('DELETE', '/church/1/members/7') === 404 && missing, 'church: wrong method is 404');
  console.error = quiet;
  console.log(`route-layout: ${pass} passed, ${fail} failed`);
  server.close();
  process.exit(fail ? 1 : 0);
})();
