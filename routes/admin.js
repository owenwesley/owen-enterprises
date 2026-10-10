const express = require('express');
const { owenenterprises: db } = require('../db/db');
const { requireAdmin } = require('../middleware/admin');
const {
  selectClinics, insertClinic, updateClinic, deleteClinicById, updateDoctorClinic,
  selectPendingClinicRequests, approveClinicRequest, clearClinicRequest,
} = require('../db/sql/owenenterprises/clinics');
const { serverError } = require('../utils/serverError');

const router = express.Router();

const VALID_STATUS = new Set(['pending', 'approved', 'rejected']);

// GET /admin/doctors — every doctor account, license info included.
router.get('/doctors', requireAdmin, async (req, res) => {
  try {
    const [results] = await db.promise().query(
      `SELECT u.id, u.firstName, u.lastName, u.userName, u.email, u.doctorStatus,
              COALESCE(p.licenseNumber, '') AS licenseNumber,
              COALESCE(p.specialty, '')     AS specialty,
              p.clinic_id, c.name AS clinicName
         FROM users u
         LEFT JOIN doctor_profiles p ON p.user_id = u.id
         LEFT JOIN clinics c ON c.id = p.clinic_id
        WHERE u.role = 'doctor'
        ORDER BY (u.doctorStatus = 'pending') DESC, u.id`
    );
    return res.json({ results });
  } catch (e) {
    return serverError(res, e);
  }
});

// POST /admin/doctors/:id/status  { status: 'pending' | 'approved' | 'rejected' }
//
// Leaving 'approved' (reject, or reset to pending) also revokes every active
// doctor_patients link for this doctor. requireApprovedDoctor already blocks
// all patient-data access the instant doctorStatus stops being 'approved', so
// this isn't what protects data today or tomorrow — it protects it if the
// SAME account is ever re-approved later (reinstated, moved to a different
// clinic, whatever the reason). Without this, re-approval would silently
// restore access to every patient they'd ever been linked to, with no new
// consent. With it, those patients show up as revoked on their own "My
// Doctors" page and have to actively re-link with a new invite code.
router.post('/doctors/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUS.has(status)) {
    return res.status(400).json({ error: 'status must be pending, approved or rejected' });
  }
  try {
    const conn = db.promise();
    const [result] = await conn.query(
      `UPDATE users SET doctorStatus = ? WHERE id = ? AND role = 'doctor'`,
      [status, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'No doctor account with that id' });

    let revokedLinks = 0;
    if (status !== 'approved') {
      const [revoke] = await conn.query(
        `UPDATE doctor_patients SET status = 'revoked' WHERE doctor_id = ? AND status = 'active'`,
        [req.params.id]
      );
      revokedLinks = revoke.affectedRows;
    }
    return res.json({
      message: `Doctor status set to ${status}`,
      ...(revokedLinks > 0 && { revokedLinks }),
    });
  } catch (e) {
    return serverError(res, e);
  }
});

// ── Clinics ────────────────────────────────────────────────────────────────
// A clinic is informational metadata about where a doctor currently works.
// It never gates access to anything — a doctor's own approval status is what
// controls that (see the cascade note on POST /doctors/:id/status above).
// Assigning, changing or clearing a doctor's clinic never touches
// doctor_patients: a patient's relationship is with the doctor as a verified
// account, not with whichever building they currently work out of, so moving
// clinics doesn't cost a doctor their existing patients. If a doctor's
// standing actually changes (leaves, is suspended), that's a doctorStatus
// change, which does cascade — see above.

// GET /admin/clinics — every clinic, for the assignment dropdown.
router.get('/clinics', requireAdmin, async (req, res) => {
  try {
    const [results] = await db.promise().query(selectClinics);
    return res.json({ results });
  } catch (e) {
    return serverError(res, e);
  }
});

// POST /admin/clinics  { name, address? }
router.post('/clinics', requireAdmin, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const address = String(req.body.address || '').trim();
  if (!name) return res.status(400).json({ error: 'Clinic name is required' });
  if (name.length > 150) return res.status(400).json({ error: 'Clinic name is too long' });
  if (address.length > 255) return res.status(400).json({ error: 'Address is too long' });
  try {
    const [result] = await db.promise().query(insertClinic, [name, address]);
    return res.status(201).json({ message: 'Clinic added', id: result.insertId });
  } catch (e) {
    return serverError(res, e);
  }
});

// PUT /admin/clinics/:id  { name, address? }
router.put('/clinics/:id', requireAdmin, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const address = String(req.body.address || '').trim();
  if (!name) return res.status(400).json({ error: 'Clinic name is required' });
  if (name.length > 150) return res.status(400).json({ error: 'Clinic name is too long' });
  if (address.length > 255) return res.status(400).json({ error: 'Address is too long' });
  try {
    const [result] = await db.promise().query(updateClinic, [name, address, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'No clinic with that id' });
    return res.json({ message: 'Clinic updated' });
  } catch (e) {
    return serverError(res, e);
  }
});

