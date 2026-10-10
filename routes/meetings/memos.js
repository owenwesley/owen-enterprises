const express = require('express');
const { updateReply } = require('../../utils/dbRespond');
const { toStr } = require('../../utils/coerce');
const {
  insertMemo, selectMemos, updateMemo, deleteMemo,
} = require('../../db/sql/meetings/memos');
const { mergeExisting } = require('../../utils/mergeExisting');
const { meetings: db } = require('../../db/db');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

// GET /memos/:user_id
router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await db.promise().query(
      selectMemos + ' WHERE user_id=? ORDER BY name',
      [req.params.user_id]
    );
    return res.json({ results });
  } catch (err) {
    return serverError(res, err);
  }
});

// POST /memos/add/:user_id
router.post('/add/:user_id', async (req, res) => {
  const { name } = req.body;
  try {
    await db.promise().query(insertMemo, [req.params.user_id, name || 'N/A']);
    return res.json({ message: 'Memo added' });
  } catch (err) {
    return serverError(res, err);
  }
});

// POST /memos/edit/:user_id
router.post('/edit/:user_id', async (req, res) => {
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

// POST /memos/delete/:user_id
router.post('/delete/:user_id', async (req, res) => {
  try {
    await db.promise().query(deleteMemo, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Memo deleted' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
