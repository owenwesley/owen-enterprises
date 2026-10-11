const express = require('express');
const { owenenterprises: db } = require('../db/db');
const { requireAdmin } = require('../middleware/admin');
const {
  selectClinics, selectClinicById, insertClinic, updateClinic, deleteClinicById,
  selectPendingRequests, selectAllDoctorPlaces, selectRequest, deleteRequest,
} = require('../db/sql/owenenterprises/clinics');
const {
  FACILITY_TYPES, MAX_PLACES_PER_DOCTOR,
  withDoctorLock, addPlace, removePlace, setPrimary, normalizePrimary,
} = require('../utils/doctorClinics');
const { serverError } = require('../utils/serverError');

const router = express.Router();

const VALID_STATUS = new Set(['pending', 'approved', 'rejected']);

// GET /admin/doctors — every doctor account, license info and places included.
// `clinics` is the doctor's list of clinics / hospitals (primary first);
// `clinicName` is the primary one's name, kept for older callers.
router.get('/doctors', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT u.id, u.firstName, u.lastName, u.userName, u.email, u.doctorStatus,
              COALESCE(p.licenseNumber, '') AS licenseNumber,
              COALESCE(p.specialty, '')     AS specialty
         FROM users u
         LEFT JOIN doctor_profiles p ON p.user_id = u.id
        WHERE u.role = 'doctor'
        ORDER BY (u.doctorStatus = 'pending') DESC, u.id`
    );
    const [places] = await db.promise().query(selectAllDoctorPlaces);
    const byDoctor = new Map();
    for (const pl of places) {
      if (!byDoctor.has(pl.doctorId)) byDoctor.set(pl.doctorId, []);
      byDoctor.get(pl.doctorId).push({ id: pl.id, name: pl.name, type: pl.type, isPrimary: Boolean(pl.isPrimary) });
    }
    const results = rows.map((d) => {
      const clinics = byDoctor.get(d.id) || [];
      return { ...d, clinics, clinicName: clinics.length ? clinics[0].name : null };
    });
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

// ── Clinics and hospitals ───────────────────────────────────────────────────
// A "clinic" row is a clinic OR a hospital (`type`). It is informational
// metadata about where a doctor works and never gates access to anything — a
// doctor's own approval status is what controls that (see the cascade note on
// POST /doctors/:id/status above). A doctor can work at several places; one is
// marked primary. Adding, removing or changing a place never touches
// doctor_patients: a patient's relationship is with the doctor as a verified
// account, not with whichever building they work out of. If a doctor's
// standing actually changes (leaves, is suspended), that's a doctorStatus
// change, which does cascade — see above.

const posInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Shared validation for POST and PUT /clinics. Returns { error } or the values.
function readClinicBody(body) {
  const name = String(body.name || '').trim();
  const address = String(body.address || '').trim();
  const type = body.type === undefined || body.type === '' ? 'clinic' : String(body.type);
  if (!name) return { error: 'Name is required' };
  if (name.length > 150) return { error: 'Name is too long' };
  if (address.length > 255) return { error: 'Address is too long' };
  if (!FACILITY_TYPES.includes(type)) return { error: 'type must be clinic or hospital' };
  return { name, address, type };
}

// GET /admin/clinics — every clinic and hospital, for the assignment dropdown.
router.get('/clinics', requireAdmin, async (req, res) => {
  try {
    const [results] = await db.promise().query(selectClinics);
    return res.json({ results });
  } catch (e) {
    return serverError(res, e);
  }
});

// POST /admin/clinics  { name, address?, type? }   type: 'clinic' (default) | 'hospital'
router.post('/clinics', requireAdmin, async (req, res) => {
  const v = readClinicBody(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  try {
    const [result] = await db.promise().query(insertClinic, [v.name, v.address, v.type]);
    return res.status(201).json({ message: v.type === 'hospital' ? 'Hospital added' : 'Clinic added', id: result.insertId });
  } catch (e) {
    return serverError(res, e);
  }
});

// PUT /admin/clinics/:id  { name, address?, type? }
router.put('/clinics/:id', requireAdmin, async (req, res) => {
  const v = readClinicBody(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  try {
    const [result] = await db.promise().query(updateClinic, [v.name, v.address, v.type, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'No clinic with that id' });
    return res.json({ message: 'Updated' });
  } catch (e) {
    return serverError(res, e);
  }
});

// DELETE /admin/clinics/:id
// Doctors at this place are not removed: their link to it is deleted (and a
// doctor whose primary place this was gets another place promoted), and any
// pending request for it is withdrawn. Done explicitly, in one transaction,
// rather than counting on the foreign keys' ON DELETE CASCADE.
router.delete('/clinics/:id', requireAdmin, async (req, res) => {
  const clinicId = posInt(req.params.id);
  if (!clinicId) return res.status(404).json({ error: 'No clinic with that id' });
  let conn;
  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();
    const [affected] = await conn.query('SELECT doctor_id FROM doctor_clinics WHERE clinic_id=?', [clinicId]);
    await conn.query('DELETE FROM doctor_clinics WHERE clinic_id=?', [clinicId]);
    await conn.query('DELETE FROM doctor_clinic_requests WHERE clinic_id=?', [clinicId]);
    const [result] = await conn.query(deleteClinicById, [clinicId]);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'No clinic with that id' });
    }
    for (const a of affected) await normalizePrimary(conn, a.doctor_id);
    await conn.commit();
    return res.json({ message: 'Deleted' });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch (_) { /* connection already gone */ } }
    return serverError(res, e);
  } finally {
    if (conn) conn.release();
  }
});

// ── A doctor's places, edited directly by an admin ──────────────────────────
// Each route re-checks that the doctor and the place exist itself instead of
// trusting a foreign key to refuse a bad id.

// POST /admin/doctors/:id/clinics  { clinic_id }   add one place (first one becomes primary)
router.post('/doctors/:id/clinics', requireAdmin, async (req, res) => {
  const doctorId = posInt(req.params.id);
  const clinicId = posInt(req.body.clinic_id);
  if (!clinicId) return res.status(400).json({ error: 'clinic_id must be a positive integer' });
  if (!doctorId) return res.status(404).json({ error: 'No doctor account with that id' });
  try {
    const out = await withDoctorLock(db.promise(), doctorId, async (conn) => {
      const [c] = await conn.query(selectClinicById, [clinicId]);
      if (c.length === 0) return { code: 400, error: 'No clinic with that id' };
      const [[n]] = await conn.query('SELECT COUNT(*) AS n FROM doctor_clinics WHERE doctor_id=?', [doctorId]);
      if (Number(n.n) >= MAX_PLACES_PER_DOCTOR) {
        return { code: 400, error: `A doctor can be attached to at most ${MAX_PLACES_PER_DOCTOR} places` };
      }
      const r = await addPlace(conn, doctorId, clinicId);
      await conn.query(deleteRequest, [doctorId, clinicId]);   // any pending request for it is moot now
      return { code: 200, message: r === 'exists' ? 'Already attached' : 'Added' };
    });
    if (out.notFound) return res.status(404).json({ error: 'No doctor account with that id' });
    if (out.error) return res.status(out.code).json({ error: out.error });
    return res.json({ message: out.message });
  } catch (e) {
    return serverError(res, e);
  }
});

// DELETE /admin/doctors/:id/clinics/:clinicId   detach one place
router.delete('/doctors/:id/clinics/:clinicId', requireAdmin, async (req, res) => {
  const doctorId = posInt(req.params.id);
  const clinicId = posInt(req.params.clinicId);
  if (!doctorId) return res.status(404).json({ error: 'No doctor account with that id' });
  if (!clinicId) return res.status(404).json({ error: 'That doctor is not attached to that place' });
  try {
    const out = await withDoctorLock(db.promise(), doctorId, async (conn) => {
      const removed = await removePlace(conn, doctorId, clinicId);
      await conn.query(deleteRequest, [doctorId, clinicId]);
      return { removed };
    });
    if (out.notFound) return res.status(404).json({ error: 'No doctor account with that id' });
    if (!out.removed) return res.status(404).json({ error: 'That doctor is not attached to that place' });
    return res.json({ message: 'Removed' });
  } catch (e) {
    return serverError(res, e);
  }
});

// POST /admin/doctors/:id/clinics/:clinicId/primary   make one of their places the primary
router.post('/doctors/:id/clinics/:clinicId/primary', requireAdmin, async (req, res) => {
  const doctorId = posInt(req.params.id);
  const clinicId = posInt(req.params.clinicId);
  if (!doctorId) return res.status(404).json({ error: 'No doctor account with that id' });
  if (!clinicId) return res.status(404).json({ error: 'That doctor is not attached to that place' });
  try {
    const out = await withDoctorLock(db.promise(), doctorId, (conn) => setPrimary(conn, doctorId, clinicId));
    if (out && out.notFound) return res.status(404).json({ error: 'No doctor account with that id' });
    if (!out) return res.status(404).json({ error: 'That doctor is not attached to that place' });
    return res.json({ message: 'Primary place set' });
  } catch (e) {
    return serverError(res, e);
  }
});

// ── Doctor self-service requests ────────────────────────────────────────────
// A doctor asks to ADD or REMOVE one place themselves (routes/doctor.js); this
// is the admin side that reviews and applies it. Approving re-checks that the
// request is still there and still makes sense; rejecting only deletes it.
// The URLs carry doctor id + place id (not the request's own id) because a
// request row's id is renumbered by the weekly rebuild.

// GET /admin/clinic-requests — pending queue
router.get('/clinic-requests', requireAdmin, async (req, res) => {
  try {
    const [results] = await db.promise().query(selectPendingRequests);
    return res.json({ results: results.map((r) => ({ ...r, hasOtherPlaces: Boolean(r.hasOtherPlaces) })) });
  } catch (e) {
    return serverError(res, e);
  }
});

// POST /admin/clinic-requests/:doctorId/:clinicId/approve
router.post('/clinic-requests/:doctorId/:clinicId/approve', requireAdmin, async (req, res) => {
  const doctorId = posInt(req.params.doctorId);
  const clinicId = posInt(req.params.clinicId);
  if (!doctorId || !clinicId) return res.status(404).json({ error: 'No pending request for that doctor and place' });
  try {
    const out = await withDoctorLock(db.promise(), doctorId, async (conn) => {
      const [reqRows] = await conn.query(selectRequest, [doctorId, clinicId]);
      if (reqRows.length === 0) return { code: 404, error: 'No pending request for that doctor and place' };
      if (reqRows[0].action === 'add') {
        const [c] = await conn.query(selectClinicById, [clinicId]);
        if (c.length === 0) return { code: 400, error: 'That place no longer exists' };
        const [[n]] = await conn.query('SELECT COUNT(*) AS n FROM doctor_clinics WHERE doctor_id=?', [doctorId]);
        if (Number(n.n) >= MAX_PLACES_PER_DOCTOR) {
          return { code: 400, error: `A doctor can be attached to at most ${MAX_PLACES_PER_DOCTOR} places` };
        }
        await addPlace(conn, doctorId, clinicId);
      } else {
        await removePlace(conn, doctorId, clinicId);
      }
      await conn.query(deleteRequest, [doctorId, clinicId]);
      return { code: 200, message: reqRows[0].action === 'add' ? 'Place added' : 'Place removed' };
    });
    if (out.notFound) return res.status(404).json({ error: 'No doctor account with that id' });
    if (out.error) return res.status(out.code).json({ error: out.error });
    return res.json({ message: out.message });
  } catch (e) {
    return serverError(res, e);
  }
});

// POST /admin/clinic-requests/:doctorId/:clinicId/reject — deletes the request, nothing else changes
router.post('/clinic-requests/:doctorId/:clinicId/reject', requireAdmin, async (req, res) => {
  const doctorId = posInt(req.params.doctorId);
  const clinicId = posInt(req.params.clinicId);
  if (!doctorId || !clinicId) return res.status(404).json({ error: 'No pending request for that doctor and place' });
  try {
    const [result] = await db.promise().query(deleteRequest, [doctorId, clinicId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'No pending request for that doctor and place' });
    return res.json({ message: 'Request rejected' });
  } catch (e) {
    return serverError(res, e);
  }
});

// Churches (the web version of db/approveChurch.js)
router.use('/churches', require('./adminChurches'));

module.exports = router;
