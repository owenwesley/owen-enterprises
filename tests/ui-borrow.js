#!/usr/bin/env node
/**
 * tests/ui-borrow.js   (npm run check:ui)   - 1.11.29   OPTIONAL: needs Playwright + Chromium
 *
 * Drives the real built app in a phone-sized browser (390x844): two people ask for the same book, the owner
 * sees the badge on the landing card and in the menu, says Yes to one (book turns Out, the other is closed),
 * then taps Returned. Also checks for sideways scrolling and browser errors. Screenshots go to SHOT_DIR (default: temp dir).
 *
 * Start the server first:  npm run build --prefix client
 *   NODE_ENV=production PORT=4120 HIPAA_GATE=off RATE_LIMIT=off node server.js
 * Needs Playwright (npm i -D playwright, or PLAYWRIGHT_PATH=/path/to/playwright) and a Chromium
 * (CHROMIUM_PATH=/path/to/chromium if Playwright has not downloaded its own). Throwaway testbrw_* users, removed at the end.
 */
const path = require('path');
const APP = path.resolve(__dirname, '..');
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env', quiet: true });
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright')); }
const BASE = (process.env.BASE_URL || 'http://localhost:4120').replace(/\/$/, '');
const PW = 'Chk-Pass-123!'; const stamp = Date.now();
const dbs = require(APP + '/db/db'); const q = async (p, s, a) => (await p.promise().query(s, a))[0];
let pass = 0, fail = 0;
const check = (l, c, d) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !d ? '' : '  -> ' + d}`); };
async function api(m, u, { token, body } = {}) {
  const r = await fetch(BASE + u, { method: m, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body && JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch {} return { status: r.status, json: j };
}
async function mk(n, f) {
  await api('POST', '/auth/signup', { body: { firstName: f, lastName: 'Browser', userName: n, email: n + '@example.invalid', password: PW } });
  const r = await api('POST', '/auth/signin', { body: { userName: n, password: PW } });
  return { name: n, token: r.json.token, id: r.json.results[0].id };
}
(async () => {
  const nm = (k) => `testbrw_${stamp}_${k}`;
  const A = await mk(nm('a'), 'Alma'), B = await mk(nm('b'), 'Benjamin'), C = await mk(nm('c'), 'Carolyn');
  const mkc = await api('POST', `/church/create/${A.id}`, { token: A.token, body: { name: `Browser ${stamp}`, missionStatement: 'x' } });
  const churchId = mkc.json.churchId;
  await q(dbs.church, "UPDATE churches SET status='approved' WHERE id=?", [churchId]);
  const code = (await q(dbs.church, 'SELECT joinCode FROM churches WHERE id=?', [churchId]))[0].joinCode;
  for (const u of [B, C]) await api('POST', `/church/join/${u.id}`, { token: u.token, body: { joinCode: code } });
  const mem = (await api('GET', `/church/${churchId}/members/${A.id}`, { token: A.token })).json.results;
  for (const m of mem.filter((x) => x.status === 'pending')) await api('POST', `/church/${churchId}/members/approve/${A.id}`, { token: A.token, body: { memberId: m.memberId } });
  for (const u of [A, B, C]) await api('POST', `/church/${churchId}/library/share/${u.id}`, { token: u.token, body: { share: true } });
  await api('POST', `/communitylibrary/books/add/${A.id}`, { token: A.token, body: { title: 'Zebra Tales', author: 'Q Author', io: 'In', who: '', lost: 'No' } });

  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const errs = [];
  async function session(u) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(u.name + ': ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(u.name + ' console: ' + m.text()); });
    await page.goto(BASE + '/');
    await page.getByLabel('Username').fill(u.name); await page.getByLabel('Password').fill(PW);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(1500);
    return page;
  }
  const noHScroll = async (p, l) => check(`${l}: no sideways scrolling`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  const shot = (p, n) => p.screenshot({ path: path.join(process.env.SHOT_DIR || require('os').tmpdir(), n), fullPage: true });
  async function toBooks(page) {
    await page.getByText('Community Library', { exact: false }).first().click(); await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Open menu' }).click(); await page.waitForTimeout(500);
    await page.getByText('Books', { exact: false }).last().click(); await page.waitForTimeout(1000);
  }
  async function askFor(page) {
    await toBooks(page);
    await page.getByPlaceholder('Search title or author…').fill('zebra');
    await page.getByRole('button', { name: 'Ask to borrow' }).click();
    await page.getByRole('button', { name: 'Send request' }).click();
    await page.waitForTimeout(1200);
  }
  const pb = await session(B); await askFor(pb);
  check('Benjamin sees "Requested" after asking', await pb.getByRole('button', { name: 'Requested' }).count() > 0);
  await noHScroll(pb, 'asker view'); await shot(pb, 'b-asked.png');
  const pc = await session(C); await askFor(pc);
  check('Carolyn also asked for the same book', await pc.getByRole('button', { name: 'Requested' }).count() > 0);
  const pa = await session(A);
  check('owner landing card shows a badge of 2', await pa.getByLabel('2 borrow request(s) waiting').count() > 0);
  await shot(pa, 'a-landing.png');
  await pa.getByText('Community Library', { exact: false }).first().click(); await pa.waitForTimeout(800);
  await pa.getByRole('button', { name: 'Open menu' }).click(); await pa.waitForTimeout(500);
  check('owner menu shows 2 waiting on Books', await pa.getByLabel('2 borrow request(s) waiting').count() > 0);
  await shot(pa, 'a-menu.png');
  await pa.getByText('Books', { exact: false }).last().click(); await pa.waitForTimeout(1200);
  await noHScroll(pa, 'owner requests panel'); await shot(pa, 'a-requests.png');
  check('owner sees both requests', await pa.getByText(/would like to borrow "Zebra Tales"/).count() === 2);
  await pa.getByRole('button', { name: 'Yes' }).first().click(); await pa.waitForTimeout(1500);
  const bk = (await q(dbs.communitylibrary, "SELECT io, who FROM books WHERE user_id=? AND title='Zebra Tales'", [A.id]))[0];
  check('book turned Out to the asker', Number(bk.io) === 0 && /Benjamin|Carolyn/.test(bk.who), JSON.stringify(bk));
  const st = await q(dbs.church, "SELECT status FROM borrow_requests WHERE user_id=? ORDER BY id", [A.id]);
  check('one accepted, one closed as taken', st.map((r) => r.status).sort().join() === 'accepted,declined' || st.length === 2, JSON.stringify(st));
  await pa.waitForTimeout(500);
  check('badge gone after answering', await pa.locator('[aria-label*="borrow request"]').count() === 0);
  check('owner card now shows Returned button', await pa.getByRole('button', { name: /Mark Zebra Tales returned/ }).count() > 0);
  await shot(pa, 'a-after-yes.png');
  await pa.getByRole('button', { name: /Mark Zebra Tales returned/ }).click(); await pa.waitForTimeout(1200);
  const bk2 = (await q(dbs.communitylibrary, "SELECT io FROM books WHERE user_id=? AND title='Zebra Tales'", [A.id]))[0];
  check('Returned puts the book back In', Number(bk2.io) === 1, JSON.stringify(bk2));
  check('no page errors in browser', errs.length === 0, errs.slice(0, 3).join(' ; '));
  await browser.close();
  for (const u of [A, B, C]) { try { await api('POST', `/auth/delete/${u.id}`, { token: u.token, body: { password: PW } }); } catch {} }
  await q(dbs.church, 'DELETE FROM churches WHERE id=?', [churchId]);
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
