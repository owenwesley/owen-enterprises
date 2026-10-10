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
  selectClinics, selectClinicById,
  selectMyClinicRequest, setClinicRequest, clearClinicRequest,
} = require('../db/sql/owenenterprises/clinics');
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
              p.inviteCode, c.name AS clinicName
         FROM users u
         LEFT JOIN doctor_profiles p ON p.user_id = u.id
         LEFT JOIN clinics c ON c.id = p.clinic_id
        WHERE u.id = ?`,
      [req.doctor.id]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ results: rows[0] });
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

// ── Clinic browse + self-service change request ──────────────────────────────
// Available to a doctor even while still 'pending' approval (requireDoctor,
// NOT requireApprovedDoctor) — browsing/requesting is read-only-ish and useful
// during onboarding, and it's the doctor's own profile row being touched,
// never patient data. Submitting a request never writes clinic_id itself —
// only an admin approving does that (see routes/admin.js).

// GET /doctor/clinics?q=search — browse/search all clinics
router.get('/clinics', requireDoctor, async (req, res) => {
  const q = String(req.query.q || '').trim();
  try {
    const [results] = q
      ? await db.promise().query(
          'SELECT id, name, address FROM clinics WHERE name LIKE ? ORDER BY name',
          [`%${q}%`]
        )
      : await db.promise().query(selectClinics);
    return res.json({ results });
  } catch (e) {
    return serverError(res, e);
  }
});

// GET /doctor/clinic-request — this doctor's current clinic + pending request
router.get('/clinic-request', requireDoctor, async (req, res) => {
  try {
    const [rows] = await db.promise().query(selectMyClinicRequest, [req.doctor.id]);
    return res.json({ results: rows[0] || null });
  } catch (e) {
    return serverError(res, e);
  }
});

// POST /doctor/clinic-request { clinic_id } — submit/replace a pending request
router.post('/clinic-request', requireDoctor, async (req, res) => {
  const clinicId = Number(req.body.clinic_id);
  if (!Number.isInteger(clinicId) || clinicId <= 0) {
    return res.status(400).json({ error: 'clinic_id must be a positive integer' });
  }
  try {
    const [clinicRows] = await db.promise().query(selectClinicById, [clinicId]);
    if (clinicRows.length === 0) {
      return res.status(400).json({ error: 'No clinic with that id' });
    }
    await db.promise().query(setClinicRequest, [clinicId, req.doctor.id]);
    return res.json({ message: 'Clinic change requested' });
  } catch (e) {
    return serverError(res, e);
  }
});

// DELETE /doctor/clinic-request — withdraw own pending request
router.delete('/clinic-request', requireDoctor, async (req, res) => {
  try {
    await db.promise().query(clearClinicRequest, [req.doctor.id]);
    return res.json({ message: 'Clinic request withdrawn' });
  } catch (e) {
    return serverError(res, e);
  }
});

module.exports = router;
