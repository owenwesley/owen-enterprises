const { owenenterprises: db } = require('../db/db');

/**
 * Per-patient, per-data-type access check for a doctor. Runs AFTER
 * middleware/doctor.js's requireApprovedDoctor (needs req.doctor.id) and
 * expects the patient's id as req.params.patientId.
 *
 * `column` is the doctor_patients sharing column for this data type
 * (shareBP, shareWeight, shareReadings, shareMedications). The link must be
 * 'active' AND that specific column must be 1 — a patient can share blood
 * pressure with one doctor and nothing else with another.
 *
 * Column names come only from the fixed list below, never from request input.
 */
const ALLOWED_COLUMNS = new Set(['shareBP', 'shareWeight', 'shareReadings', 'shareMedications']);

function requirePatientAccess(column) {
  if (!ALLOWED_COLUMNS.has(column)) {
    throw new Error(`requirePatientAccess: unknown column "${column}"`);
  }
  return async function requirePatientAccessMiddleware(req, res, next) {
    const patientId = req.params.patientId;
    if (!/^[0-9]+$/.test(String(patientId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const [rows] = await db.promise().query(
        `SELECT 1 FROM doctor_patients
          WHERE doctor_id=? AND patient_id=? AND status='active' AND \`${column}\`=1
          LIMIT 1`,
        [req.doctor.id, patientId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: 'No access to this patient' });
      }
      return next();
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  };
}

module.exports = { requirePatientAccess };
