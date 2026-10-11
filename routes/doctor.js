const express = require('express');
const { owenenterprises: db, bgtracker } = require('../db/db');
const { requireDoctor, requireApprovedDoctor } = require('../middleware/doctor');
const { requirePatientAccess } = require('../middleware/patientAccess');
const { hipaaGate } = require('../middleware/hipaaGate');
const { selectWeights } = require('../db/sql/bgtracker/weights');
const { selectBloodPressures } = require('../db/sql/bgtracker/bloodpressures');
const { selectReadings } = require('../db/sql/bgtracker/readings');
const { selectMedications } = require('../db/sql/bgtracker/medications');
const {
  selectClinics, selectClinicById, selectMyRequests, upsertRequest, deleteRequest,
} = require('../db/sql/owenenterprises/clinics');
const { listForDoctor, MAX_PLACES_PER_DOCTOR } = require('../utils/doctorClinics');
const { serverError } = require('../utils/serverError');

const router = express.Router();

// GET /doctor/me — the signed-in doctor's own account status, read fresh from
// the database. The client calls this because the status stored in the session
// goes stale when an admin approves the account mid-session. inviteCode is the
// code a patient enters on their own "My Doctors" page to link to this doctor.
router.get('/me', requireDoctor, async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT u.id, u.firstName, u.lastName, u.doctorStatus,
              COALESCE(p.licenseNumber, '') AS licenseNumber,
              COALESCE(p.specialty, '')     AS specialty,
              p.inviteCode
         FROM users u
         LEFT JOIN doctor_profiles p ON p.user_id = u.id
        WHERE u.id = ?`,
      [req.doctor.id]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Not found' });
    // `clinics` = every clinic / hospital they work at, primary first;
    // `clinicName` = the primary one's name (kept for older callers).
    const clinics = await listForDoctor(db.promise(), req.doctor.id);
    return res.json({ results: { ...rows[0], clinics, clinicName: clinics.length ? clinics[0].name : null } });
  } catch (e) {
    return serverError(res, e);
  }
});

// GET /doctor/patients — every patient with an active link to this doctor,
// and what that patient currently shares. Read-only: nothing here lets a
// doctor change a patient's own sharing choices.
router.get('/patients', requireApprovedDoctor, async (req, res) => {
  try {
    const [results] = await db.promise().query(
      `SELECT dp.id, dp.patient_id, u.firstName, u.lastName,
              dp.shareBP, dp.shareWeight, dp.shareReadings, dp.shareMedications
         FROM doctor_patients dp
         JOIN users u ON u.id = dp.patient_id
        WHERE dp.doctor_id = ? AND dp.status = 'active'
        ORDER BY u.lastName, u.firstName`,
      [req.doctor.id]
    );
    return res.json({ results });
  } catch (e) {
    return serverError(res, e);
  }
});

// Read-only patient data, one route per data type. Each requires an active
// link AND that specific sharing flag — a patient can share blood pressure
// with this doctor and nothing else. Same SELECT + ordering the patient's own
// GET routes use, just scoped to :patientId instead of the signed-in user.
router.get('/patients/:patientId/weights',
  requireApprovedDoctor, requirePatientAccess('shareWeight'), hipaaGate({ subject: 'patient' }), async (req, res) => {
    try {
      const [results] = await bgtracker.promise().query(
        selectWeights + ' WHERE user_id=? ORDER BY date, id',
        [req.params.patientId]
      );
      return res.json({ results });
    } catch (e) {
      return serverError(res, e);
    }
  });

router.get('/patients/:patientId/bloodpressures',
  requireApprovedDoctor, requirePatientAccess('shareBP'), hipaaGate({ subject: 'patient' }), async (req, res) => {
    try {
      const [results] = await bgtracker.promise().query(
        selectBloodPressures + ' WHERE user_id=? ORDER BY date, id',
        [req.params.patientId]
      );
      return res.json({ results });
    } catch (e) {
      return serverError(res, e);
    }
  });

router.get('/patients/:patientId/readings',
  requireApprovedDoctor, requirePatientAccess('shareReadings'), hipaaGate({ subject: 'patient' }), async (req, res) => {
    try {
      const [results] = await bgtracker.promise().query(
        selectReadings + ' WHERE user_id=? ORDER BY date, id',
        [req.params.patientId]
      );
      return res.json({ results });
    } catch (e) {
      return serverError(res, e);
    }
  });

router.get('/patients/:patientId/medications',
  requireApprovedDoctor, requirePatientAccess('shareMedications'), hipaaGate({ subject: 'patient' }), async (req, res) => {
    try {
      const [results] = await bgtracker.promise().query(
        selectMedications + ' WHERE user_id=? ORDER BY name, id',
        [req.params.patientId]
      );
      return res.json({ results });
    } catch (e) {
      return serverError(res, e);
    }
  });

// ── Clinic / hospital browse + self-service add or remove requests ──────────
// Available to a doctor even while still 'pending' approval (requireDoctor,
// NOT requireApprovedDoctor) — browsing/requesting is read-only-ish and useful
// during onboarding, and it's the doctor's own profile being touched, never
// patient data. Submitting a request never changes the doctor's places itself
// — only an admin approving does that (see routes/admin.js).

// GET /doctor/clinics?q=search&type=clinic|hospital — browse/search all places
router.get('/clinics', requireDoctor, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || '');
  try {
    const where = [];
    const params = [];
    if (q) { where.push('name LIKE ?'); params.push(`%${q}%`); }
    if (type === 'clinic' || type === 'hospital') { where.push('type = ?'); params.push(type); }
    const [results] = where.length
      ? await db.promise().query(
          `SELECT id, name, address, type FROM clinics WHERE ${where.join(' AND ')} ORDER BY name`, params)
      : await db.promise().query(selectClinics);
    return res.json({ results });
  } catch (e) {
    return serverError(res, e);
  }
});

// GET /doctor/my-clinics — this doctor's places (primary first) and pending requests
router.get('/my-clinics', requireDoctor, async (req, res) => {
  try {
    const clinics = await listForDoctor(db.promise(), req.doctor.id);
    const [requests] = await db.promise().query(selectMyRequests, [req.doctor.id]);
    return res.json({ results: { clinics, requests } });
  } catch (e) {
    return serverError(res, e);
  }
});

// POST /doctor/clinic-requests { clinic_id, action: 'add' | 'remove' } — submit a request.
// Asking again for the same place replaces the earlier request.
router.post('/clinic-requests', requireDoctor, async (req, res) => {
  const clinicId = Number(req.body.clinic_id);
  const action = req.body.action === undefined ? 'add' : req.body.action;
  if (!Number.isInteger(clinicId) || clinicId <= 0) {
    return res.status(400).json({ error: 'clinic_id must be a positive integer' });
  }
  if (action !== 'add' && action !== 'remove') {
    return res.status(400).json({ error: "action must be 'add' or 'remove'" });
  }
  try {
    const conn = db.promise();
    const [clinicRows] = await conn.query(selectClinicById, [clinicId]);
    if (clinicRows.length === 0) return res.status(400).json({ error: 'No clinic or hospital with that id' });
    const mine = await listForDoctor(conn, req.doctor.id);
    const linked = mine.some((c) => Number(c.id) === clinicId);
    if (action === 'add' && linked) return res.status(400).json({ error: 'You are already attached to that place' });
    if (action === 'remove' && !linked) return res.status(400).json({ error: 'You are not attached to that place' });
    if (action === 'add' && mine.length >= MAX_PLACES_PER_DOCTOR) {
      return res.status(400).json({ error: `You can be attached to at most ${MAX_PLACES_PER_DOCTOR} places` });
    }
    await conn.query(upsertRequest, [req.doctor.id, clinicId, action, action]);
    return res.json({ message: action === 'add' ? 'Add requested' : 'Removal requested' });
  } catch (e) {
    return serverError(res, e);
  }
});

// DELETE /doctor/clinic-requests/:clinicId — withdraw own pending request for that place
router.delete('/clinic-requests/:clinicId', requireDoctor, async (req, res) => {
  const clinicId = Number(req.params.clinicId);
  if (!Number.isInteger(clinicId) || clinicId <= 0) {
    return res.status(400).json({ error: 'clinicId must be a positive integer' });
  }
  try {
    await db.promise().query(deleteRequest, [req.doctor.id, clinicId]);
    return res.json({ message: 'Request withdrawn' });
  } catch (e) {
    return serverError(res, e);
  }
});

module.exports = router;
