/**
 * db/migrateDates.js
 *
 * One-time-per-row, idempotent clean-up that runs at startup (after the
 * tables exist, before the server starts listening).
 *
 * Every table with a `date` column is scanned for rows whose date is NOT
 * already ISO 'YYYY-MM-DD'. Those are rewritten in place, e.g.
 *
 *     '09-09-26'  →  '2026-09-09'
 *
 * Rows already in ISO are never touched, so after the first run this is just
 * one cheap SELECT per table that returns nothing. Rows whose date can't be
 * understood (or isn't a real calendar date) are left exactly as they are and
 * reported in the log — nothing is ever deleted or blanked.
 *
 * ids are not changed, only the `date` value.
 */

const { bgtracker, meetings } = require('./db');
const { toStorageDate } = require('../utils/dateFormat');

const TARGETS = [
  { pool: bgtracker, label: 'bgtracker.readings',       table: 'readings' },
  { pool: bgtracker, label: 'bgtracker.bloodpressures', table: 'bloodpressures' },
  { pool: bgtracker, label: 'bgtracker.weights',        table: 'weights' },
  { pool: bgtracker, label: 'bgtracker.nutritions',     table: 'nutritions' },
  { pool: meetings,  label: 'meetings.meetings',        table: 'meetings' },
];

const CHUNK = 500;

async function migrateTable({ pool, table }) {
  const db = pool.promise();

  const [rows] = await db.query(
    `SELECT id, \`date\` FROM \`${table}\`
       WHERE \`date\` IS NOT NULL AND \`date\` <> ''
         AND \`date\` NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
  );

  const updates = [];
  const skipped = [];
  for (const row of rows) {
    const iso = toStorageDate(row.date);
    if (iso) updates.push([row.id, iso]);
    else skipped.push(row);
  }

  for (let i = 0; i < updates.length; i += CHUNK) {
    const part = updates.slice(i, i + CHUNK);
    const cases = part.map(() => 'WHEN ? THEN ?').join(' ');
    const params = [...part.flatMap(([id, iso]) => [id, iso]), part.map(([id]) => id)];
    await db.query(
      `UPDATE \`${table}\` SET \`date\` = CASE id ${cases} END WHERE id IN (?)`,
      params
    );
  }

  return { converted: updates.length, skipped };
}

async function migrateDates() {
  console.log('\n──────────────────────────────────────────');
  console.log('  Date check — storing dates as YYYY-MM-DD');
  console.log('──────────────────────────────────────────');

  for (const target of TARGETS) {
    try {
      const { converted, skipped } = await migrateTable(target);

      if (converted > 0) console.log(`  ✓  ${target.label}: rewrote ${converted} date(s) to YYYY-MM-DD`);
      else console.log(`  –  ${target.label}: already YYYY-MM-DD`);

      if (skipped.length > 0) {
        console.warn(`  !  ${target.label}: left ${skipped.length} unreadable date(s) unchanged:`);
        skipped.slice(0, 5).forEach((r) => console.warn(`       id=${r.id}  date=${JSON.stringify(r.date)}`));
        if (skipped.length > 5) console.warn(`       …and ${skipped.length - 5} more`);
      }
    } catch (e) {
      // Never block startup over a clean-up job; the write path still
      // normalises every new/edited date on its own.
      console.error(`  ✗  ${target.label}: date check failed —`, e.message);
    }
  }

  console.log('──────────────────────────────────────────\n');
}

module.exports = migrateDates;
