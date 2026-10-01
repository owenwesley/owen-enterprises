/**
 * dateFormat.js
 *
 * In the database dates are stored as YYYY-MM-DD. The server converts them to
 * MM-DD-YY on the way out (and back to YYYY-MM-DD on the way in), so the
 * frontend works with and displays MM-DD-YY throughout. The helpers below
 * still accept YYYY-MM-DD too, because a native <input type="date"> hands
 * back that format before the server has round-tripped it.
 *
 * formatDate()        — converts any stored date to MM-DD-YY for display
 *                       handles legacy YYYY-MM-DD values and already-correct
 *                       MM-DD-YY values
 * todayFormatted()    — returns today as MM-DD-YY (use for all new date fields)
 * parseStoredDate()   — parses a MM-DD-YY (or legacy YYYY-MM-DD) string into
 *                       a real JS Date object
 * getYearFromDate()   — extracts the 4-digit calendar year from a stored date
 * tenYearRetentionDays() — leap-year-aware day count for a rolling 10-year
 *                       window ending today (3651, 3652, or 3653 depending
 *                       on how many Feb 29ths fall inside the window)
 */

/**
 * Returns today as MM-DD-YY  e.g. '07-09-26'
 */
export function todayFormatted() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const y = String(now.getFullYear()).slice(2);
  return `${m}-${d}-${y}`;
}

/**
 * Display a stored date as MM-DD-YY.
 *  'YYYY-MM-DD' → 'MM-DD-YY'   (legacy ISO values in DB)
 *  'MM-DD-YY'  → 'MM-DD-YY'   (already correct — returned as-is)
 *  anything else              — returned as-is
 */
export function formatDate(date) {
  if (!date) return '';
  const s = String(date).trim();

  // Already MM-DD-YY  e.g. '07-09-26'
  if (/^\d{2}-\d{2}-\d{2}$/.test(s)) return s;

  // YYYY-MM-DD  e.g. '2026-07-09'
  const parts = s.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${m.padStart(2, '0')}-${d.padStart(2, '0')}-${y.slice(2)}`;
  }

  return s;
}

/**
 * Parses a stored date (MM-DD-YY or legacy YYYY-MM-DD) into a real JS Date.
 * Two-digit years are assumed to be 20xx (matches todayFormatted()'s own
 * 2-digit-year convention — this app has no data from the 1900s).
 * Returns null if the string can't be parsed.
 */
export function parseStoredDate(date) {
  if (!date) return null;
  const s = String(date).trim();

  // MM-DD-YY
  let m = s.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, mm, dd, yy] = m;
    return new Date(2000 + Number(yy), Number(mm) - 1, Number(dd));
  }

  // Legacy YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, yyyy, mm, dd] = m;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }

  return null;
}

/**
 * Extracts the 4-digit calendar year from a stored date string.
 * Returns null if the date can't be parsed.
 */
export function getYearFromDate(date) {
  const d = parseStoredDate(date);
  return d ? d.getFullYear() : null;
}

/**
 * Converts a stored date (MM-DD-YY or legacy YYYY-MM-DD) into the
 * 'YYYY-MM-DD' string a native <input type="date"> needs for its `value`.
 * Returns '' if the date can't be parsed, so the input just renders empty
 * (rather than crashing or showing "Invalid Date") until a real date is
 * picked. Going forward, a date edited through one of these inputs is
 * saved as ISO 'YYYY-MM-DD' — formatDate()/parseStoredDate() already treat
 * that as a supported legacy format, so display and future edits keep
 * working the same way regardless of which format any given row is in.
 */
export function toDateInputValue(date) {
  const d = parseStoredDate(date);
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Computes the exact number of days in a rolling 10-calendar-year window
 * ending today — i.e. from (today - 10 years + 1 day) through today
 * inclusive. This varies between 3651, 3652, and 3653 depending on how
 * many leap-year Feb 29ths fall inside that exact window, so rather than
 * hardcoding one of those numbers, it's computed live from the real
 * calendar using actual Date arithmetic (which already implements the
 * Gregorian leap-year rule correctly).
 */
export function tenYearRetentionDays(referenceDate = new Date()) {
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const start = new Date(end.getFullYear() - 10, end.getMonth(), end.getDate());
  start.setDate(start.getDate() + 1); // window is inclusive of both endpoints
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end - start) / msPerDay) + 1;
}

/**
 * Given an array of rows with a `date` field (MM-DD-YY or legacy
 * YYYY-MM-DD), returns the earliest calendar year present. Returns null
 * if the array is empty or no dates can be parsed.
 */
export function earliestYear(rows) {
  let min = null;
  for (const row of rows) {
    const y = getYearFromDate(row?.date);
    if (y != null && (min === null || y < min)) min = y;
  }
  return min;
}

/**
 * Filters rows to only those whose `date` falls within the last N days
 * (inclusive of today). Used to enforce the 120-day display window on the
 * BG readings table.
 *
 * Note this is a DISPLAY filter only — it does not delete or alter stored
 * data. The full 10-year history remains in the database and continues to
 * feed the A1C / collaborated charts, which intentionally span longer
 * windows than the table shows.
 *
 * Rows with an unparseable/missing date are excluded, since they can't be
 * proven to fall inside the window.
 */
export function filterLastNDays(rows, days = 120, referenceDate = new Date()) {
  if (!Array.isArray(rows)) return [];
  const end = new Date(
    referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()
  );
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1)); // inclusive window

  return rows.filter((row) => {
    const d = parseStoredDate(row?.date);
    if (!d) return false;
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return day >= start && day <= end;
  });
}
