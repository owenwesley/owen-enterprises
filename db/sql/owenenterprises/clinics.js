/**
 * db/sql/owenenterprises/clinics.js
 *
 * Plain single-statement CRUD only — no drop-and-rebuild-the-table pattern
 * like some other SQL files in this project use for their deletes (see
 * db/sql/bgtracker/bloodpressures.js). That pattern renumbers every row id on
 * write, which is tolerable for a table nothing else points at, but a
 * clinic's id is a foreign-key target: doctor_profiles.clinic_id references
 * clinics(id). Renumbering ids here would silently repoint a doctor at
 * whichever clinic happens to land on their old clinic's id afterward.
 *
 * The actual CREATE TABLE lives in db/init.js and db/db.js (this project's
 * single source of schema truth), not here — see the "Schema upgrades"
 * section of the README.
 */

const selectClinics = 'SELECT id, name, address FROM clinics ORDER BY name';

const selectClinicById = 'SELECT id, name, address FROM clinics WHERE id=?';

const insertClinic = 'INSERT INTO clinics (name, address) VALUES (?, ?)';

const updateClinic = 'UPDATE clinics SET name=?, address=? WHERE id=?';

// Deleting a clinic does not delete the doctors who work there — the caller
// (routes/admin.js) explicitly clears doctor_profiles.clinic_id for any
// doctor at this clinic before running this delete, rather than counting on
// the clinic_id FOREIGN KEY's ON DELETE SET NULL: that constraint only exists
// on doctor_profiles when the table was created fresh, not on a database
// upgraded from before clinics existed (db/schemaSync.js adds the column but
// not the constraint). Nothing about doctor_patients links is touched by any
// of this either — a clinic disappearing has no bearing on a patient's
// consent to a specific doctor (see the "Clinics" note in the README for why
// clinic and patient-access are kept separate).
const deleteClinicById = 'DELETE FROM clinics WHERE id=?';

// A doctor's clinic assignment. clinic_id may be set to NULL to detach a
// doctor from any clinic (e.g. between jobs, or if they were never assigned
// one) — this is informational only and never touches doctor_patients.
const updateDoctorClinic = 'UPDATE doctor_profiles SET clinic_id=? WHERE user_id=?';

// ── Doctor self-service clinic-change requests ───────────────────────────────
// A doctor can browse clinics and request to move to one themselves; an admin
// approves or rejects. Submitting a request NEVER touches clinic_id itself —
// only requestedClinicId + clinicRequestStatus. Only an admin approving
// actually writes to clinic_id (see setClinicRequest / clearClinicRequest
// below and POST /admin/clinic-requests/:doctorId/approve in routes/admin.js).

// This doctor's current clinic (if any) plus their pending request (if any).
const selectMyClinicRequest = `
  SELECT p.clinic_id, c.name AS clinicName,
         p.requestedClinicId, p.clinicRequestStatus,
         rc.name AS requestedClinicName
    FROM doctor_profiles p
    LEFT JOIN clinics c  ON c.id = p.clinic_id
    LEFT JOIN clinics rc ON rc.id = p.requestedClinicId
   WHERE p.user_id = ?`;

// Submit or replace a doctor's own pending clinic-change request.
const setClinicRequest = `
  UPDATE doctor_profiles
     SET requestedClinicId = ?, clinicRequestStatus = 'pending'
   WHERE user_id = ?`;

// Withdraw a request (doctor) or reject/clear it (admin) — either way this
// only ever touches requestedClinicId/clinicRequestStatus, never clinic_id.
const clearClinicRequest = `
  UPDATE doctor_profiles
     SET requestedClinicId = NULL, clinicRequestStatus = 'none'
   WHERE user_id = ?`;

// The admin queue: every doctor with a pending request right now.
const selectPendingClinicRequests = `
  SELECT u.id AS doctorId, u.firstName, u.lastName,
         p.clinic_id AS currentClinicId, c.name AS currentClinicName,
         p.requestedClinicId, rc.name AS requestedClinicName
    FROM doctor_profiles p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN clinics c  ON c.id = p.clinic_id
    LEFT JOIN clinics rc ON rc.id = p.requestedClinicId
   WHERE p.clinicRequestStatus = 'pending'
   ORDER BY u.lastName, u.firstName`;

// Approve: copy requestedClinicId → clinic_id, then clear the request fields.
// Caller (routes/admin.js) validates a pending request exists first.
const approveClinicRequest = `
  UPDATE doctor_profiles
     SET clinic_id = requestedClinicId, requestedClinicId = NULL, clinicRequestStatus = 'none'
   WHERE user_id = ? AND clinicRequestStatus = 'pending'`;

module.exports = {
  selectClinics,
  selectClinicById,
  insertClinic,
  updateClinic,
  deleteClinicById,
  updateDoctorClinic,
  selectMyClinicRequest,
  setClinicRequest,
  clearClinicRequest,
  selectPendingClinicRequests,
  approveClinicRequest,
};
