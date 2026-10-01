/**
 * utils/dateFormat.js
 *
 * Date handling at the API boundary.
 *
 *   STORAGE — every `date` column (readings, bloodpressures, weights,
 *             nutritions, meetings) holds ISO 'YYYY-MM-DD'. ISO strings sort
 *             chronologically as plain text, so `ORDER BY date` is correct.
 *   OUTPUT  — the API returns dates as 'MM-DD-YY' (e.g. '2026-09-09' comes out
 *             as '09-09-26'), which is what the frontend displays.
 *   INPUT   — writes accept 'MM-DD-YY', 'MM-DD-YYYY' or 'YYYY-MM-DD' (with '-'
 *             or '/'), and are normalised to ISO before they reach the DB.
 *
 * Two-digit years are always read as 20xx, matching the frontend's
 * todayFormatted() convention (this app has no data from the 1900s).
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = (n) => String(n).padStart(2, '0');

/** True only for real calendar dates (rejects 02-30, 13-01, etc.). */
function isRealDate(y, m, d) {
  if (y < 1900 || y > 2999 || m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Normalises any supported date string to ISO 'YYYY-MM-DD'.
 *   undefined / null / '' → ''      (an empty date stays empty)
 *   unparseable / not a real date   → null   (caller should reject)
 */
function toStorageDate(input) {
  if (input === undefined || input === null) return '';
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (s === '') return '';

  let y, m, d, mt;
  if ((mt = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/))) {
    y = Number(mt[1]); m = Number(mt[2]); d = Number(mt[3]);
  } else if ((mt = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})$/))) {
    m = Number(mt[1]); d = Number(mt[2]);
    y = mt[3].length === 2 ? 2000 + Number(mt[3]) : Number(mt[3]);
  } else {
    return null;
  }

  return isRealDate(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
}

/**
 * Formats a stored date for output as 'MM-DD-YY'.
 * Anything that isn't a parseable date (empty, null, junk) is returned as-is.
 */
function toDisplayDate(stored) {
  if (typeof stored !== 'string') return stored;
  const iso = toStorageDate(stored);
  if (!iso) return stored;
  const [y, m, d] = iso.split('-');
  return `${m}-${d}-${y.slice(2)}`;
}

/** Returns a copy of `rows` with each row's `date` formatted for output. */
function formatDateRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) =>
    row && typeof row === 'object' && 'date' in row
      ? { ...row, date: toDisplayDate(row.date) }
      : row
  );
}

/**
 * Parses a stored date (ISO, or a legacy MM-DD-YY row) into a real JS Date.
 * Returns null if it can't be parsed.
 */
function parseStoredDate(date) {
  const iso = toStorageDate(date);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 4-digit calendar year of a stored date, or null if it can't be parsed. */
function getYearFromDate(date) {
  const d = parseStoredDate(date);
  return d ? d.getFullYear() : null;
}

module.exports = {
  ISO_DATE_RE,
  toStorageDate,
  toDisplayDate,
  formatDateRows,
  parseStoredDate,
  getYearFromDate,
};
