const express = require('express');
const { church: db } = require('../../db/db');
const { selectMembership, leaveChurch } = require('../../db/sql/church/members');
const { serverError } = require('../../utils/serverError');
const { bad, notFound } = require('./_helpers');
const router = express.Router({ mergeParams: true });

// POST /church/:church_id/leave/:user_id
// No permission check on purpose: a person whose request is still pending, or
// whose church was suspended, must still be able to step out.
router.post('/:user_id', async (req, res) => {
  const churchId = Number(req.params.church_id);
  try {
    const [mem] = await db.promise().query(selectMembership, [churchId, req.user.id]);
    if (!mem.length || mem[0].status === 'removed') return notFound(res);
    if (mem[0].role === 'owner') {
      return bad(res, 'The owner cannot leave. Contact the site owner to close the church.', 400);
    }
    const [r] = await db.promise().query(leaveChurch, [churchId, req.user.id]);
    if (!r.affectedRows) return notFound(res);
    return res.json({ message: 'You left the church' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
