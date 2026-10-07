/**
 * db/maintenance/scheduleRebuild.js
 *
 * Weekly maintenance window that runs db/maintenance/rebuildTable.js against
 * every table (in all four databases) that has an `id` column.
 *
 * OFF BY DEFAULT. Set MAINTENANCE_REBUILD_ENABLED=true in .env to turn it on.
 * Nothing in the app depends on it. Besides defragmenting each table, every
 * rebuild RENUMBERS the table's `id` to 1..N with no gaps and remaps every
 * column in other tables that stores that id (users.id -> every user_id,
 * clinics.id -> doctor_profiles.clinic_id, ...). See rebuildTable.js. A table
 * whose ids can't be remapped safely (orphaned references) is refused and
 * reported as failed; the rest carry on.
 *
 * WHEN IT RUNS
 * ------------
 * Sunday, 12:00 AM up to (not including) 4:00 AM in ONE fixed time zone,
 * America/Los_Angeles by default (override with MAINTENANCE_TZ, e.g.
 * America/New_York). The time zone is a property of the SERVER'S schedule,
 * not of any user: a user in Nevada and a user in Florida hit the same
 * server, and the job fires at one absolute instant either way. Pacific was
 * chosen because that instant is 3-7 AM Eastern, so both coasts are mostly
 * asleep. Daylight saving is handled by Intl (the window stays 12-4 AM
 * local wall-clock time all year).
 *
 * HOW IT STAYS SAFE
 * -----------------
 *   - A timer checks every 10 minutes whether "now" is inside the window and
 *     whether this week's run has happened yet; it runs at most once per
 *     window per process.
 *   - MySQL GET_LOCK ensures only one server process rebuilds at a time, so
 *     two app instances (or a manual run) can't overlap.
 *   - Before starting EACH table it re-checks the window; if 4 AM arrives
 *     mid-run, remaining tables are skipped until next Sunday.
 *   - One table failing never stops the others; rebuildTable itself leaves
 *     the old table in place on any failure.
 *   - Rebuilds are sequential, never parallel.
 *
 * Manual one-off (ignores the window, still takes the lock):
 *   node db/maintenance/scheduleRebuild.js --now
 */
// Load the project's .env so this works when run directly from a terminal
// (server.js does this for the app, but standalone scripts start with an empty
// environment and would otherwise fall back to root / no password). Resolved
// from the project root so it works from any directory; dotenv never overrides
// variables that are already set, so `DB_PASS=x node ...` still wins.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env'), quiet: true });
const mysql = require('mysql2');
const rebuildTable = require('./rebuildTable');
const { dbNames } = require('../init');

// ORDER BY list for the users table: non-test accounts first, test accounts last.
const USERS_TEST_LAST = "(`userName` LIKE 'test%'), `id`";

const WINDOW_DAY = 'Sun';
const WINDOW_START_HOUR = 0;   // inclusive
const WINDOW_END_HOUR = 4;     // exclusive
const CHECK_EVERY_MS = 10 * 60 * 1000;
const LOCK_NAME = 'owenenterprises_rebuild_all';

function tz() {
  return process.env.MAINTENANCE_TZ || 'America/Los_Angeles';
}

/** Day/hour/date of `date` as seen on a wall clock in `timeZone`. */
function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return {
    weekday: get('weekday'),
    hour: Number(get('hour')),
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

function inWindow(date = new Date(), timeZone = tz()) {
  const p = localParts(date, timeZone);
  return p.weekday === WINDOW_DAY && p.hour >= WINDOW_START_HOUR && p.hour < WINDOW_END_HOUR;
}

function makePool() {
  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    port: Number(process.env.DB_PORT) || 3306,
    connectionLimit: 2,
  }).promise();
}

