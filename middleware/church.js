/**
 * middleware/church.js
 *
 * Authorisation for the Church module. Runs AFTER middleware/auth.js and
 * middleware/ownerOnly.js (needs req.user.id; the URL's last segment is already
 * known to be the signed-in user).
 *
 * Roles are permissions. Each role maps to a fixed list below and routes ask
 * for a PERMISSION, never a role name, so adding a role later means adding one
 * line here. Access needs an ACTIVE membership in an APPROVED church; every
 * other case (not a member, pending, removed, church pending / rejected /
 * suspended, church does not exist) gets the same 403 so nothing is revealed.
 *
 * The role and statuses are read from the database on every request, not from
 * the token, so removing a member or suspending a church takes effect at once.
 */
const { church: db } = require('../db/db');

const PERMISSIONS = {
  owner:  ['church.view', 'church.edit', 'church.transfer', 'joincode.reset', 'members.view', 'members.manage', 'library.view', 'library.share'],
  member: ['church.view', 'members.view', 'library.view', 'library.share'],
};

function requireChurch(permission) {
  return async function requireChurchMiddleware(req, res, next) {
    try {
      const churchId = Number(req.params.church_id);
      if (!Number.isInteger(churchId) || churchId < 1) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const [rows] = await db.promise().query(
        `SELECT m.role, m.status AS memberStatus, c.status AS churchStatus
           FROM members m JOIN churches c ON c.id = m.church_id
          WHERE m.church_id=? AND m.user_id=?`,
        [churchId, req.user.id]
      );
      const r = rows && rows[0];
      if (!r || r.memberStatus !== 'active' || r.churchStatus !== 'approved' ||
          !(PERMISSIONS[r.role] || []).includes(permission)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      req.church = { id: churchId, role: r.role };
      return next();
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  };
}

module.exports = { requireChurch, PERMISSIONS };
