/**
 * utils/mealParser.js  (1.13.6)
 *
 * Turns what a person typed ("biscuits and gravy, 2 eggs, sausage and 1 cup grits") into a list of foods to
 * look up. No guessing from a database here, only text work:
 *
 *   1. split on commas, semicolons, new lines, "+" and the word "plus";
 *   2. read a leading amount ("2", "1/2", "1.5", "two", "a") and an optional unit ("cup", "slice", "g" ...);
 *   3. a piece that still contains " and " / " with " / "&" is kept WHOLE and also split into `parts`.
 *      The lookup tries the whole phrase first ("biscuits and gravy" is one dish) and only falls back to the
 *      parts ("sausage and eggs" is two foods) when no food is named almost exactly like the whole phrase.
 */

const MAX_TEXT = 300;
const MAX_ITEMS = 12;

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  half: 0.5, quarter: 0.25,
};

// unit word as typed -> canonical unit
const UNITS = {
  cup: 'cup', cups: 'cup', c: 'cup',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  g: 'g', gram: 'g', grams: 'g',
  ml: 'ml',
  slice: 'slice', slices: 'slice',
  piece: 'piece', pieces: 'piece',
  serving: 'serving', servings: 'serving',
  bowl: 'bowl', bowls: 'bowl',
  glass: 'glass', glasses: 'glass',
};

function readAmount(words) {
  const w = words[0] ? words[0].toLowerCase() : '';
  let qty = null;
  let used = 0;
  let m;
  if ((m = w.match(/^(\d+)\s*\/\s*(\d+)$/)) && Number(m[2]) > 0) { qty = Number(m[1]) / Number(m[2]); used = 1; }
  else if ((m = w.match(/^(\d+(?:\.\d+)?)([a-z]+)?$/))) {
    qty = Number(m[1]); used = 1;
    // "100g" / "2cups" typed without a space: put the unit back as the next word
    if (m[2] && UNITS[m[2]]) { words[0] = m[2]; used = 0; }
  } else if (w in WORD_NUMBERS) { qty = WORD_NUMBERS[w]; used = 1; }
  if (qty === null || !(qty > 0)) return { qty: null, rest: words };
  let rest = words.slice(used);
  // "1 1/2 cups": a whole number followed by a fraction
  if (rest[0] && /^\d+\s*\/\s*\d+$/.test(rest[0])) {
    const [a, b] = rest[0].split('/').map(Number);
    if (b > 0) { qty += a / b; rest = rest.slice(1); }
  }
  if (qty > 1000) qty = 1000;
  return { qty, rest };
}

/** "2 cups of cooked rice" -> { qty: 2, unit: 'cup', query: 'cooked rice' } */
function parsePiece(raw) {
  let words = raw.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  let qty = null;
  let unit = '';
  const amt = readAmount(words);
  if (amt.qty !== null) {
    qty = amt.qty;
    words = amt.rest;
    const u = words[0] ? UNITS[words[0].toLowerCase().replace(/\.$/, '')] : undefined;
    if (u) { unit = u; words = words.slice(1); }
    if (words[0] && words[0].toLowerCase() === 'of') words = words.slice(1);
  }
  const query = words.join(' ').replace(/[^\p{L}\p{N}\s'&-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return { qty, unit, query };
}

/** @returns [{ text, qty, unit, query, parts: [{ text, qty, unit, query }] }] ; parts is [] when nothing to split */
function parseMeal(input) {
  const text = String(input || '').slice(0, MAX_TEXT);
  const pieces = text.split(/[,;\n+]|\bplus\b/i).map((s) => s.trim()).filter(Boolean);
  const items = [];
  for (const piece of pieces) {
    const whole = parsePiece(piece);
    if (!whole.query) continue;
    const bits = piece.split(/\s+(?:and|with|&)\s+/i).map((s) => s.trim()).filter(Boolean);
    const parts = bits.length > 1 ? bits.map(parsePiece).filter((p) => p.query) : [];
    items.push({ text: piece, ...whole, parts: parts.length > 1 ? parts.map((p, i) => ({ text: bits[i], ...p })) : [] });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

// ── name matching ───────────────────────────────────────────────────────────────────────────────
const STOP = new Set(['and', 'with', 'the', 'of', 'a', 'an', '&', 'in', 'on']);
function stem(w) {
  if (w.length > 3 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
const tokens = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOP.has(w)).map(stem);

/** 0..1: how nearly two food names are the same set of words (1 = identical words, order and plurals ignored). */
function nameSimilarity(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let both = 0;
  A.forEach((t) => { if (B.has(t)) both++; });
  return both / (A.size + B.size - both);
}

module.exports = { parseMeal, parsePiece, nameSimilarity, MAX_TEXT, MAX_ITEMS };
