/**
 * utils/foodLookup.js  (1.13.6)
 *
 * Meal text -> foods -> nutrition numbers in the shape of the Nutrition table.
 *
 *   lookupMeal(text)            parse, search fatsecret for each piece, pick the best serving, scale it
 *   resolveFood(id, qty, unit)  the same for ONE chosen food (the person picked another match)
 *   totalNutrients(items)       sum of the matched items
 *
 * Everything returned is an ESTIMATE shown to the person to check before it is saved (the screen has a
 * confirm step); nothing here writes to the database.
 */
const { searchFoods, getFood } = require('./fatsecret');
const { parseMeal, nameSimilarity } = require('./mealParser');

// How alike a food's name must be to the WHOLE phrase to use it instead of splitting on "and".
const WHOLE_MATCH = 0.8;
// The best search result for a single piece must share at least this much with the words typed.
const PIECE_MATCH = 0.34;

// Nutrition-table field -> how to read it from a fatsecret serving. int = whole-number column, else 1 decimal.
// Vitamin C: fatsecret gives mg, the table header says mcg, so it is multiplied by 1000.
const FIELDS = [
  { key: 'calories',        from: 'calories',        int: true },
  { key: 'saturated',       from: 'saturated' },
  { key: 'trans',           from: 'trans' },
  { key: 'polyunsaturated', from: 'polyunsaturated' },
  { key: 'monosaturated',   from: 'monounsaturated' },
  { key: 'cholesterol',     from: 'cholesterol',     int: true },
  { key: 'sodium',          from: 'sodium',          int: true },
  { key: 'carbs',           from: 'carbohydrate',    int: true },
  { key: 'fiber',           from: 'fiber',           int: true },
  { key: 'sugars',          from: 'sugar' },
  { key: 'protein',         from: 'protein' },
  { key: 'vitaminA',        from: 'vitaminA',        int: true },
  { key: 'vitaminC',        from: 'vitaminC',        int: true, scale: 1000 },
  { key: 'vitaminD',        from: 'vitaminD',        int: true },
  { key: 'calcium',         from: 'calcium',         int: true },
  { key: 'iron',            from: 'iron' },
  { key: 'potassium',       from: 'potassium',       int: true },
];
const NUTRIENT_KEYS = FIELDS.map((f) => f.key);
const round1 = (n) => Math.round(n * 10) / 10;

const leadingNumber = (desc) => {
  const m = String(desc || '').match(/^\s*(\d+(?:\.\d+)?)(?:\s+(\d+)\s*\/\s*(\d+)|\s*\/\s*(\d+))?/);
  if (!m) return 1;
  let n = Number(m[1]);
  if (m[2] && Number(m[3]) > 0) n += Number(m[2]) / Number(m[3]);
  else if (m[4] && Number(m[4]) > 0) n = n / Number(m[4]);
  return n > 0 ? n : 1;
};
const hasWord = (desc, word) => new RegExp(`(^|[^a-z])${word}s?([^a-z]|$)`, 'i').test(desc || '');

/**
 * Choose the serving to use and the factor to multiply it by.
 * The Basic plan does not say which serving is the usual one, so: a serving that matches the unit the person
 * typed (cup, slice, g ...) if there is one, otherwise the food's first listed serving.
 * `guess` is true when the amount could not be matched to a real serving size.
 */
function pickServing(food, qty, unit) {
  const servings = food.servings;
  const amount = qty && qty > 0 ? qty : 1;
  if (unit === 'g' || unit === 'ml' || unit === 'oz') {
    const metric = servings.find((s) => s.metricUnit === unit && s.metricAmount > 0);
    if (metric) return { serving: metric, factor: amount / metric.metricAmount, guess: false };
  } else if (unit) {
    const named = servings.find((s) => hasWord(s.description, unit));
    if (named) return { serving: named, factor: amount / leadingNumber(named.description), guess: false };
  }
  const first = servings[0];
  // "2 eggs" -> first serving "1 large" counts once, so twice for 2.  "2 servings" -> 2 x the first serving.
  const factor = amount / (unit === 'serving' ? 1 : leadingNumber(first.description));
  return { serving: first, factor, guess: Boolean(unit && unit !== 'serving') };
}

function scale(serving, factor) {
  const out = {};
  for (const f of FIELDS) {
    const raw = (serving[f.from] || 0) * factor * (f.scale || 1);
    out[f.key] = f.int ? Math.round(raw) : round1(raw);
  }
  return out;
}

function describe(food, serving, factor, qty, unit, guess) {
  const asked = qty ? `${qty}${unit ? ' ' + unit : ''}` : '1 serving';
  const size = Math.abs(factor - 1) < 0.005 ? serving.description : `${round1(factor)} x ${serving.description}`;
  return { asked, serving: size, guess };
}

/** One piece (qty/unit/query) -> an item, or a "not found" item. */
async function lookupPiece(piece) {
  const found = await searchFoods(piece.query, 5);
  const candidates = found.map((f) => ({ id: f.id, name: f.name, brand: f.brand, type: f.type, per: f.per, carbs: f.carbs, calories: f.calories }));
  const best = found.find((f) => nameSimilarity(piece.query, `${f.brand} ${f.name}`) >= PIECE_MATCH)
    || found.find((f) => nameSimilarity(piece.query, f.name) >= PIECE_MATCH);
  if (!best) return { text: piece.text, qty: piece.qty, unit: piece.unit, status: 'not_found', candidates };
  const item = await resolveFood(best.id, piece.qty, piece.unit);
  return { ...item, text: piece.text, qty: piece.qty, unit: piece.unit, candidates };
}

/** One chosen food at an amount -> { status:'matched', food, serving, asked, nutrients, guess } */
async function resolveFood(foodId, qty, unit) {
  const food = await getFood(foodId);
  const { serving, factor, guess } = pickServing(food, qty, unit);
  return {
    status: 'matched',
    food: { id: food.id, name: food.name, brand: food.brand, type: food.type },
    ...describe(food, serving, factor, qty, unit, guess),
    nutrients: scale(serving, factor),
  };
}

function totalNutrients(items) {
  const total = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
  for (const it of items) {
    if (!it || !it.nutrients) continue;
    for (const k of NUTRIENT_KEYS) total[k] += Number(it.nutrients[k]) || 0;
  }
  for (const f of FIELDS) total[f.key] = f.int ? Math.round(total[f.key]) : round1(total[f.key]);
  return total;
}

/** Whole text -> { items: [...], totals } */
async function lookupMeal(text) {
  const pieces = parseMeal(text);
  const items = [];
  for (const piece of pieces) {
    // 1. a phrase with "and" / "with": is there ONE food named almost exactly like it? ("biscuits and gravy")
    if (piece.parts.length) {
      const found = await searchFoods(piece.query, 5);
      const dish = found.find((f) => nameSimilarity(piece.query, f.name) >= WHOLE_MATCH);
      if (dish) {
        const item = await resolveFood(dish.id, piece.qty, piece.unit);
        items.push({ ...item, text: piece.text, qty: piece.qty, unit: piece.unit, candidates: found.map((f) => ({ id: f.id, name: f.name, brand: f.brand, type: f.type, per: f.per, carbs: f.carbs, calories: f.calories })) });
        continue;
      }
      // 2. otherwise they are separate foods ("sausage and eggs")
      for (const part of piece.parts) items.push(await lookupPiece(part));
      continue;
    }
    items.push(await lookupPiece(piece));
  }
  return { items, totals: totalNutrients(items) };
}

module.exports = { lookupMeal, resolveFood, totalNutrients, NUTRIENT_KEYS, FIELDS, pickServing };
