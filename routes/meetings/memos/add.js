const express = require('express');
const { insertMemo } = require('../../../db/sql/meetings/memos');
const { meetings: db } = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

// POST /meetings/memos/add/:user_id
router.post('/:user_id', async (req, res) => {
  const { name } = req.body;
  try {
    await db.promise().query(insertMemo, [req.params.user_id, name || 'N/A']);
    return res.json({ message: 'Memo added' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
