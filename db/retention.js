/**
 * db/retention.js
 *
 * Rolling 10-calendar-year data retention — READINGS ONLY.
 *
 * The bgtracker.readings table keeps at most the most recent 10 calendar
 * years of data. When the calendar rolls forward far enough that the
 * table's oldest rows fall outside that 10-year window, those rows are
 * deleted — e.g. the day the calendar turns to 2027, any 2017-and-earlier
 * readings are removed (cutoff = currentYear - 10 = 2017).
 *
 * This is entirely server-driven: it runs once at startup and then once
 * every 24 hours for as long as the process stays up, so the sweep fires
 * on its own as soon as the year actually rolls over. It does not depend
 * on any particular user being active.
 *
 * Scope: readings ONLY. The rolling-10-year design (tenYearRetentionDays(),
 * earliestYear(), deleteEarliestYearFromServer() in the frontend's
 * dateFormat.js/useReadings.js) is specific to blood glucose readings —
 * bloodpressures, weights, nutritions, and meetings are kept indefinitely
 * and must NOT be pruned here.
 */

const { bgtracker } = require('./db');
const { getYearFromDate } = require('../utils/dateFormat');

const RETENTION_YEARS = 10;

const TARGETS = [
  { pool: bgtracker, label: 'bgtracker.readings', table: 'readings' },
];

/**
 * The oldest calendar year still allowed to remain. Anything at or before
 * this year gets deleted. e.g. referenceDate in 2027 → cutoff 2017, which
 * keeps a full rolling 10 years (2018-2027) and drops 2017 and earlier.
 */
function currentCutoffYear(referenceDate = new Date()) {
  return referenceDate.getFullYear() - RETENTION_YEARS;
}

/**
 * Deletes every row in one table whose `date` falls at or before the
 * cutoff year. Reads id+date rather than filtering in SQL because dates
 * are stored as free-text (MM-DD-YY, with some legacy YYYY-MM-DD rows)
 * rather than a real DATE column, so the year has to be parsed in JS the
 * same way the frontend parses it.
 */
function pruneTable({ pool, label, table }, cutoffYear) {
  return new Promise((resolve) => {
    pool.query(`SELECT id, date FROM \`${table}\``, (err, rows) => {
      if (err) {
        console.error(`  ✗ retention: could not read ${label}:`, err.message);
        return resolve(0);
      }

      const staleIds = rows
        .filter((row) => {
          const year = getYearFromDate(row.date);
          return year != null && year <= cutoffYear;
        })
        .map((row) => row.id);

      if (staleIds.length === 0) return resolve(0);

      pool.query(`DELETE FROM \`${table}\` WHERE id IN (?)`, [staleIds], (delErr, result) => {
        if (delErr) {
          console.error(`  ✗ retention: could not delete from ${label}:`, delErr.message);
          return resolve(0);
        }
        resolve(result?.affectedRows || 0);
      });
    });
  });
}

async function pruneOldData(referenceDate = new Date()) {
  const cutoffYear = currentCutoffYear(referenceDate);

  console.log('\n──────────────────────────────────────────');
  console.log(`  Retention sweep — rolling ${RETENTION_YEARS}-year window (through ${referenceDate.getFullYear()})`);
  console.log(`  Deleting any rows dated ${cutoffYear} or earlier`);
  console.log('──────────────────────────────────────────');

  for (const target of TARGETS) {
    const deleted = await pruneTable(target, cutoffYear);
    if (deleted > 0) {
      console.log(`  ✓  ${target.label}: deleted ${deleted} row(s) from ${cutoffYear} or earlier`);
    } else {
      console.log(`  –  ${target.label}: nothing to delete`);
    }
  }

  console.log('──────────────────────────────────────────\n');
}

/**
 * Runs the sweep immediately, then re-checks once every 24 hours so a
 * long-running server automatically catches the New Year's rollover
 * without needing a restart or any manual trigger.
 */
function scheduleRetention() {
  pruneOldData().catch((e) => console.error('Retention sweep failed:', e.message));

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    pruneOldData().catch((e) => console.error('Retention sweep failed:', e.message));
  }, ONE_DAY_MS);
}

module.exports = { pruneOldData, scheduleRetention, currentCutoffYear };
