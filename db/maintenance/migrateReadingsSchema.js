/**
 * db/maintenance/migrateReadingsSchema.js
 *
 * Brings an existing database's `readings` table up to the strict NOT NULL
 * schema (createReadingsTbl in db/sql/bgtracker/readings.js — `date` TEXT,
 * every sugar/carbs/insulin column INT, every chkMeds* column TINYINT(1),
 * all NOT NULL with no DEFAULT). See db/maintenance/migrateTableSchema.js
 * for how and why this works.
 *
 * Before this schema was tightened, routes/bgtracker/readings/{add,edit}.js
 * did not coalesce the numeric fields before writing (unlike nutritions'
 * add/edit routes) — that gap was fixed alongside the schema tightening, so
 * both routes now coerce every numeric field with utils/coerce.js's toNum
 * and every chkMeds* field with toBit before this migration was written.
 *
 * USAGE (manual, one-off — not part of app start-up):
 *   node db/maintenance/migrateReadingsSchema.js            # dry run, report only
 *   node db/maintenance/migrateReadingsSchema.js --apply     # backfill NULLs, then MODIFY COLUMN
 */
const migrateTableSchema = require('./migrateTableSchema');

function migrateReadingsSchema({ apply = false } = {}) {
  return migrateTableSchema({
    table: 'readings',
    dbKey: 'bgtracker',
    // id and user_id were already NOT NULL before this tightening — the
    // loosened columns were `date` (VARCHAR(20), now TEXT) and every
    // sugar/carbs/insulin/chkMeds* column.
    skipColumns: ['id', 'user_id'],
    apply,
  });
}

if (require.main === module) {
  (async () => {
    try {
      const apply = process.argv.includes('--apply');
      const result = await migrateReadingsSchema({ apply });
      process.exit(result.failed.length ? 1 : 0);
    } catch (e) {
      console.error('migrateReadingsSchema failed:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = migrateReadingsSchema;
