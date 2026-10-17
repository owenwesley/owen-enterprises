const express = require('express');
const { church: db } = require('../../../db/db');
const { requireChurch, ASSIGNABLE_ROLES } = require('../../../middleware/church');
const { selectRoleTarget, setRole } = require('../../../db/sql/church/members');
const { serverError } = require('../../../utils/serverError');
const { clean, bad, notFound } = require('../_helpers');
const router = express.Router({ mergeParams: true });

// POST /church/:church_id/members/role/:user_id   { memberId, role }   owner only
router.post('/:user_id', requireChurch('members.roles'), async (req, res) => {
  const memberId = Number(req.body.memberId);
  const role = clean(req.body.role);
  if (!Number.isInteger(memberId) || memberId < 1) return bad(res, 'Choose a member');
  if (!ASSIGNABLE_ROLES.includes(role)) return bad(res, 'Unknown role');
  try {
    const [t] = await db.promise().query(selectRoleTarget, [memberId, req.church.id]);
    if (!t.length || t[0].user_id === req.user.id) return notFound(res);
    await db.promise().query(setRole, [role, memberId, req.church.id]);
    return res.json({ message: 'Role saved', role });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