/** Every base table with an `id` column across the five databases. */
async function discoverTables(pool) {
  const schemas = Object.values(dbNames());
  const [rows] = await pool.query(
    `SELECT c.TABLE_SCHEMA AS dbName, c.TABLE_NAME AS tableName
       FROM information_schema.COLUMNS c
       JOIN information_schema.TABLES t
         ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
      WHERE c.COLUMN_NAME = 'id'
        AND t.TABLE_TYPE = 'BASE TABLE'
        AND c.TABLE_SCHEMA IN (?)
        AND c.TABLE_NAME NOT LIKE '%\\_rebuild\\_tmp'
        AND c.TABLE_NAME NOT LIKE '%\\_rebuild\\_old'
        AND c.TABLE_NAME NOT LIKE '%\\_rebuild\\_map'
      ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME`,
    [schemas]
  );
  return rows;
}

/**
 * Rebuilds every id-table, one at a time. `respectWindow` re-checks the
 * window before each table so a run never spills past 4 AM.
 */
async function runRebuildAll({ respectWindow = true } = {}) {
  const pool = makePool();
  const conn = await pool.getConnection();   // GET_LOCK is per-connection
  const summary = { rebuilt: [], failed: [], skipped: [], lockHeldElsewhere: false };
  try {
    const [[lock]] = await conn.query('SELECT GET_LOCK(?, 0) AS got', [LOCK_NAME]);
    if (lock.got !== 1) {
      summary.lockHeldElsewhere = true;
      console.log('  maintenance: another rebuild is already running — skipping this run');
      return summary;
    }

    const tables = await discoverTables(pool);
    console.log(`\n── maintenance rebuild: ${tables.length} table(s) ──`);
    for (const { dbName, tableName } of tables) {
      if (respectWindow && !inWindow()) {
        summary.skipped.push(`${dbName}.${tableName}`);
        continue;
      }
      try {
        console.log(`  ${dbName}.${tableName}`);
        // users: hand out the new ids with test accounts LAST (user names
        // that start with "test", e.g. test, test2, TestUser), each group in
        // its old id order. Every other table keeps plain old-id order.
        const reorderBy = (dbName === dbNames().gateway && tableName === 'users')
          ? USERS_TEST_LAST : null;
        await rebuildTable({ table: tableName, dbName, reorderBy });
        summary.rebuilt.push(`${dbName}.${tableName}`);
      } catch (e) {
        console.error(`  ✗ ${dbName}.${tableName}: ${e.message}`);
        summary.failed.push(`${dbName}.${tableName}`);
      }
    }
    if (summary.skipped.length) {
      console.log(`  window closed — ${summary.skipped.length} table(s) left for next week`);
    }
    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
    return summary;
  } finally {
    conn.release();
    await pool.end();
  }
}

/** Starts the weekly check. No-op unless MAINTENANCE_REBUILD_ENABLED=true. */
function scheduleRebuild() {
  if (String(process.env.MAINTENANCE_REBUILD_ENABLED).toLowerCase() !== 'true') {
    return null;
  }
  console.log(`  maintenance: weekly rebuild enabled — Sunday 12-4 AM ${tz()}`);
  let lastRunKey = null;
  let running = false;

  const tick = async () => {
    if (running || !inWindow()) return;
    const key = localParts(new Date(), tz()).dateKey;   // this Sunday's date
    if (key === lastRunKey) return;                     // already ran today
    running = true;
    lastRunKey = key;
    try {
      await runRebuildAll({ respectWindow: true });
    } catch (e) {
      console.error('  ✗ maintenance rebuild failed:', e.message);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, CHECK_EVERY_MS);
  timer.unref();   // never keep the process alive just for this
  return timer;
}

if (require.main === module) {
  (async () => {
    try {
      if (!process.argv.includes('--now')) {
        console.log('Usage: node db/maintenance/scheduleRebuild.js --now');
        process.exit(1);
      }
      const s = await runRebuildAll({ respectWindow: false });
      process.exit(s.failed.length ? 1 : 0);
    } catch (e) {
      console.error('scheduleRebuild failed:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = { scheduleRebuild, runRebuildAll, inWindow, discoverTables, USERS_TEST_LAST };
