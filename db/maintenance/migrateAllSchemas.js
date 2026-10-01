/**
 * db/maintenance/migrateAllSchemas.js
 *
 * One command that brings an EXISTING database's tightened tables up to the
 * strict NOT NULL schema now defined in db/init.js. Covers every table that
 * has been tightened so far:
 *
 *   bgtracker: nutritions, readings          (tightened 1.10.2 / 1.10.3)
 *              bloodpressures, medications, weights, preferences   (1.10.8)
 *   meetings:  meetings, chairs, memos                             (1.10.8)
 *
 * Why it's needed: `CREATE TABLE IF NOT EXISTS` skips tables that already
 * exist and db/schemaSync.js only ever ADDS columns, so a database created
 * before a table was tightened keeps its old nullable columns until this is
 * run. A brand-new install already gets the strict schema and needs nothing.
 *
 * It uses the shared engine in migrateTableSchema.js: per column, count NULLs
 * -> (--apply only) backfill them -> only then `MODIFY COLUMN` to the exact
 * definition read live from db/init.js. Never a blind NOT NULL.
 *
 * Backfill values match what each table's own add route already writes for a
 * missing field: '' / 0 by default, plus the placeholders below where the
 * route uses one ('N/A' for meeting chair/co-chair/memo, 'Name'/'0.00'/'G' for
 * medications, 'New Chair' for chairs).
 *
 * USAGE (manual, one-off - not part of app start-up; take a backup first):
 *   node db/maintenance/migrateAllSchemas.js                       # dry run, all tables
 *   node db/maintenance/migrateAllSchemas.js --apply               # backfill + alter, all tables
 *   node db/maintenance/migrateAllSchemas.js --tables=meetings,chairs [--apply]
 *
 * Idempotent: a second --apply finds no NULLs and re-issues identical MODIFYs.
 * Exit code is 1 if any table failed, 0 otherwise.
 */
const migrateTableSchema = require('./migrateTableSchema');

// id / user_id were already NOT NULL everywhere, so they are skipped.
const SKIP = ['id', 'user_id'];

const TABLES = [
  { table: 'nutritions',     dbKey: 'bgtracker' },
  { table: 'readings',       dbKey: 'bgtracker' },
  { table: 'bloodpressures', dbKey: 'bgtracker' },
  { table: 'medications',    dbKey: 'bgtracker',
    columnDefaults: { name: 'Name', dose: '0.00', unit: 'G', prescriber: 'Name' } },
  { table: 'weights',        dbKey: 'bgtracker' },
  { table: 'preferences',    dbKey: 'bgtracker' },
  { table: 'meetings',       dbKey: 'meetings',
    columnDefaults: { chair: 'N/A', coChair: 'N/A', memo: 'N/A' } },
  { table: 'chairs',         dbKey: 'meetings', columnDefaults: { name: 'New Chair' } },
  { table: 'memos',          dbKey: 'meetings', columnDefaults: { name: 'N/A' } },
];

async function migrateAllSchemas({ apply = false, only = null } = {}) {
  const wanted = only && only.length ? only : TABLES.map((t) => t.table);
  const unknown = wanted.filter((n) => !TABLES.some((t) => t.table === n));
  if (unknown.length) {
    throw new Error(`Unknown table(s): ${unknown.join(', ')}. Known: ${TABLES.map((t) => t.table).join(', ')}`);
  }

  const results = [];
  for (const cfg of TABLES.filter((t) => wanted.includes(t.table))) {
    console.log(`\n== ${cfg.dbKey}.${cfg.table} ${'='.repeat(Math.max(0, 50 - cfg.table.length))}`);
    try {
      const r = await migrateTableSchema({ ...cfg, skipColumns: SKIP, apply });
      results.push({ table: cfg.table, failed: r.failed });
    } catch (e) {
      console.error(`  x  ${cfg.table}: ${e.message}`);
      results.push({ table: cfg.table, failed: [{ name: '*', reason: e.message }] });
    }
  }

  const bad = results.filter((r) => r.failed.length);
  console.log(`\n${results.length - bad.length}/${results.length} table(s) ok` +
    (bad.length ? `; FAILED: ${bad.map((r) => r.table).join(', ')}` : '') +
    (apply ? '' : '  (dry run - nothing changed)'));
  return { results, failed: bad };
}

if (require.main === module) {
  (async () => {
    try {
      const apply = process.argv.includes('--apply');
      const arg = process.argv.find((a) => a.startsWith('--tables='));
      const only = arg ? arg.slice('--tables='.length).split(',').map((s) => s.trim()).filter(Boolean) : null;
      const { failed } = await migrateAllSchemas({ apply, only });
      process.exit(failed.length ? 1 : 0);
    } catch (e) {
      console.error('migrateAllSchemas failed:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = migrateAllSchemas;
