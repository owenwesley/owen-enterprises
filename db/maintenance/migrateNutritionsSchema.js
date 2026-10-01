/**
 * db/maintenance/migrateNutritionsSchema.js
 *
 * Brings an existing database's `nutritions` table up to the strict NOT NULL
 * schema shipped in 1.10.2 (createNutritionsTbl in db/sql/bgtracker/nutritions.js).
 * See db/maintenance/migrateTableSchema.js for how and why this works, and
 * README.md's 1.10.2 entry for the schema-tightening background.
 *
 * USAGE (manual, one-off — not part of app start-up):
 *   node db/maintenance/migrateNutritionsSchema.js            # dry run, report only
 *   node db/maintenance/migrateNutritionsSchema.js --apply     # backfill NULLs, then MODIFY COLUMN
 */
const migrateTableSchema = require('./migrateTableSchema');

function migrateNutritionsSchema({ apply = false } = {}) {
  return migrateTableSchema({
    table: 'nutritions',
    dbKey: 'bgtracker',
    // id and user_id were already NOT NULL before 1.10.2 — the loosened
    // columns were `date` and the 90 per-meal food fields only.
    skipColumns: ['id', 'user_id'],
    apply,
  });
}

if (require.main === module) {
  (async () => {
    try {
      const apply = process.argv.includes('--apply');
      const result = await migrateNutritionsSchema({ apply });
      process.exit(result.failed.length ? 1 : 0);
    } catch (e) {
      console.error('migrateNutritionsSchema failed:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = migrateNutritionsSchema;
