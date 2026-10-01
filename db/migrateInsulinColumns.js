/**
 * db/migrateInsulinColumns.js
 *
 * Runs at every start-up, after init() has created/altered tables.
 * insulinB and insulinBed were retired from readings (see the comment above
 * insertReadings in db/sql/bgtracker/readings.js): a single-type insulin dose
 * at Breakfast or Bedtime now lives in insulinSB / insulinSBed — the same
 * column two-type mode already used for the "Slow" dose — instead of a 3rd
 * field. New databases never get insulinB/insulinBed at all (db/init.js,
 * db/db.js). This migration is only for a database that predates the change:
 *
 *   1. Copy any historical insulinB value into insulinSB, but only where
 *      insulinSB is still 0 — never overwrite a value someone already has
 *      there. Same for insulinBed -> insulinSBed.
 *   2. Drop the insulinB and insulinBed columns.
 *
 * db/schemaSync.js only ever ADDS columns, so removing a retired one needs
 * its own explicit, one-time step — this is that step. Checks column
 * existence first and does nothing once both columns are gone, so it's safe
 * to run on every start (matches migrateDates.js / backfillInviteCodes.js).
 * Never throws — a failure is logged and start-up carries on.
 */
const { bgtracker } = require('./db');

async function migrateInsulinColumns() {
  try {
    const conn = bgtracker.promise();
    const [rows] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'readings'
          AND COLUMN_NAME IN ('insulinB', 'insulinBed')`
    );
    const present = new Set(rows.map((r) => r.COLUMN_NAME));
    if (present.size === 0) return; // already migrated (or a fresh database that never had them)

    if (present.has('insulinB')) {
      const [res] = await conn.query(
        `UPDATE readings SET insulinSB = insulinB WHERE insulinB != 0 AND insulinSB = 0`
      );
      if (res.affectedRows) console.log(`  →  readings: moved ${res.affectedRows} insulinB value(s) into insulinSB`);
    }
    if (present.has('insulinBed')) {
      const [res] = await conn.query(
        `UPDATE readings SET insulinSBed = insulinBed WHERE insulinBed != 0 AND insulinSBed = 0`
      );
      if (res.affectedRows) console.log(`  →  readings: moved ${res.affectedRows} insulinBed value(s) into insulinSBed`);
    }

    const drops = [...present].map((c) => `DROP COLUMN \`${c}\``).join(', ');
    await conn.query(`ALTER TABLE readings ${drops}`);
    console.log(`  ✓  readings: dropped retired column(s) ${[...present].join(', ')}`);
  } catch (e) {
    console.error('  ✗  migrateInsulinColumns failed:', e.message);
  }
}

module.exports = migrateInsulinColumns;
