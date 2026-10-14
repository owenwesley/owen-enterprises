#!/usr/bin/env node
/**
 * tests/food-lookup.js   (npm run check:foods)   - 1.13.6
 *
 * "What I ate" in the BG table. Starts its OWN fake fatsecret server (token + foods.search v1 + food.get v5, with
 * the quirks of the real one: a single result is an object not an array, numbers are strings) and two copies of the
 * app: one with the fake's keys (port 4112) and one with no keys (4113). No real fatsecret call is ever made.
 * Needs the database in .env; creates throwaway users testfood_* and removes them.
 *
 * Covers: the meal text parser ("biscuits and gravy" stays one dish, "sausage and eggs" becomes two foods,
 * "2 eggs", "1 cup", "100 g"), name matching, serving scaling, units, the token being reused, answers being
 * cached, nothing saved by a lookup, apply writing one Nutrition row per day (insert, then update by meal slot,
 * overwrite), bad input refused, other users locked out, a broken fatsecret giving a plain message (no secrets),
 * the per-user limit, and the lookup being off when no key is set.
 */
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const root = path.resolve(__dirname, '..');
const { parseMeal, nameSimilarity } = require('../utils/mealParser');

let passed = 0, failed = 0;
const check = (l, c, d) => { c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}${d ? '  -> ' + d : ''}`)); };
const section = (t) => console.log(`\n${t}`);

const { fake, fakeServer } = require('./fake-fatsecret');

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function startApp(port, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), NODE_ENV: '', HIPAA_GATE: 'off', MAINTENANCE_REBUILD_ENABLED: 'false', ...env } });
    let out = '';
    const t = setTimeout(() => reject(new Error(`server :${port} did not start:\n${out.slice(-400)}`)), 60000);
    const on = (d) => { out += d; if (out.includes('server running on port')) { clearTimeout(t); setTimeout(() => resolve(child), 3000); } };
    child.stdout.on('data', on); child.stderr.on('data', on);
    child.on('exit', (c) => { clearTimeout(t); reject(new Error(`server :${port} exited (${c}):\n${out.slice(-400)}`)); });
  });
}
const call = async (base, method, url, token, body) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = {}; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
};
const stamp = Date.now();
async function makeUser(base, name) {
  const up = await call(base, 'POST', '/auth/signup', null, { firstName: 'Fd', lastName: 'Test', userName: name, email: `${name}@example.invalid`, password: 'Food-Pass-123!' });
  if (up.status !== 201) throw new Error(`signup ${name}: ${up.status} ${JSON.stringify(up.json)}`);
  const r = await call(base, 'POST', '/auth/signin', null, { userName: name, password: 'Food-Pass-123!' });
  return { name, token: r.json.token, id: r.json.results[0].id };
}

(async () => {
  const children = [];
  const dbs = require('../db/db');
  const created = [];
  try {
    // ---- the parser and the matching (no server) --------------------------------------------------------------
    section('Meal text parser');
    const m1 = parseMeal('biscuits and gravy, sausage and eggs');
    check('two comma pieces', m1.length === 2, JSON.stringify(m1));
    check('"biscuits and gravy" keeps the whole phrase AND offers parts', m1[0].query === 'biscuits and gravy' && m1[0].parts.length === 2);
    check('"sausage and eggs" parts are sausage, eggs', m1[1].parts.map((p) => p.query).join('|') === 'sausage|eggs');
    const m2 = parseMeal('2 eggs');
    check('"2 eggs": qty 2, no unit, query eggs', m2[0].qty === 2 && m2[0].unit === '' && m2[0].query === 'eggs');
    const m3 = parseMeal('1 1/2 cups of cooked rice');
    check('"1 1/2 cups of cooked rice": qty 1.5, unit cup, query cooked rice', m3[0].qty === 1.5 && m3[0].unit === 'cup' && m3[0].query === 'cooked rice', JSON.stringify(m3[0]));
    const m4 = parseMeal('100g chicken + two slices toast; a banana');
    check('"100g", "+", "two slices", ";" and "a"', m4.length === 3 && m4[0].qty === 100 && m4[0].unit === 'g' && m4[1].qty === 2 && m4[1].unit === 'slice' && m4[2].qty === 1 && m4[2].query === 'banana', JSON.stringify(m4));
    check('empty / punctuation only gives no items', parseMeal('  , ; ').length === 0 && parseMeal('').length === 0 && parseMeal(null).length === 0);
    check('at most 12 items', parseMeal(Array.from({ length: 30 }, (_, i) => `food${i}`).join(',')).length === 12);
    check('names: plural and word order ignored', nameSimilarity('eggs', 'Egg') === 1 && nameSimilarity('gravy and biscuits', 'Biscuits and Gravy') === 1);
    check('names: sandwich is not the same dish', nameSimilarity('sausage and eggs', 'Sausage and Egg Sandwich') < 0.8);

    // ---- start everything -------------------------------------------------------------------------------------
    await new Promise((r) => fakeServer.listen(0, '127.0.0.1', r));
    const fp = fakeServer.address().port;
    const keyed = { FATSECRET_CLIENT_ID: 'testid', FATSECRET_CLIENT_SECRET: 'testsecret', FATSECRET_API_URL: `http://127.0.0.1:${fp}/rest`, FATSECRET_TOKEN_URL: `http://127.0.0.1:${fp}/connect/token`, RATE_LIMIT: 'on', RATE_LIMIT_FOODS_MAX: '14' };
    children.push(await startApp(4112, keyed));
    children.push(await startApp(4113, { FATSECRET_CLIENT_ID: '', FATSECRET_CLIENT_SECRET: '' }));
    const A = 'http://127.0.0.1:4112', B = 'http://127.0.0.1:4113';
    const u1 = await makeUser(A, `testfood_${stamp}_a`); created.push(u1.id);
    const u2 = await makeUser(A, `testfood_${stamp}_b`); created.push(u2.id);
    const u4 = await makeUser(A, `testfood_${stamp}_d`); created.push(u4.id);
    const u3 = await makeUser(B, `testfood_${stamp}_c`); created.push(u3.id);

    // ---- switch -------------------------------------------------------------------------------------------------
    section('On / off');
    check('with keys: enabled true', (await call(A, 'GET', `/bgtracker/foods/enabled/${u1.id}`, u1.token)).json.enabled === true);
    check('without keys: enabled false', (await call(B, 'GET', `/bgtracker/foods/enabled/${u3.id}`, u3.token)).json.enabled === false);
    const off = await call(B, 'POST', `/bgtracker/foods/lookup/${u3.id}`, u3.token, { text: 'eggs' });
    check('without keys: lookup answers 404', off.status === 404, JSON.stringify(off));
    check('no token: 401', (await call(A, 'GET', `/bgtracker/foods/enabled/${u1.id}`, null)).status === 401);
    check('another user\'s id: 403', (await call(A, 'POST', `/bgtracker/foods/lookup/${u1.id}`, u2.token, { text: 'eggs' })).status === 403);

    // ---- the example from the idea ------------------------------------------------------------------------------
    section('Lookup: biscuits and gravy, sausage and eggs');
    const r1 = await call(A, 'POST', `/bgtracker/foods/lookup/${u1.id}`, u1.token, { text: 'biscuits and gravy, sausage and eggs' });
    const it = r1.json.items || [];
    check('200 and three foods', r1.status === 200 && it.length === 3, JSON.stringify(r1.json).slice(0, 300));
    check('1: Biscuits and Gravy used as ONE dish', it[0] && it[0].food.name === 'Biscuits and Gravy' && it[0].nutrients.carbs === 41);
    check('2: sausage -> Pork Sausage, first serving 1 link', it[1] && it[1].food.name === 'Pork Sausage' && it[1].serving === '1 link' && it[1].nutrients.calories === 90);
    check('3: eggs -> Egg (not the sandwich)', it[2] && it[2].food.name === 'Egg' && it[2].nutrients.calories === 72);
    check('single-result object and single-serving object were handled', !!it[1] && !!it[2]);
    check('totals add up (carbs 42, calories 592)', r1.json.totals && r1.json.totals.carbs === 42 && r1.json.totals.calories === 592, JSON.stringify(r1.json.totals));
    check('fats, sodium, protein carried', it[0] && it[0].nutrients.saturated === 8 && it[0].nutrients.trans === 0.5 && it[0].nutrients.sodium === 1100 && it[0].nutrients.protein === 9);
    check('vitamin C mg -> mcg (0.2 mg = 200)', it[0] && it[0].nutrients.vitaminC === 200 && it[0].nutrients.vitaminA === 5);
    check('candidates are offered to choose from', it[2] && it[2].candidates.length === 2 && it[2].candidates[0].carbs === 0.4);
    check('typed text and amount come back for a re-pick', it[2] && it[2].text === 'eggs' && it[2].qty === null);

    section('Amounts and units');
    const g = async (text) => (await call(A, 'POST', `/bgtracker/foods/lookup/${u1.id}`, u1.token, { text })).json;
    const two = (await g('2 eggs')).items[0];
    check('"2 eggs" doubles the egg (144 kcal, 12.6 g protein)', two.nutrients.calories === 144 && two.nutrients.protein === 12.6, JSON.stringify(two.nutrients));
    const cups = (await g('2 cups grits')).items[0];
    check('"2 cups grits" uses the 1 cup serving twice (62 g carbs)', cups.serving === '2 x 1 cup' && cups.nutrients.carbs === 62 && cups.guess === false, JSON.stringify(cups));
    const gram = (await g('100 g grits')).items[0];
    check('"100 g grits" scales by weight (13 g carbs)', gram.nutrients.carbs === 13, JSON.stringify(gram));
    const slices = (await g('3 slices grits')).items[0];
    check('an amount with an unknown unit is flagged as a guess', slices.status === 'matched' && slices.guess === true);
    const none = await g('unseen food');
    check('nothing found -> status not_found, no totals', none.items[0].status === 'not_found' && none.totals.carbs === 0);
    const picked = await call(A, 'POST', `/bgtracker/foods/pick/${u1.id}`, u1.token, { food_id: '9', qty: 2, unit: '' });
    check('pick another food at the typed amount (2 sandwiches, 56 g carbs)', picked.json.item && picked.json.item.nutrients.carbs === 56 && picked.json.item.food.name === 'Sausage and Egg Sandwich', JSON.stringify(picked.json));
    const badPick = await call(A, 'POST', `/bgtracker/foods/pick/${u1.id}`, u1.token, { food_id: '99999' });
    check('pick of an unknown food: plain error', badPick.status === 500 && /not be found|not available|try again/i.test(badPick.json.error || ''), JSON.stringify(badPick));

    section('Caching and the token');
    const s0 = fake.searches, g0 = fake.gets;
    await g('biscuits and gravy, sausage and eggs');
    check('repeat lookup costs no new fatsecret calls', fake.searches === s0 && fake.gets === g0);
    check('one token reused for everything so far', fake.tokens === 1, `tokens=${fake.tokens}`);

    section('Bad input');
    check('empty text: 400', (await call(A, 'POST', `/bgtracker/foods/lookup/${u1.id}`, u1.token, { text: '   ' })).status === 400);
    check('301 characters: 400', (await call(A, 'POST', `/bgtracker/foods/lookup/${u1.id}`, u1.token, { text: 'a'.repeat(301) })).status === 400);

    // ---- nothing saved by a lookup, apply writes ---------------------------------------------------------------
    section('Saving to the Nutrition table (apply)');
    const rows = async (u) => (await call(A, 'GET', `/bgtracker/nutritions/${u.id}`, u.token)).json.results || [];
    check('lookups saved nothing', (await rows(u1)).length === 0);
    const nut = r1.json.totals;
    let ap = await call(A, 'POST', `/bgtracker/foods/apply/${u1.id}`, u1.token, { date: '10-14-26', slot: 'B', text: 'biscuits and gravy, sausage and eggs', nutrients: nut });
    check('apply breakfast: 200 and carbs 42', ap.status === 200 && ap.json.carbs === 42, JSON.stringify(ap));
    let list = await rows(u1);
    check('one Nutrition row, dated 10-14-26', list.length === 1 && list[0].date === '10-14-26');
    check('breakfast name, calories, carbs, sodium, vitamin C saved', list[0].foodNameB === 'biscuits and gravy, sausage and eggs' && list[0].caloriesB === 592 && list[0].carbsB === 42 && list[0].sodiumB === 1100 && list[0].vitaminCB === 200, JSON.stringify(list[0]).slice(0, 200));
    check('other meals left empty', list[0].foodNameL === '' && list[0].caloriesL === 0 && list[0].carbsD === 0);
    ap = await call(A, 'POST', `/bgtracker/foods/apply/${u1.id}`, u1.token, { date: '2026-10-14', slot: 'L', text: '2 cups grits', nutrients: cups.nutrients });
    list = await rows(u1);
    check('lunch the same day goes into the SAME row (ISO date accepted too)', ap.status === 200 && list.length === 1 && list[0].foodNameL === '2 cups grits' && list[0].carbsL === 62);
    check('breakfast untouched by the lunch', list[0].foodNameB === 'biscuits and gravy, sausage and eggs' && list[0].carbsB === 42);
    await call(A, 'POST', `/bgtracker/foods/apply/${u1.id}`, u1.token, { date: '10-14-26', slot: 'B', text: '2 eggs', nutrients: two.nutrients });
    list = await rows(u1);
    check('applying breakfast again replaces it', list.length === 1 && list[0].foodNameB === '2 eggs' && list[0].caloriesB === 144 && list[0].carbsL === 62);
    await call(A, 'POST', `/bgtracker/foods/apply/${u1.id}`, u1.token, { date: '10-15-26', slot: 'Bed', text: 'grits', nutrients: cups.nutrients });
    list = await rows(u1);
    check('another day gets its own row', list.length === 2 && list.some((r) => r.date === '10-15-26' && r.foodNameBed === 'grits' && r.carbsBed === 62));
    check('other user sees none of it', (await rows(u2)).length === 0);
    const bad = (body) => call(A, 'POST', `/bgtracker/foods/apply/${u1.id}`, u1.token, { date: '10-14-26', slot: 'B', text: 'x', nutrients: nut, ...body });
    check('unknown meal slot: 400', (await bad({ slot: 'X' })).status === 400);
    check('slot injection attempt: 400', (await bad({ slot: "B`=1;--" })).status === 400);
    check('missing / impossible date: 400', (await bad({ date: '' })).status === 400 && (await bad({ date: '13-45-26' })).status === 400);
    check('negative number: 400', (await bad({ nutrients: { ...nut, carbs: -5 } })).status === 400);
    check('not a number: 400', (await bad({ nutrients: { ...nut, sodium: 'lots' } })).status === 400);
    check('absurd number: 400', (await bad({ nutrients: { ...nut, calories: 99999999 } })).status === 400);
    check('someone else\'s id: 403', (await call(A, 'POST', `/bgtracker/foods/apply/${u1.id}`, u2.token, { date: '10-14-26', slot: 'B', text: 'x', nutrients: nut })).status === 403);
    check('refused requests changed nothing', (await rows(u1)).length === 2);
    const typed = await call(A, 'POST', `/bgtracker/foods/apply/${u1.id}`, u1.token, { date: '10-16-26', slot: 'D', text: 'my own meal', nutrients: { carbs: 12.4 } });
    list = await rows(u1);
    check('only carbs sent (person edited): rest saved as 0, carbs rounded', typed.status === 200 && list.some((r) => r.date === '10-16-26' && r.carbsD === 12 && r.caloriesD === 0));

    // ---- fatsecret trouble ---------------------------------------------------------------------------------------
    section('fatsecret refuses (wrong key / IP not allowed / down)');
    fake.broken = true;
    const brk = await call(A, 'POST', `/bgtracker/foods/lookup/${u1.id}`, u1.token, { text: 'mystery stew' });
    check('plain 500 message, no secret or reason shown', brk.status === 500 && /not available|try again/i.test(brk.json.error || '') && !/testsecret|testid|invalid_client|token/i.test(JSON.stringify(brk.json)), JSON.stringify(brk));
    const cached = await g('2 eggs');   // lookups answered from memory need no token and no fatsecret
    check('answers already cached still work while fatsecret is down', cached.items && cached.items[0].status === 'matched');
    fake.broken = false;
    const back = await call(A, 'POST', `/bgtracker/foods/lookup/${u1.id}`, u1.token, { text: 'strange pie' });
    check('recovers by itself when fatsecret is back (fresh token)', back.status === 200);

    // ---- per-user limit ------------------------------------------------------------------------------------------
    section('Limit per person');
    let limited = null; let sent = 0;
    for (let i = 0; i < 30 && !limited; i++) { sent++; const r = await call(A, 'POST', `/bgtracker/foods/lookup/${u2.id}`, u2.token, { text: 'eggs' }); if (r.status === 429) limited = r; }
    check('429 after 14 lookups in an hour (setting RATE_LIMIT_FOODS_MAX)', limited && sent === 15, `sent=${sent}`);
    check('429 message is readable', limited && /too quickly/i.test(limited.json.error || ''));
    check('the limit is per person (another user still fine)', (await call(A, 'POST', `/bgtracker/foods/lookup/${u4.id}`, u4.token, { text: 'eggs' })).status === 200);
  } catch (e) {
    failed++; console.log('  FAIL  unexpected error', e && e.stack ? e.stack : e);
  } finally {
    for (const c of children) { try { c.kill(); } catch { /* stopped */ } }
    try { fakeServer.close(); } catch { /* not started */ }
    try {
      for (const id of created) {
        await dbs.bgtracker.promise().query('DELETE FROM nutritions WHERE user_id=?', [id]);
        await dbs.bgtracker.promise().query('DELETE FROM preferences WHERE user_id=?', [id]).catch(() => {});
        await dbs.owenenterprises.promise().query('DELETE FROM feature_preferences WHERE user_id=?', [id]).catch(() => {});
        await dbs.owenenterprises.promise().query('DELETE FROM users WHERE id=?', [id]).catch(() => {});
      }
    } catch (e) { console.log('cleanup problem:', e.message); }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
})();
