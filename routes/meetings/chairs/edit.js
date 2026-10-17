const express = require('express');
const { updateReply } = require('../../../utils/dbRespond');
const { toStr } = require('../../../utils/coerce');
const { updateChair } = require('../../../db/sql/meetings/chairs');
const { mergeExisting } = require('../../../utils/mergeExisting');
const { meetings: db } = require('../../../db/db');
const router = express.Router();

// POST /meetings/chairs/edit/:user_id
router.post('/:user_id', async (req, res) => {
  const reply = updateReply(res, 'Chair updated');
  try {
    const row = await mergeExisting(db, 'chairs', req.body.id, req.params.user_id, req.body);
    if (!row) return reply(null, { affectedRows: 0 });
    const { id, name } = row;
    const [result] = await db.promise().query(updateChair, [toStr(name), id, req.params.user_id]);
    reply(null, result);
  } catch (err) {
    reply(err);
  }
});

module.exports = router;
