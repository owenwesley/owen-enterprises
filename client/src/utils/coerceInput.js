/**
 * coerceInput.js
 *
 * DOM inputs always hand back strings — `<input type="number">` included.
 * Without coercion a quantity of 5 gets stored as the string "5", which
 * then breaks arithmetic downstream (e.g. "5" - 2 works but "5" + 2 gives
 * "52", and sums across rows silently concatenate instead of adding).
 *
 * This normalises a change event into a correctly typed value based on the
 * column's declared type, so state and the database always hold real
 * numbers/booleans rather than stringified ones.
 */
export function coerceInputValue(e, columnType) {
  if (e?.target?.type === 'checkbox') {
    return Boolean(e.target.checked);
  }

  const raw = e?.target?.value;

  if (columnType === 'number') {
    // Preserve an empty field as '' so the input can be cleared while
    // typing; only convert once there's something to convert.
    if (raw === '' || raw == null) return '';
    const n = Number(raw);
    return Number.isNaN(n) ? '' : n;
  }

  return raw;
}

/**
 * Looks up a column's declared type by its `prop` name, so callers that
 * only know the field name can still coerce correctly.
 */
export function columnTypeFor(columns, prop) {
  if (!Array.isArray(columns)) return 'text';
  const col = columns.find((c) => c.prop === prop);
  return col?.type ?? 'text';
}

/**
 * True if a BGTracker field stores a number. Derived from the actual column
 * definitions in buildColumns.js:
 *   readings  — sugar, carbs and insulin fields are numeric; chkMeds are checkboxes
 *   bp        — hbp/lbp/hr (+ the 2nd-reading variants) are numeric
 *   weights   — kg/lbs/bmi are numeric
 *   meds      — dose/quantity/am/noon/evening/bed are numeric;
 *               name/unit/prescriber are text
 * `date` is always text (stored MM-DD-YY).
 */
const NUMERIC_EXACT = new Set([
  'hbp', 'lbp', 'hr', 'hbp2', 'lbp2', 'hr2',
  'kg', 'lbs', 'bmi',
  'dose', 'quantity', 'am', 'noon', 'evening', 'bed',
]);

export function isNumericField(prop) {
  if (!prop) return false;
  if (NUMERIC_EXACT.has(prop)) return true;
  // readings columns are prefix-based: sugarB, carbsL, insulinFBed, ...
  return /^(sugar|carbs|insulin)/.test(prop);
}

/** Coerce using only the field name, for callers without column defs. */
export function coerceByFieldName(e, prop) {
  return coerceInputValue(e, isNumericField(prop) ? 'number' : 'text');
}
