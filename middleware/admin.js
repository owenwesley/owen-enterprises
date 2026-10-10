const { owenenterprises: db } = require('../db/db');
const { serverError } = require('../utils/serverError');

/**
 * Admin authorisation. Runs AFTER middleware/auth.js (needs req.user.id).
 *
 * Same policy as middleware/doctor.js and for the same reason: role is read
 * from the database on every request rather than trusted from the JWT, so
 * revoking admin access (db/makeAdmin.js <user> revoke) takes effect on the
 * next request, not when an 8-hour token happens to expire.
 */
async function requireAdmin(req, res, next) {
  try {
    const [rows] = await db.promise().query('SELECT role FROM users WHERE id=?', [req.user.id]);
    const u = rows && rows[0];
    if (!u || u.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  } catch (e) {
    return serverError(res, e);
  }
}

module.exports = { requireAdmin };
