/**
 * db/clinicMigration.js
 *
 * One-time, repeatable move of the OLD single-clinic columns into the new
 * many-to-many tables (version 1.12.0):
 *
 *   doctor_profiles.clinic_id            -> a doctor_clinics row, marked primary
 *   doctor_profiles.requestedClinicId    -> a doctor_clinic_requests row ('add')
 *     (only when clinicRequestStatus = 'pending')
 *
 * After copying, the old columns are set to NULL / 'none' so that running this
 * again (it runs at every start-up) copies nothing and can never bring back a
 * clinic the doctor has since left. The columns themselves are left in place
 * on an upgraded database: dropping a column is not something start-up does.
 * A fresh install never has them.
 *
 * Runs in one transaction; if anything fails nothing is changed and the old
 * columns still hold the data for the next start.
 */

async function hasColumn(conn, dbName, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows.length > 0;
}

async function migrateLegacyClinics(conn, dbName) {
  try {
    const hasClinic  = await hasColumn(conn, dbName, 'doctor_profiles', 'clinic_id');
    const hasRequest = await hasColumn(conn, dbName, 'doctor_profiles', 'requestedClinicId')
                    && await hasColumn(conn, dbName, 'doctor_profiles', 'clinicRequestStatus');
    if (!hasClinic && !hasRequest) return { moved: 0, requests: 0 };

    const p = `\`${dbName}\`.\`doctor_profiles\``;
    const dc = `\`${dbName}\`.\`doctor_clinics\``;
    const rq = `\`${dbName}\`.\`doctor_clinic_requests\``;
    const cl = `\`${dbName}\`.\`clinics\``;

    let moved = 0, requests = 0;
    await conn.beginTransaction();
    try {
      if (hasClinic) {
        const [r] = await conn.query(
          `INSERT IGNORE INTO ${dc} (doctor_id, clinic_id, isPrimary)
           SELECT p.user_id, p.clinic_id, 1
             FROM ${p} p JOIN ${cl} c ON c.id = p.clinic_id
            WHERE p.clinic_id IS NOT NULL`
        );
        moved = r.affectedRows;
        await conn.query(`UPDATE ${p} SET clinic_id = NULL WHERE clinic_id IS NOT NULL`);
      }
      if (hasRequest) {
        // A pending "move to X" becomes a pending "add X" (skipped if the
        // doctor already has X). The admin can still approve or reject it.
        const [r] = await conn.query(
          `INSERT IGNORE INTO ${rq} (doctor_id, clinic_id, action)
           SELECT p.user_id, p.requestedClinicId, 'add'
             FROM ${p} p JOIN ${cl} c ON c.id = p.requestedClinicId
            WHERE p.clinicRequestStatus = 'pending'
              AND NOT EXISTS (SELECT 1 FROM ${dc} d
                               WHERE d.doctor_id = p.user_id AND d.clinic_id = p.requestedClinicId)`
        );
        requests = r.affectedRows;
        await conn.query(
          `UPDATE ${p} SET requestedClinicId = NULL, clinicRequestStatus = 'none'
            WHERE requestedClinicId IS NOT NULL OR clinicRequestStatus <> 'none'`
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    }
    if (moved || requests) {
      console.log(`  ~  doctor_profiles: moved ${moved} clinic assignment(s) and ${requests} pending request(s) to the new tables`);
    }
    return { moved, requests };
  } catch (e) {
    console.error('  ✗  clinic migration failed (old columns left untouched):', e.message);
    return { moved: 0, requests: 0, failed: true };
  }
}

module.exports = { migrateLegacyClinics };
