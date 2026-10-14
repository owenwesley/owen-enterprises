/**
 * utils/fatsecret.js  (1.13.6)
 *
 * Small client for the fatsecret Platform API (https://platform.fatsecret.com), Basic edition:
 *   foods.search v1   GET /rest/foods/search/v1   -> a short list of matching foods
 *   food.get v5       GET /rest/food/v5           -> every serving of one food with its nutrients
 *
 * Settings (Plesk "Custom environment variables", NEVER a .env inside /httpdocs):
 *   FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET   both set  -> the food lookup is switched on
 *   FATSECRET_API_URL    default https://platform.fatsecret.com/rest      (the checks point it at a fake server)
 *   FATSECRET_TOKEN_URL  default https://oauth.fatsecret.com/connect/token
 *
 * fatsecret only gives out tokens to IP addresses registered on the app's key page. If the server's outgoing
 * IP is not on that list the token request fails (see the log line "fatsecret token"): the person only sees
 * the generic "food lookup is not available" message, never the secret or the reason.
 *
 * Basic allows 5,000 calls a day for the whole site, so answers are cached in memory (a restart clears them).
 */
const DAY = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

const apiUrl = () => (process.env.FATSECRET_API_URL || 'https://platform.fatsecret.com/rest').replace(/\/+$/, '');
const tokenUrl = () => process.env.FATSECRET_TOKEN_URL || 'https://oauth.fatsecret.com/connect/token';

function isConfigured() {
  return Boolean(process.env.FATSECRET_CLIENT_ID && process.env.FATSECRET_CLIENT_SECRET);
}

function unavailable(msg) {
  const e = new Error(msg || 'The food database is not available right now. Please try again, or type the carbs yourself.');
  e.expose = true;
  return e;
}

// ── tiny in-memory cache (Map keeps insertion order, so the first key is the oldest) ──
const caches = { search: new Map(), food: new Map() };
const MAX_ENTRIES = 800;
function cacheGet(name, key) {
  const hit = caches[name].get(key);
  if (!hit) return undefined;
  if (hit.until < Date.now()) { caches[name].delete(key); return undefined; }
  return hit.value;
}
function cacheSet(name, key, value) {
  const c = caches[name];
  if (c.size >= MAX_ENTRIES) c.delete(c.keys().next().value);
  c.set(key, { value, until: Date.now() + DAY });
}
function clearCache() { caches.search.clear(); caches.food.clear(); token = null; tokenPending = null; }

// ── token (client credentials), reused until a minute before it expires ──
let token = null;          // { value, until }
let tokenPending = null;   // one request at a time

async function fetchToken() {
  const id = process.env.FATSECRET_CLIENT_ID;
  const secret = process.env.FATSECRET_CLIENT_SECRET;
  let res;
  try {
    res = await fetch(tokenUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      },
      body: 'grant_type=client_credentials&scope=basic',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error('fatsecret token: request failed:', err && err.message);
    throw unavailable();
  }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !body || !body.access_token) {
    // Typical reasons: wrong key/secret, or this server's IP is not on the key's allowed list.
    console.error(`fatsecret token: HTTP ${res.status}`, body && (body.error_description || body.error) ? (body.error_description || body.error) : '');
    throw unavailable();
  }
  const secs = Number(body.expires_in) > 120 ? Number(body.expires_in) : 3600;
  token = { value: body.access_token, until: Date.now() + (secs - 60) * 1000 };
  return token.value;
}

async function getToken(force) {
  if (!force && token && token.until > Date.now()) return token.value;
  if (!tokenPending) tokenPending = fetchToken().finally(() => { tokenPending = null; });
  return tokenPending;
}

