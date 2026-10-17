const express = require('express');
const { church: db } = require('../../../db/db');
const { requireChurch } = require('../../../middleware/church');
const { removeMember, removeAnyMember } = require('../../../db/sql/church/members');
const { serverError } = require('../../../utils/serverError');
const { notFound } = require('../_helpers');
const router = express.Router({ mergeParams: true });

// POST /church/:church_id/members/remove/:user_id   { memberId }
router.post('/:user_id', requireChurch('members.manage'), async (req, res) => {
  try {
    // The owner may remove anyone but the owner; a leader only ordinary members (never another leader or role holder).
    const sql = req.church.role === 'owner' ? removeAnyMember : removeMember;
    const [r] = await db.promise().query(sql, [Number(req.body.memberId), req.church.id]);
    if (!r.affectedRows) return notFound(res);
    return res.json({ message: 'Member removed' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
