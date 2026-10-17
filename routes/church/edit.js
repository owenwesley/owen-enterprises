const express = require('express');
const { church: db } = require('../../db/db');
const { requireChurch } = require('../../middleware/church');
const { updateMission } = require('../../db/sql/church/churches');
const { serverError } = require('../../utils/serverError');
const { clean, bad, notFound } = require('./_helpers');
const router = express.Router({ mergeParams: true });

const MISSION_MAX = 2000;

// POST /church/:church_id/edit/:user_id   { missionStatement }
router.post('/:user_id', requireChurch('church.edit'), async (req, res) => {
  const mission = clean(req.body.missionStatement);
  if (mission.length > MISSION_MAX) return bad(res, `Mission statement must be ${MISSION_MAX} characters or fewer`);
  try {
    const [r] = await db.promise().query(updateMission, [mission, req.church.id]);
    if (!r.affectedRows) return notFound(res);
    return res.json({ message: 'Mission statement saved' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