// GET one API method; one retry with a fresh token if the first one was refused.
async function call(path, params) {
  if (!isConfigured()) throw unavailable('The food lookup is not switched on for this site.');
  const qs = new URLSearchParams({ ...params, format: 'json' }).toString();
  for (let attempt = 0; attempt < 2; attempt++) {
    const bearer = await getToken(attempt > 0);
    let res;
    try {
      res = await fetch(`${apiUrl()}${path}?${qs}`, {
        headers: { Authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      console.error(`fatsecret ${path}: request failed:`, err && err.message);
      throw unavailable();
    }
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    if (res.status === 401 && attempt === 0) { token = null; continue; }
    if (res.status === 429) throw unavailable('The food database is busy (daily limit reached). Please try again later, or type the carbs yourself.');
    // fatsecret reports some failures as HTTP 200 with { error: { code, message } }
    if (!res.ok || !body || body.error) {
      const code = body && body.error && body.error.code;
      if ((code === 13 || code === 14) && attempt === 0) { token = null; continue; }   // invalid / expired token
      console.error(`fatsecret ${path}: HTTP ${res.status}`, body && body.error ? JSON.stringify(body.error) : '');
      throw unavailable();
    }
    return body;
  }
  throw unavailable();
}

const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/** "Per 1 cup - Calories: 200kcal | Fat: 10.00g | Carbs: 20.00g | Protein: 5.00g" -> short facts */
function parseDescription(text) {
  const s = String(text || '');
  const per = (s.match(/^\s*Per\s+(.*?)\s+-\s+/i) || [])[1] || '';
  const grab = (label) => { const m = s.match(new RegExp(label + ':\\s*([0-9.]+)', 'i')); return m ? num(m[1]) : null; };
  return { per, calories: grab('Calories'), carbs: grab('Carbs') };
}

/** Up to `max` foods matching the words. Each: { id, name, brand, type, per, calories, carbs } (carbs/calories are for `per`). */
async function searchFoods(query, max = 5) {
  const q = String(query || '').trim().toLowerCase().slice(0, 120);
  if (!q) return [];
  const key = `${q}|${max}`;
  const cached = cacheGet('search', key);
  if (cached) return cached;
  const body = await call('/foods/search/v1', { search_expression: q, max_results: String(max), page_number: '0' });
  const foods = asArray(body && body.foods && body.foods.food).map((f) => ({
    id: String(f.food_id),
    name: String(f.food_name || ''),
    brand: f.brand_name ? String(f.brand_name) : '',
    type: f.food_type === 'Brand' ? 'Brand' : 'Generic',
    ...parseDescription(f.food_description),
  })).filter((f) => f.id && f.name);
  cacheSet('search', key, foods);
  return foods;
}

// fatsecret units: g for fats/protein/carbs/fiber/sugar; mg for cholesterol/sodium/potassium/calcium/iron/vitamin C;
// mcg for vitamin A and D.
function normaliseServing(s) {
  return {
    id: String(s.serving_id),
    description: String(s.serving_description || ''),
    metricAmount: num(s.metric_serving_amount),
    metricUnit: String(s.metric_serving_unit || ''),
    units: num(s.number_of_units) || 1,
    calories: num(s.calories), carbohydrate: num(s.carbohydrate), protein: num(s.protein),
    fat: num(s.fat), saturated: num(s.saturated_fat), polyunsaturated: num(s.polyunsaturated_fat),
    monounsaturated: num(s.monounsaturated_fat), trans: num(s.trans_fat),
    cholesterol: num(s.cholesterol), sodium: num(s.sodium), potassium: num(s.potassium),
    fiber: num(s.fiber), sugar: num(s.sugar), vitaminA: num(s.vitamin_a), vitaminC: num(s.vitamin_c),
    vitaminD: num(s.vitamin_d), calcium: num(s.calcium), iron: num(s.iron),
  };
}

/** One food with all its servings: { id, name, brand, type, servings: [...] } */
async function getFood(id) {
  const fid = String(id || '').replace(/[^0-9]/g, '').slice(0, 15);
  if (!fid) throw unavailable('That food could not be found.');
  const cached = cacheGet('food', fid);
  if (cached) return cached;
  const body = await call('/food/v5', { food_id: fid });
  const f = body && body.food;
  if (!f) throw unavailable('That food could not be found.');
  const food = {
    id: String(f.food_id || fid),
    name: String(f.food_name || ''),
    brand: f.brand_name ? String(f.brand_name) : '',
    type: f.food_type === 'Brand' ? 'Brand' : 'Generic',
    servings: asArray(f.servings && f.servings.serving).map(normaliseServing).filter((s) => s.id),
  };
  if (!food.servings.length) throw unavailable('That food has no nutrition information.');
  cacheSet('food', fid, food);
  return food;
}

module.exports = { isConfigured, searchFoods, getFood, clearCache, parseDescription };
