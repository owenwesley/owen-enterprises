const express = require('express');
const { deleteChair } = require('../../../db/sql/meetings/chairs');
const { meetings: db } = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

// POST /meetings/chairs/delete/:user_id
router.post('/:user_id', async (req, res) => {
  try {
    await db.promise().query(deleteChair, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Chair deleted' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
