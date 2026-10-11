/**
 * utils/doctorClinics.js
 *
 * The one place that changes which clinics / hospitals a doctor is attached
 * to (table `doctor_clinics`). Used by routes/admin.js (direct edits and
 * approving a doctor's request) so the "exactly one primary place while the
 * doctor has any place" rule is kept the same way everywhere.
 *
 * Every function takes a connection (promise API) so the caller decides
 * whether it runs inside a transaction. Nothing here touches doctor_patients:
 * where a doctor works never changes who can see a patient's data.
 */

const FACILITY_TYPES = ['clinic', 'hospital'];
const MAX_PLACES_PER_DOCTOR = 10;

/** A doctor's places, primary first. */
async function listForDoctor(conn, doctorId) {
  const [rows] = await conn.query(
    `SELECT c.id, c.name, c.address, c.type, dc.isPrimary
       FROM doctor_clinics dc
       JOIN clinics c ON c.id = dc.clinic_id
      WHERE dc.doctor_id = ?
      ORDER BY dc.isPrimary DESC, c.name, c.id`,
    [doctorId]
  );
  const out = rows.map((r) => ({ ...r, isPrimary: Boolean(r.isPrimary) }));
  // Rows edited by hand can leave a doctor with places but no primary; show the
  // first as primary rather than none (the next app write repairs the stored flag).
  if (out.length > 0 && !out.some((r) => r.isPrimary)) out[0].isPrimary = true;
  return out;
}

/** Make sure a doctor with at least one place has exactly one primary. */
async function normalizePrimary(conn, doctorId) {
  const [rows] = await conn.query(
    'SELECT clinic_id, isPrimary FROM doctor_clinics WHERE doctor_id = ? ORDER BY isPrimary DESC, id',
    [doctorId]
  );
  if (rows.length === 0) return;
  const primaries = rows.filter((r) => r.isPrimary);
  if (primaries.length === 1) return;
  const keep = rows[0].clinic_id; // an existing primary if any, else the oldest link
  await conn.query(
    'UPDATE doctor_clinics SET isPrimary = (clinic_id = ?) WHERE doctor_id = ?',
    [keep, doctorId]
  );
}

/**
 * Attach a doctor to a place. The first place a doctor gets becomes primary.
 * Returns 'added', or 'exists' when the link is already there.
 * The caller has already checked that both ids exist.
 */
async function addPlace(conn, doctorId, clinicId) {
  const [have] = await conn.query(
    'SELECT clinic_id FROM doctor_clinics WHERE doctor_id = ?', [doctorId]
  );
  if (have.some((r) => Number(r.clinic_id) === Number(clinicId))) return 'exists';
  await conn.query(
    'INSERT INTO doctor_clinics (doctor_id, clinic_id, isPrimary) VALUES (?, ?, ?)',
    [doctorId, clinicId, have.length === 0 ? 1 : 0]
  );
  return 'added';
}

/** Detach a doctor from a place; promotes another place if it was the primary. */
async function removePlace(conn, doctorId, clinicId) {
  const [res] = await conn.query(
    'DELETE FROM doctor_clinics WHERE doctor_id = ? AND clinic_id = ?', [doctorId, clinicId]
  );
  await normalizePrimary(conn, doctorId);
  return res.affectedRows > 0;
}

/** Mark one of the doctor's existing places as primary. False if not linked. */
async function setPrimary(conn, doctorId, clinicId) {
  const [rows] = await conn.query(
    'SELECT clinic_id FROM doctor_clinics WHERE doctor_id = ? AND clinic_id = ?', [doctorId, clinicId]
  );
  if (rows.length === 0) return false;
  await conn.query(
    'UPDATE doctor_clinics SET isPrimary = (clinic_id = ?) WHERE doctor_id = ?', [clinicId, doctorId]
  );
  return true;
}

/**
 * Run `fn(conn)` in a transaction while holding a lock on the doctor's users
 * row, so two requests changing the same doctor's places (say two first
 * additions at once) cannot both become primary. `pool` is db.promise().
 * Resolves { notFound: true } when there is no doctor with that id; otherwise
 * whatever `fn` returns. Rolls back if `fn` throws.
 */
async function withDoctorLock(pool, doctorId, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [u] = await conn.query("SELECT id FROM users WHERE id = ? AND role = 'doctor' FOR UPDATE", [doctorId]);
    if (u.length === 0) { await conn.rollback(); return { notFound: true }; }
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* connection already gone */ }
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = {
  withDoctorLock,
  FACILITY_TYPES, MAX_PLACES_PER_DOCTOR,
  listForDoctor, normalizePrimary, addPlace, removePlace, setPrimary,
};
