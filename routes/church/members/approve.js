const express = require('express');
const { church: db } = require('../../../db/db');
const { requireChurch } = require('../../../middleware/church');
const { approveMember } = require('../../../db/sql/church/members');
const { serverError } = require('../../../utils/serverError');
const { notFound } = require('../_helpers');
const router = express.Router({ mergeParams: true });

// POST /church/:church_id/members/approve/:user_id   { memberId }
router.post('/:user_id', requireChurch('members.manage'), async (req, res) => {
  try {
    const [r] = await db.promise().query(approveMember, [Number(req.body.memberId), req.church.id]);
    if (!r.affectedRows) return notFound(res);
    return res.json({ message: 'Member approved' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
