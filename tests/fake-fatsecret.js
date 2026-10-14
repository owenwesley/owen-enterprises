/**
 * tests/fake-fatsecret.js - a pretend fatsecret server for the automated checks (never talks to the real one).
 * Token + foods.search v1 + food.get v5, with the quirks of the real API: one result is an object not a list, numbers are strings.
 * `fake` counts calls and has `broken` to make everything fail like a wrong key / disallowed IP.
 */
const http = require('http');

const srv = (o) => ({
  serving_id: o.id, serving_description: o.desc, metric_serving_amount: o.g || '0', metric_serving_unit: 'g', number_of_units: '1.000',
  calories: String(o.cal), carbohydrate: String(o.carb), protein: String(o.pro || 0), fat: String(o.fat || 0),
  saturated_fat: String(o.sat || 0), polyunsaturated_fat: String(o.poly || 0), monounsaturated_fat: String(o.mono || 0), trans_fat: String(o.trans || 0),
  cholesterol: String(o.chol || 0), sodium: String(o.sod || 0), potassium: String(o.pot || 0), fiber: String(o.fib || 0), sugar: String(o.sug || 0),
  vitamin_a: String(o.va || 0), vitamin_c: String(o.vc || 0), vitamin_d: String(o.vd || 0), calcium: String(o.ca || 0), iron: String(o.fe || 0),
});
const FOODS = {
  1: { name: 'Biscuits and Gravy', servings: [srv({ id: '101', desc: '1 serving', g: '200', cal: 430, carb: 41, pro: 9, fat: 25, sat: 8, poly: 3, mono: 10, trans: 0.5, chol: 20, sod: 1100, pot: 180, fib: 1, sug: 3, va: 5, vc: 0.2, ca: 60, fe: 2.5 })] },
  2: { name: 'Pork Sausage', servings: [srv({ id: '201', desc: '1 link', g: '25', cal: 90, carb: 0.5, pro: 5, fat: 7.5 }), srv({ id: '202', desc: '1 patty', g: '50', cal: 180, carb: 1, pro: 10, fat: 15 })] },
  3: { name: 'Egg', servings: [srv({ id: '301', desc: '1 large', g: '50', cal: 72, carb: 0.4, pro: 6.3, fat: 4.8, chol: 186, vd: 1.1 })] },   // ONE serving: the real API may send an object, not a list
  4: { name: 'Grits', servings: [srv({ id: '401', desc: '1 cup', g: '242', cal: 143, carb: 31, pro: 3.3, fib: 1 }), srv({ id: '402', desc: '100 g', g: '100', cal: 59, carb: 12.8 })] },
  9: { name: 'Sausage and Egg Sandwich', servings: [srv({ id: '901', desc: '1 sandwich', g: '140', cal: 330, carb: 28, pro: 17, fat: 18 })] },
};
const SEARCH = { 'biscuits and gravy': [1], 'sausage and eggs': [9], sausage: [2], eggs: [3, 9], egg: [3, 9], grits: [4], 'unseen food': [] };
const desc = (id) => { const s = FOODS[id].servings[0]; return `Per ${s.serving_description} - Calories: ${s.calories}kcal | Fat: ${s.fat}g | Carbs: ${s.carbohydrate}g | Protein: ${s.protein}g`; };
const food = (id) => ({ food_id: String(id), food_name: FOODS[id].name, food_type: 'Generic', food_description: desc(id) });

const fake = { tokens: 0, searches: 0, gets: 0, broken: false };
const fakeServer = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (u.pathname === '/connect/token') {
    fake.tokens++;
    const basic = 'Basic ' + Buffer.from('testid:testsecret').toString('base64');
    if (fake.broken || req.headers.authorization !== basic) return send(400, { error: 'invalid_client' });
    return send(200, { access_token: 'tok' + fake.tokens, expires_in: 86400, token_type: 'Bearer' });
  }
  if (fake.broken || !/^Bearer tok\d+$/.test(req.headers.authorization || '')) return send(401, { error: 'unauthorized' });
  if (u.pathname === '/rest/foods/search/v1') {
    fake.searches++;
    const ids = SEARCH[(u.searchParams.get('search_expression') || '').toLowerCase()] || [];
    if (!ids.length) return send(200, { foods: { max_results: '5', total_results: '0', page_number: '0' } });
    const list = ids.map(food);
    return send(200, { foods: { food: list.length === 1 ? list[0] : list, max_results: '5', total_results: String(list.length), page_number: '0' } });
  }
  if (u.pathname === '/rest/food/v5') {
    fake.gets++;
    const f = FOODS[u.searchParams.get('food_id')];
    if (!f) return send(200, { error: { code: 106, message: 'Invalid ID' } });
    return send(200, { food: { food_id: u.searchParams.get('food_id'), food_name: f.name, food_type: 'Generic', servings: { serving: f.servings.length === 1 ? f.servings[0] : f.servings } } });
  }
  return send(404, {});
});


module.exports = { fake, fakeServer, FOODS };
