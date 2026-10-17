const express = require('express');
const normalizeDate = require('../../../middleware/normalizeDate');
const { insertMeeting } = require('../../../db/sql/meetings/meetings');
const { meetings: db } = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const { meetingValues } = require('./_fields');
const router = express.Router();

// POST /meetings/add/:user_id  — user_id + 25 values (no id column)
router.post('/:user_id', normalizeDate, async (req, res) => {
  try {
    await db.promise().query(insertMeeting, [req.params.user_id, ...meetingValues(req.body)]);
    return res.json({ message: 'Meeting added' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
