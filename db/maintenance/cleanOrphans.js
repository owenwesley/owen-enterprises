/**
 * db/maintenance/cleanOrphans.js
 *
 * Finds (and, with --apply, removes) rows that point at a user or clinic that
 * no longer exists. Deleting a user does not clean up their rows in
 * bgtracker / meetings / communitylibrary (those tables have no foreign keys),
 * and rebuildTable.js refuses to renumber `users` or `clinics` while any such
 * row exists, because after a renumber the stale number could belong to
 * someone else.
 *
 *   node db/maintenance/cleanOrphans.js            report only (changes nothing)
 *   node db/maintenance/cleanOrphans.js --apply    fix them, in one transaction
 *
 * What --apply does:
 *   - a row whose user_id / doctor_id / patient_id has no matching users row is DELETED
 *   - doctor_profiles.clinic_id pointing at a missing clinic is set to NULL
 *   - doctor_profiles.requestedClinicId pointing at a missing clinic is set to
 *     NULL and clinicRequestStatus back to 'none'
 *
 * Take a backup first. Refuses to --apply if any affected table is not InnoDB
 * (a transaction can't undo changes to it).
 */
const {
  USER_COLS, CLINIC_COLS, q, qt, makePool, findRefColumns, isInnoDB, dbNames,
} = require('./idRefs');

async function main(apply) {
  const gateway = dbNames().gateway;
  const pool = makePool();
  const conn = await pool.getConnection();
  try {
    // Safety: every row is "orphaned" relative to an EMPTY users table (wrong
    // database name, wrong .env, or a table that was just emptied). Applying
    // that would delete every user's data, so refuse before even reporting.
    const [[uc]] = await conn.query(`SELECT COUNT(*) AS n FROM ${qt(gateway, 'users')}`);
    if (Number(uc.n) === 0) {
      throw new Error(`${gateway}.users has no rows, so every row in every table would look ` +
        `orphaned. Check DB_* / database names in .env before running this.`);
    }

    const plan = [];

    for (const r of await findRefColumns(conn, USER_COLS)) {
      const where = `t.${q(r.column)} IS NOT NULL AND NOT EXISTS ` +
                    `(SELECT 1 FROM ${qt(gateway, 'users')} u WHERE u.id = t.${q(r.column)})`;
      const [[c]] = await conn.query(`SELECT COUNT(*) AS n FROM ${qt(r.schema, r.table)} t WHERE ${where}`);
      if (Number(c.n) > 0) plan.push({ ...r, n: Number(c.n), where, action: 'delete' });
    }

    // Clinic ids only live in doctor_profiles (gateway database).
    for (const r of await findRefColumns(conn, CLINIC_COLS)) {
      if (r.schema !== gateway) continue;
      const where = `t.${q(r.column)} IS NOT NULL AND NOT EXISTS ` +
                    `(SELECT 1 FROM ${qt(gateway, 'clinics')} c WHERE c.id = t.${q(r.column)})`;
      const [[c]] = await conn.query(`SELECT COUNT(*) AS n FROM ${qt(r.schema, r.table)} t WHERE ${where}`);
      if (Number(c.n) > 0) plan.push({ ...r, n: Number(c.n), where, action: 'null' });
    }

    if (plan.length === 0) {
      console.log('No orphaned rows found. Nothing to do.');
      return;
    }

    console.log(apply ? 'Orphaned rows to fix:' : 'Orphaned rows found (report only, nothing changed):');
    for (const p of plan) {
      const what = p.action === 'delete' ? 'delete' : 'clear the pointer on';
      console.log(`  ${p.schema}.${p.table}.${p.column}: ${p.n} row(s) -> would ${what}`);
      const [ids] = await conn.query(
        `SELECT DISTINCT t.${q(p.column)} AS id FROM ${qt(p.schema, p.table)} t WHERE ${p.where} ORDER BY 1 LIMIT 20`
      );
      console.log(`      stale id(s): ${ids.map((x) => x.id).join(', ')}`);
    }

    if (!apply) {
      console.log('\nRe-run with --apply to fix these (take a backup first).');
      return;
    }

    const bad = plan.filter((p) => !isInnoDB(p));
    if (bad.length) {
      throw new Error(`refusing to --apply: not InnoDB, so a transaction could not undo changes: ` +
        bad.map((b) => `${b.schema}.${b.table}`).join(', '));
    }

    await conn.beginTransaction();
    try {
      for (const p of plan) {
        const target = qt(p.schema, p.table);
        let sql;
        if (p.action === 'delete') {
          sql = `DELETE t FROM ${target} t WHERE ${p.where}`;
        } else if (p.column === 'requestedClinicId') {
          sql = `UPDATE ${target} t SET t.${q(p.column)} = NULL, t.clinicRequestStatus = 'none' WHERE ${p.where}`;
        } else {
          sql = `UPDATE ${target} t SET t.${q(p.column)} = NULL WHERE ${p.where}`;
        }
        const [res] = await conn.query(sql);
        console.log(`  fixed ${p.schema}.${p.table}.${p.column}: ${res.affectedRows} row(s)`);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    }
    console.log('\nDone. Re-run rebuildTable.js for users / clinics.');
  } finally {
    conn.release();
    await pool.end();
  }
}

if (require.main === module) {
  main(process.argv.slice(2).includes('--apply'))
    .then(() => process.exit(0))
    .catch((e) => { console.error('cleanOrphans failed:', e.message); process.exit(1); });
}

module.exports = main;
