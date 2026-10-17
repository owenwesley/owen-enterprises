const express = require('express');
const { deleteMeetingById } = require('../../../db/sql/meetings/meetings');
const { meetings: db } = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

// POST /meetings/delete/:user_id
router.post('/:user_id', async (req, res) => {
  try {
    await db.promise().query(deleteMeetingById, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Meeting deleted' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
