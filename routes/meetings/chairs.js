const express = require('express');
const { updateReply } = require('../../utils/dbRespond');
const { toStr } = require('../../utils/coerce');
const {
  insertChair, selectChairs, updateChair, deleteChair,
} = require('../../db/sql/meetings/chairs');
const { mergeExisting } = require('../../utils/mergeExisting');
const { meetings: db } = require('../../db/db');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

// GET /chairs/:user_id
router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await db.promise().query(
      selectChairs + ' WHERE user_id=? ORDER BY name',
      [req.params.user_id]
    );
    return res.json({ results });
  } catch (err) {
    return serverError(res, err);
  }
});

// POST /chairs/add/:user_id
router.post('/add/:user_id', async (req, res) => {
  const { name } = req.body;
  try {
    await db.promise().query(insertChair, [req.params.user_id, name || 'New Chair']);
    return res.json({ message: 'Chair added' });
  } catch (err) {
    return serverError(res, err);
  }
});

// POST /chairs/edit/:user_id
router.post('/edit/:user_id', async (req, res) => {
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

// POST /chairs/delete/:user_id
router.post('/delete/:user_id', async (req, res) => {
  try {
    await db.promise().query(deleteChair, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Chair deleted' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
