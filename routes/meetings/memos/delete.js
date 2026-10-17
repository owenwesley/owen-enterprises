const express = require('express');
const { deleteMemo } = require('../../../db/sql/meetings/memos');
const { meetings: db } = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

// POST /meetings/memos/delete/:user_id
router.post('/:user_id', async (req, res) => {
  try {
    await db.promise().query(deleteMemo, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Memo deleted' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
