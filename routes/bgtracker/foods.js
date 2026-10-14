/**
 * routes/bgtracker/foods.js  (1.13.6)   mounted at /bgtracker/foods (auth + ownerOnly + HIPAA gate come from server.js)
 *
 * "What I ate" in the BG table. The person types a meal, the server looks the foods up on fatsecret, the screen
 * shows the result for the person to check, and only then is it saved.
 *
 *   GET  /enabled/:user_id   { enabled }                         is a fatsecret key set on the server?
 *   POST /lookup/:user_id    { text }                            -> { items, totals }      (nothing is saved)
 *   POST /pick/:user_id      { food_id, qty, unit }              -> one resolved item      (person chose another match)
 *   POST /apply/:user_id     { date, slot, text, nutrients }     writes that meal's columns of the day's Nutrition row
 *
 * Lookups are limited per signed-in user (RATE_LIMIT_FOODS_MAX, default 40 an hour) because the free fatsecret plan
 * allows 5,000 calls a day for the whole site.
 */
const express = require('express');
const { toStorageDate } = require('../../utils/dateFormat');
const { isConfigured } = require('../../utils/fatsecret');
const { lookupMeal, resolveFood, NUTRIENT_KEYS, FIELDS } = require('../../utils/foodLookup');
const { MAX_TEXT } = require('../../utils/mealParser');
const { insertNutritions } = require('../../db/sql/bgtracker/nutritions');
const { bgtracker } = require('../../db/db');
const { serverError } = require('../../utils/serverError');
const limits = require('../../middleware/rateLimits');
const router = express.Router();

const SLOTS = ['B', 'L', 'D', 'BB', 'Bed'];
// Same order as the columns in routes/bgtracker/nutritions/add.js
const FIELD_KEYS = ['foodName', ...NUTRIENT_KEYS];
const INT_KEYS = new Set(FIELDS.filter((f) => f.int).map((f) => f.key));

const clientError = (res, status, message) => res.status(status).json({ error: message });
const off = (res) => clientError(res, 404, 'The food lookup is not switched on for this site.');

router.get('/enabled/:user_id', (req, res) => res.json({ enabled: isConfigured() }));

router.post('/lookup/:user_id', limits.foods, async (req, res) => {
  if (!isConfigured()) return off(res);
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return clientError(res, 400, 'Type what you ate first.');
  if (text.length > MAX_TEXT) return clientError(res, 400, `Please keep it under ${MAX_TEXT} characters.`);
  try {
    return res.json(await lookupMeal(text));
  } catch (err) {
    return serverError(res, err, 'foods lookup');
  }
});

router.post('/pick/:user_id', limits.foods, async (req, res) => {
  if (!isConfigured()) return off(res);
  const b = req.body || {};
  const qty = Number(b.qty);
  try {
    const item = await resolveFood(b.food_id, qty > 0 && qty <= 1000 ? qty : null, String(b.unit || '').slice(0, 10));
    return res.json({ item });
  } catch (err) {
    return serverError(res, err, 'foods pick');
  }
});

// Cleans the nutrient numbers the screen sends back (the person may have changed them). Returns null if one is not a number.
function cleanNutrients(src) {
  const out = {};
  for (const k of NUTRIENT_KEYS) {
    const v = src && src[k] !== undefined && src[k] !== '' ? Number(src[k]) : 0;
    if (!Number.isFinite(v) || v < 0 || v > 1000000) return null;
    out[k] = INT_KEYS.has(k) ? Math.round(v) : Math.round(v * 10) / 10;
  }
  return out;
}

router.post('/apply/:user_id', async (req, res) => {
  const b = req.body || {};
  const userId = req.params.user_id;
  const slot = String(b.slot || '');
  if (!SLOTS.includes(slot)) return clientError(res, 400, 'Unknown meal.');
  const date = toStorageDate(b.date);
  if (!date) return clientError(res, 400, 'A valid date is needed.');
  const nutrients = cleanNutrients(b.nutrients);
  if (!nutrients) return clientError(res, 400, 'The nutrition numbers are not valid.');
  const foodName = String(b.text || '').trim().slice(0, 200);

  // The slot's 18 values, in FIELD_KEYS order
  const values = FIELD_KEYS.map((k) => (k === 'foodName' ? foodName : nutrients[k]));
  try {
    const [rows] = await bgtracker.promise().query(
      'SELECT id FROM nutritions WHERE user_id=? AND date=? ORDER BY id LIMIT 1', [userId, date]);
    if (rows.length) {
      // column names come from the constants above, never from the request
      const set = FIELD_KEYS.map((k) => `\`${k}${slot}\`=?`).join(',');
      await bgtracker.promise().query(
        `UPDATE nutritions SET ${set} WHERE id=? AND user_id=?`, [...values, rows[0].id, userId]);
    } else {
      const params = [userId, date];
      for (const s of SLOTS) for (const k of FIELD_KEYS) params.push(s === slot ? values[FIELD_KEYS.indexOf(k)] : (k === 'foodName' ? '' : 0));
      await bgtracker.promise().query(insertNutritions, params);
    }
    return res.json({ message: 'Meal saved to Nutrition', carbs: nutrients.carbs });
  } catch (err) {
    return serverError(res, err, 'foods apply');
  }
});

module.exports = router;
