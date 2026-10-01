/**
 * db/maintenance/migrateTableSchema.js
 *
 * Shared engine behind migrateNutritionsSchema.js and migrateReadingsSchema.js
 * (and any future per-table migration script written the same way). NOT run
 * automatically, NOT required by anything in this app — nothing in
 * server.js or db/init.js calls this file or its per-table wrappers.
 *
 * WHY THIS EXISTS
 * ----------------
 * `CREATE TABLE IF NOT EXISTS` only runs against a database that doesn't
 * already have the table, and db/schemaSync.js only ever ADDS missing
 * columns — it never retypes or re-nulls an existing one. So once a table's
 * live definition in db/init.js/db/db.js is tightened to NOT NULL (as
 * `nutritions` was in 1.10.2 and `readings` was after it), any database
 * where that table was created before the tightening keeps its old, looser
 * (nullable) column definitions until a migration like this one is run
 * against it directly.
 *
 * This never runs a blind `ALTER TABLE ... MODIFY ... NOT NULL`. That would
 * reject outright the moment it hit a real NULL under the old schema.
 * Instead, per column, it:
 *   1. Counts existing NULLs.
 *   2. In --apply mode only: backfills those NULLs to the same default the
 *      live add/edit routes already coerce missing fields to before writing
 *      ('' for TEXT columns, 0 for numeric columns — the caller supplies
 *      this mapping via defaultForDdl, so it can be confirmed against that
 *      table's own routes rather than assumed).
 *   3. Only then runs `MODIFY COLUMN` to the exact NOT NULL definition
 *      pulled live from db/init.js's tableMap, so a migration script can
 *      never drift out of sync with the real schema.
 *
 * With no --apply, this is a dry run: it reports NULL counts per column and
 * changes nothing.
 */
// Load the project's .env so this works when run directly from a terminal
// (server.js does this for the app, but standalone scripts start with an empty
// environment and would otherwise fall back to root / no password). Resolved
// from the project root so it works from any directory; dotenv never overrides
// variables that are already set, so `DB_PASS=x node ...` still wins.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env'), quiet: true });
const mysql = require('mysql2/promise');
const { parseColumns } = require('../schemaSync');
const { tableMap, dbNames } = require('../init');

/**
 * @param {object} opts
 * @param {string} opts.table - table name, must match a `name` in the
 *   relevant database's entry in db/init.js's tableMap.
 * @param {'bgtracker'|'communitylibrary'|'meetings'|'owenenterprises'} opts.dbKey
 *   - which key of dbNames() this table lives under.
 * @param {string[]} [opts.skipColumns] - columns to never touch (id, and any
 *   column that was already NOT NULL before this table's tightening, so
 *   migrating it is unnecessary and touching it isn't this migration's job).
 * @param {(ddl: string) => (string|number)} [opts.defaultForDdl] - given a
 *   column's target DDL fragment (e.g. "TEXT NOT NULL"), return the value to
 *   backfill existing NULLs to. Defaults to '' for TEXT/VARCHAR, 0 otherwise
 *   — override this if a table's routes coalesce to something else.
 * @param {Object<string,(string|number)>} [opts.columnDefaults] - per-column
 *   backfill overrides, keyed by column name; wins over defaultForDdl. For
 *   columns whose add route uses a real placeholder instead of ''/0 (e.g.
 *   meetings.chair -> 'N/A'), so backfilled rows look like rows the app wrote.
 * @param {boolean} [opts.apply] - false (default) = dry run/report only.
 */
async function migrateTableSchema({
  table,
  dbKey,
  skipColumns = ['id'],
  defaultForDdl = (ddl) => (/^(TEXT|VARCHAR)\b/i.test(ddl) ? '' : 0),
  columnDefaults = {},
  apply = false,
}) {
  const valueFor = (c) =>
    Object.prototype.hasOwnProperty.call(columnDefaults, c.name) ? columnDefaults[c.name] : defaultForDdl(c.ddl);
  const names = dbNames();
  const dbName = names[dbKey];
  if (!dbName) {
    throw new Error(`Unknown dbKey "${dbKey}" — expected one of ${Object.keys(names).join(', ')}`);
  }
  const defs = tableMap(names)[dbName] || [];
  const tableDef = defs.find((d) => d.name === table);
  if (!tableDef) {
    throw new Error(`Could not find table "${table}" in db/init.js's tableMap for database "${dbName}".`);
  }

  const skip = new Set(skipColumns);
  const columns = parseColumns(tableDef.sql).filter((c) => !skip.has(c.name));

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    port: Number(process.env.DB_PORT) || 3306,
    database: dbName,
  });

  try {
    const [exists] = await pool.query(
      `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [dbName, table]
    );
    if (exists.length === 0) {
      console.log(`  \`${dbName}\`.${table} does not exist yet — nothing to migrate ` +
        `(a fresh install already gets the strict schema from db/init.js).`);
      return { checked: 0, backfilled: [], altered: [], failed: [] };
    }

    const [rowCountResult] = await pool.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
    console.log(`  ${table}: ${rowCountResult[0].n} row(s) total\n`);

    // 1. Count NULLs per column first — this is the report step, always run.
    const nullCounts = [];
    for (const col of columns) {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS n FROM \`${table}\` WHERE \`${col.name}\` IS NULL`
      );
      const n = rows[0].n;
      if (n > 0) nullCounts.push({ ...col, nullCount: n });
    }

    if (nullCounts.length === 0) {
      console.log('  No NULLs found in any column that is becoming NOT NULL.');
    } else {
      console.log(`  Found NULLs in ${nullCounts.length} column(s):`);
      for (const c of nullCounts) {
        console.log(`    ${c.name}: ${c.nullCount} NULL row(s) — would backfill to ${JSON.stringify(valueFor(c))}`);
      }
    }

    if (!apply) {
      console.log('\n  Dry run only — no changes made. Re-run with --apply to backfill and alter columns.');
      return { checked: columns.length, backfilled: [], altered: [], failed: [] };
    }

    // 2. Backfill NULLs to the same defaults the live routes already use.
    const backfilled = [];
    for (const c of nullCounts) {
      const value = valueFor(c);
      try {
        await pool.query(`UPDATE \`${table}\` SET \`${c.name}\` = ? WHERE \`${c.name}\` IS NULL`, [value]);
        backfilled.push(c.name);
        console.log(`  ~  backfilled ${c.nullCount} NULL(s) in ${c.name}`);
      } catch (e) {
        console.error(`  ✗  failed to backfill ${c.name}:`, e.message);
        console.error('     Stopping before any ALTER TABLE — fix the above and re-run.');
        return { checked: columns.length, backfilled, altered: [], failed: [{ name: c.name, reason: e.message }] };
      }
    }

    // 3. Only now, with no NULLs left, apply the strict column definitions.
    const altered = [];
    const failed = [];
    for (const col of columns) {
      try {
        await pool.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${col.name}\` ${col.ddl}`);
        altered.push(col.name);
      } catch (e) {
        failed.push({ name: col.name, reason: e.message });
        console.error(`  ✗  ${col.name}: MODIFY COLUMN failed:`, e.message);
      }
    }
    console.log(`\n  Altered ${altered.length}/${columns.length} column(s) to the strict schema.`);
    if (failed.length) {
      console.error(`  ${failed.length} column(s) failed — inspect and re-run for just those, ` +
        `the rest of the table is left as already-altered.`);
    } else {
      console.log(`  ${table} now matches its definition in db/init.js exactly.`);
    }

    return { checked: columns.length, backfilled, altered, failed };
  } finally {
    await pool.end();
  }
}

module.exports = migrateTableSchema;
