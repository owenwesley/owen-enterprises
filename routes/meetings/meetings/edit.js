const express = require('express');
const { updateReply } = require('../../../utils/dbRespond');
const normalizeDate = require('../../../middleware/normalizeDate');
const { updateMeeting } = require('../../../db/sql/meetings/meetings');
const { mergeExisting } = require('../../../utils/mergeExisting');
const { meetings: db } = require('../../../db/db');
const { meetingValues } = require('./_fields');
const router = express.Router();

// POST /meetings/edit/:user_id  — 25 SET values + id + user_id in WHERE = 27 total
router.post('/:user_id', normalizeDate, async (req, res) => {
  const reply = updateReply(res, 'Meeting updated');
  try {
    // Omitted fields keep their stored value (see utils/mergeExisting.js).
    const b = await mergeExisting(db, 'meetings', req.body.id, req.params.user_id, req.body);
    if (!b) return reply(null, { affectedRows: 0 });
    const [result] = await db.promise().query(
      updateMeeting,
      [...meetingValues(b), b.id, req.params.user_id]
    );
    reply(null, result);
  } catch (err) {
    reply(err);
  }
});

module.exports = router;
