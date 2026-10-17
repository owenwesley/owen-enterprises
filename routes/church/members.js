const express = require('express');
const { church: db } = require('../../db/db');
const { requireChurch, PERMISSIONS } = require('../../middleware/church');
const { selectChurchMembers } = require('../../db/sql/church/members');
const { serverError } = require('../../utils/serverError');
const { displayNames } = require('./_helpers');
const router = express.Router({ mergeParams: true });

router.use('/approve', require('./members/approve'));
router.use('/remove',  require('./members/remove'));
router.use('/role',    require('./members/role'));

// GET /church/:church_id/members/:user_id
router.get('/:user_id', requireChurch('members.view'), async (req, res) => {
  try {
    const canManage = (PERMISSIONS[req.church.role] || []).includes('members.manage');
    const [rows] = await db.promise().query(selectChurchMembers, [req.church.id]);
    // Only the owner and leaders see people who are still waiting.
    const visible = rows.filter((r) => canManage || r.status === 'active');
    const names = await displayNames([...new Set(visible.map((r) => r.user_id))]);
    const results = visible.map((r) => ({
      memberId: r.id,
      name: names.get(r.user_id) || 'Former member',
      role: r.role,
      status: r.status,
      joinedAt: r.createdAt,
      isYou: r.user_id === req.user.id,
    }));
    return res.json({ results });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
