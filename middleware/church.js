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
const { serverError } = require('../utils/serverError');

const MEMBER_PERMISSIONS = ['church.view', 'members.view', 'library.view', 'library.share', 'contact.share', 'announcements.view'];
const PERMISSIONS = {
  owner:  [...MEMBER_PERMISSIONS, 'church.edit', 'church.transfer', 'joincode.reset', 'members.manage', 'members.roles', 'areas.manage', 'announcements.post'],
  // Leader: helps run the church day to day. Cannot edit the mission, reset the code, hand over, set roles or area switches.
  leader: [...MEMBER_PERMISSIONS, 'members.manage', 'announcements.post'],
  // Treasurer and mission leader are labels for now: they have the member permissions and nothing more.
  // When finances / missions are built, add their permissions on these two lines.
  treasurer: [...MEMBER_PERMISSIONS],
  missions:  [...MEMBER_PERMISSIONS],
  member: [...MEMBER_PERMISSIONS],
};
const ROLES = Object.keys(PERMISSIONS);
// Roles an owner may give to someone else (never 'owner': that is the hand-over).
const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== 'owner');

// A permission that belongs to an area the owner can switch off. Off means no one, the owner included, can use it.
const AREA_OF = {
  'announcements.view': 'areaAnnouncements', 'announcements.post': 'areaAnnouncements',
  'library.view': 'areaLibrary', 'library.share': 'areaLibrary',
  'contact.share': 'areaContacts',
};

function requireChurch(permission) {
  return async function requireChurchMiddleware(req, res, next) {
    try {
      const churchId = Number(req.params.church_id);
      if (!Number.isInteger(churchId) || churchId < 1) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const [rows] = await db.promise().query(
        `SELECT m.role, m.status AS memberStatus, c.status AS churchStatus,
               c.areaAnnouncements, c.areaLibrary, c.areaContacts
           FROM members m JOIN churches c ON c.id = m.church_id
          WHERE m.church_id=? AND m.user_id=?`,
        [churchId, req.user.id]
      );
      const r = rows && rows[0];
      if (!r || r.memberStatus !== 'active' || r.churchStatus !== 'approved' ||
          !(PERMISSIONS[r.role] || []).includes(permission) ||
          (AREA_OF[permission] && !r[AREA_OF[permission]])) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      req.church = { id: churchId, role: r.role };
      return next();
    } catch (e) {
      return serverError(res, e);
    }
  };
}

module.exports = { requireChurch, PERMISSIONS, ROLES, ASSIGNABLE_ROLES, AREA_OF };
