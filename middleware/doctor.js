const { owenenterprises: db } = require('../db/db');
const { serverError } = require('../utils/serverError');

/**
 * Doctor authorisation. Runs AFTER middleware/auth.js (needs req.user.id).
 *
 * Role and approval status are read from the database on every request rather
 * than trusted from the JWT: a token lives 8 hours, and an admin who rejects or
 * suspends a doctor must cut off access immediately, not when the token expires.
 */
async function loadDoctor(req, res, next) {
  try {
    const [rows] = await db.promise().query(
      'SELECT id, role, doctorStatus FROM users WHERE id=?',
      [req.user.id]
    );
    const u = rows && rows[0];
    if (!u || u.role !== 'doctor') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.doctor = { id: u.id, doctorStatus: u.doctorStatus };
    return next();
  } catch (e) {
    return serverError(res, e);
  }
}

/** Any doctor account, including ones still awaiting approval. */
const requireDoctor = loadDoctor;

/** A doctor whose account an admin has approved. Use this on anything that touches patient data. */
async function requireApprovedDoctor(req, res, next) {
  await loadDoctor(req, res, () => {
    if (req.doctor.doctorStatus !== 'approved') {
      return res.status(403).json({ error: 'Doctor account not approved' });
    }
    return next();
  });
}

module.exports = { requireDoctor, requireApprovedDoctor };