// DELETE /admin/clinics/:id
// Doctors at this clinic are not removed. Explicitly clears their clinic_id
// first rather than counting on the FK's ON DELETE SET NULL — same reasoning
// as POST /doctors/:id/clinic above: that constraint only exists on
// doctor_profiles when the table was created fresh, not on a database
// upgraded from before clinics existed.
router.delete('/clinics/:id', requireAdmin, async (req, res) => {
  // The three writes go in together or not at all: if one fails part-way,
  // rollback leaves every doctor still attached to a clinic that still exists.
  let conn;
  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();
    await conn.query('UPDATE doctor_profiles SET clinic_id=NULL WHERE clinic_id=?', [req.params.id]);
    // A pending change request that targets this clinic would otherwise be left
    // pointing at an id that no longer exists (and approving it would assign a
    // ghost clinic), so withdraw those requests too.
    await conn.query("UPDATE doctor_profiles SET requestedClinicId=NULL, clinicRequestStatus='none' WHERE requestedClinicId=?", [req.params.id]);
    const [result] = await conn.query(deleteClinicById, [req.params.id]);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'No clinic with that id' });
    }
    await conn.commit();
    return res.json({ message: 'Clinic deleted' });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch (_) { /* connection already gone */ } }
    return serverError(res, e);
  } finally {
    if (conn) conn.release();
  }
});

// POST /admin/doctors/:id/clinic  { clinic_id: number | null }
// Assign, change, or clear (clinic_id: null) which clinic a doctor is
// currently at. Purely informational — see the note above the Clinics
// section for why this doesn't touch doctor_patients.
//
// Checks the clinic actually exists itself, rather than relying on the
// clinic_id FOREIGN KEY to reject a bad id: that constraint is only present
// on doctor_profiles when the table was created fresh (1.9.0+). A database
// upgraded from an earlier version gets the clinic_id column added by
// db/schemaSync.js, which is columns-only and doesn't add constraints — so on
// an upgraded database there is no FK to catch this, and a bad id would
// otherwise be silently accepted.
router.post('/doctors/:id/clinic', requireAdmin, async (req, res) => {
  const raw = req.body.clinic_id;
  const clinicId = raw === null || raw === '' || raw === undefined ? null : Number(raw);
  if (clinicId !== null && (!Number.isInteger(clinicId) || clinicId <= 0)) {
    return res.status(400).json({ error: 'clinic_id must be a positive integer or null' });
  }
  try {
    const conn = db.promise();
    if (clinicId !== null) {
      const [clinicRows] = await conn.query('SELECT id FROM clinics WHERE id=?', [clinicId]);
      if (clinicRows.length === 0) return res.status(400).json({ error: 'No clinic with that id' });
    }
    const [result] = await conn.query(updateDoctorClinic, [clinicId, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'No doctor account with that id' });
    return res.json({ message: clinicId === null ? 'Cleared clinic assignment' : 'Clinic assigned' });
  } catch (e) {
    return serverError(res, e);
  }
});

// ── Doctor self-service clinic-change requests ───────────────────────────────
// A doctor requests a move themselves (routes/doctor.js); this is the admin
// side that reviews and actually applies it. Approve validates a pending
// request exists first; reject just clears the request (clinic_id untouched).

// GET /admin/clinic-requests — pending queue
router.get('/clinic-requests', requireAdmin, async (req, res) => {
  try {
    const [results] = await db.promise().query(selectPendingClinicRequests);
    return res.json({ results });
  } catch (e) {
    return serverError(res, e);
  }
});

// POST /admin/clinic-requests/:doctorId/approve — copies requestedClinicId → clinic_id
router.post('/clinic-requests/:doctorId/approve', requireAdmin, async (req, res) => {
  try {
    const conn = db.promise();
    const [doctorRows] = await conn.query(
      `SELECT clinicRequestStatus FROM doctor_profiles WHERE user_id=?`,
      [req.params.doctorId]
    );
    if (doctorRows.length === 0) return res.status(404).json({ error: 'No doctor account with that id' });
    if (doctorRows[0].clinicRequestStatus !== 'pending') {
      return res.status(400).json({ error: 'This doctor has no pending clinic request' });
    }
    await conn.query(approveClinicRequest, [req.params.doctorId]);
    return res.json({ message: 'Clinic change approved' });
  } catch (e) {
    return serverError(res, e);
  }
});

// POST /admin/clinic-requests/:doctorId/reject — clears the request, clinic_id untouched
router.post('/clinic-requests/:doctorId/reject', requireAdmin, async (req, res) => {
  try {
    const [result] = await db.promise().query(clearClinicRequest, [req.params.doctorId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'No doctor account with that id' });
    return res.json({ message: 'Clinic change rejected' });
  } catch (e) {
    return serverError(res, e);
  }
});

// Churches (the web version of db/approveChurch.js)
router.use('/churches', require('./adminChurches'));

module.exports = router;
