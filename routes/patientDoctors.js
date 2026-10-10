const express = require('express');
const { owenenterprises: db } = require('../db/db');
const { toBit } = require('../utils/coerce');
const { serverError } = require('../utils/serverError');

const router = express.Router();

// This mount is NOT behind middleware/ownerOnly (see server.js) — every route
// here operates on the SIGNED-IN patient's own rows only (req.user.id), or on
// a specific link row after checking patient_id === req.user.id inline, the
// same self-contained pattern middleware/doctor.js and middleware/admin.js use.

// GET /patient-doctors — every doctor this patient has linked to, active or
// not, so a revoked link still shows (with a way to re-link). Not the doctor's
// approval status — a patient can only link to an ALREADY-approved doctor in
// the first place (see POST /link), so the point is moot for anything shown.
router.get('/', async (req, res) => {
  try {
    const [results] = await db.promise().query(
      `SELECT dp.id, dp.doctor_id, u.firstName, u.lastName,
              COALESCE(p.specialty, '') AS specialty,
              dp.status, dp.shareBP, dp.shareWeight, dp.shareReadings, dp.shareMedications
         FROM doctor_patients dp
         JOIN users u ON u.id = dp.doctor_id
         LEFT JOIN doctor_profiles p ON p.user_id = dp.doctor_id
        WHERE dp.patient_id = ?
        ORDER BY (dp.status = 'active') DESC, u.lastName, u.firstName`,
      [req.user.id]
    );
    return res.json({ results });
  } catch (e) {
    return serverError(res, e);
  }
});

// POST /patient-doctors/link  { inviteCode }
// Entering a valid code IS the patient's consent — the link is created
// 'active' immediately, all sharing on by default. Re-linking a doctor the
// patient revoked before reactivates the same row rather than erroring on the
// (doctor_id, patient_id) unique key, and keeps whatever sharing choices were
// there before rather than resetting them.
router.post('/link', async (req, res) => {
  const inviteCode = String(req.body.inviteCode || '').trim().toUpperCase();
  if (!inviteCode) return res.status(400).json({ error: 'Enter a code' });

  try {
    const conn = db.promise();
    const [rows] = await conn.query(
      `SELECT u.id AS doctor_id FROM doctor_profiles p
         JOIN users u ON u.id = p.user_id
        WHERE p.inviteCode = ? AND u.role='doctor' AND u.doctorStatus='approved'`,
      [inviteCode]
    );
    // Same message whether the code doesn't exist or the doctor isn't
    // approved yet — no reason to let a guess distinguish the two.
    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or inactive code' });
    }
    const doctorId = rows[0].doctor_id;
    await conn.query(
      `INSERT INTO doctor_patients (doctor_id, patient_id, status, requestedBy)
       VALUES (?, ?, 'active', 'patient')
       ON DUPLICATE KEY UPDATE status = 'active'`,
      [doctorId, req.user.id]
    );
    return res.json({ message: 'Doctor linked' });
  } catch (e) {
    return serverError(res, e);
  }
});

// POST /patient-doctors/:id/sharing  { shareBP?, shareWeight?, shareReadings?, shareMedications? }
// Only the fields present in the body are changed; omitted ones keep their
// current value (a partial toggle from the UI shouldn't reset the rest to 0).
router.post('/:id/sharing', async (req, res) => {
  const fields = ['shareBP', 'shareWeight', 'shareReadings', 'shareMedications'];
  const present = fields.filter((f) => Object.prototype.hasOwnProperty.call(req.body, f));
  if (present.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const setClause = present.map((f) => `\`${f}\`=?`).join(',');
  const values = present.map((f) => toBit(req.body[f]));
  try {
    const [result] = await db.promise().query(
      `UPDATE doctor_patients SET ${setClause} WHERE id=? AND patient_id=?`,
      [...values, req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ message: 'Sharing updated' });
  } catch (e) {
    return serverError(res, e);
  }
});

// POST /patient-doctors/:id/revoke
router.post('/:id/revoke', async (req, res) => {
  try {
    const [result] = await db.promise().query(
      `UPDATE doctor_patients SET status='revoked' WHERE id=? AND patient_id=?`,
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ message: 'Access revoked' });
  } catch (e) {
    return serverError(res, e);
  }
});

module.exports = router;
