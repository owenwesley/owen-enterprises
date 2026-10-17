const express = require('express');
const { updateReply } = require('../../../utils/dbRespond');
const { toStr } = require('../../../utils/coerce');
const { updateMemo } = require('../../../db/sql/meetings/memos');
const { mergeExisting } = require('../../../utils/mergeExisting');
const { meetings: db } = require('../../../db/db');
const router = express.Router();

// POST /meetings/memos/edit/:user_id
router.post('/:user_id', async (req, res) => {
  const reply = updateReply(res, 'Memo updated');
  try {
    const row = await mergeExisting(db, 'memos', req.body.id, req.params.user_id, req.body);
    if (!row) return reply(null, { affectedRows: 0 });
    const { id, name } = row;
    const [result] = await db.promise().query(updateMemo, [toStr(name), id, req.params.user_id]);
    reply(null, result);
  } catch (err) {
    reply(err);
  }
});

module.exports = router;
