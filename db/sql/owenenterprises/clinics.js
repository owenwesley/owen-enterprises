/**
 * db/sql/owenenterprises/clinics.js
 *
 * Plain single-statement CRUD only — no drop-and-rebuild-the-table pattern
 * like some other SQL files in this project use for their deletes (see
 * db/sql/bgtracker/bloodpressures.js). That pattern renumbers every row id on
 * write, which is tolerable for a table nothing else points at, but a
 * clinic's id is a foreign-key target: doctor_clinics.clinic_id and
 * doctor_clinic_requests.clinic_id reference clinics(id). Renumbering ids here
 * would silently repoint a doctor at whichever place happens to land on their
 * old place's id afterward.
 *
 * "Clinic" here means a clinic OR a hospital: clinics.type is 'clinic' or
 * 'hospital'. A doctor can be attached to several (doctor_clinics, one marked
 * primary) and asks an admin to add or drop one (doctor_clinic_requests).
 * Changing any of this never touches doctor_patients — see the README.
 *
 * The CREATE TABLEs live in db/init.js and db/db.js (this project's single
 * source of schema truth), not here. The group of statements that must run
 * together (add/remove a link, keep one primary) is in utils/doctorClinics.js.
 */

const selectClinics = 'SELECT id, name, address, type FROM clinics ORDER BY name';

const selectClinicById = 'SELECT id, name, address, type FROM clinics WHERE id=?';

const insertClinic = 'INSERT INTO clinics (name, address, type) VALUES (?, ?, ?)';

const updateClinic = 'UPDATE clinics SET name=?, address=?, type=? WHERE id=?';

const deleteClinicById = 'DELETE FROM clinics WHERE id=?';

// ── Doctor self-service requests ─────────────────────────────────────────────
// One pending request per (doctor, place). Submitting only writes this table;
// only an admin approving changes doctor_clinics.

// This doctor's pending requests, with the place's details.
const selectMyRequests = `
  SELECT r.clinic_id AS id, c.name, c.address, c.type, r.action, r.createdAt
    FROM doctor_clinic_requests r
    JOIN clinics c ON c.id = r.clinic_id
   WHERE r.doctor_id = ?
   ORDER BY r.createdAt, r.id`;

// Submit a request. Asking again for the same place just replaces the action.
const upsertRequest = `
  INSERT INTO doctor_clinic_requests (doctor_id, clinic_id, action)
  VALUES (?, ?, ?)
  ON DUPLICATE KEY UPDATE action = ?`;

// Withdraw (doctor) or reject / finish (admin) one request.
const deleteRequest = 'DELETE FROM doctor_clinic_requests WHERE doctor_id=? AND clinic_id=?';

const selectRequest = 'SELECT action FROM doctor_clinic_requests WHERE doctor_id=? AND clinic_id=?';

// The admin queue: every pending request, oldest first.
const selectPendingRequests = `
  SELECT r.doctor_id AS doctorId, u.firstName, u.lastName,
         r.clinic_id AS clinicId, c.name AS clinicName, c.type AS clinicType, r.action,
         EXISTS (SELECT 1 FROM doctor_clinics d WHERE d.doctor_id = r.doctor_id) AS hasOtherPlaces
    FROM doctor_clinic_requests r
    JOIN users u   ON u.id = r.doctor_id
    JOIN clinics c ON c.id = r.clinic_id
   ORDER BY r.createdAt, r.id`;

// Every doctor's places in one query, for the admin doctors table.
const selectAllDoctorPlaces = `
  SELECT dc.doctor_id AS doctorId, c.id, c.name, c.type, dc.isPrimary
    FROM doctor_clinics dc
    JOIN clinics c ON c.id = dc.clinic_id
   ORDER BY dc.isPrimary DESC, c.name, c.id`;

module.exports = {
  selectClinics,
  selectClinicById,
  insertClinic,
  updateClinic,
  deleteClinicById,
  selectMyRequests,
  upsertRequest,
  deleteRequest,
  selectRequest,
  selectPendingRequests,
  selectAllDoctorPlaces,
};
