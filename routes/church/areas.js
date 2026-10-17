const express = require('express');
const { church: db } = require('../../db/db');
const { requireChurch } = require('../../middleware/church');
const { AREA_COLUMNS, updateArea } = require('../../db/sql/church/churches');
const { serverError } = require('../../utils/serverError');
const { bad, asFlag } = require('./_helpers');
const router = express.Router({ mergeParams: true });

// POST /church/:church_id/areas/:user_id   { announcements?, library?, contacts? }   owner only
// Only the keys sent are changed. Switching library or contacts off also switches every member's
// sharing off and erases the stored phone / address, so switching it back on shares nothing until
// each person opts in again. Announcements are only hidden (nothing is deleted).
router.post('/:user_id', requireChurch('areas.manage'), async (req, res) => {
  const keys = Object.keys(AREA_COLUMNS).filter((k) => req.body[k] !== undefined);
  if (!keys.length) return bad(res, 'Nothing to change');
  try {
    for (const k of keys) {
      const on = asFlag(req.body[k]);
      await db.promise().query(updateArea(k), [on, req.church.id]);
      if (!on && k === 'library') await db.promise().query('UPDATE members SET shareLibrary=0 WHERE church_id=?', [req.church.id]);
      if (!on && k === 'contacts') await db.promise().query("UPDATE members SET shareContact=0, contactPhone='', contactAddress='' WHERE church_id=?", [req.church.id]);
    }
    return res.json({ message: 'Saved' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
