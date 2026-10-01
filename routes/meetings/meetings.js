const express = require('express');
const { updateReply } = require('../../utils/dbRespond');
const { toNum, toStr } = require('../../utils/coerce');
const normalizeDate = require('../../middleware/normalizeDate');
const { formatDateRows } = require('../../utils/dateFormat');
const {
  insertMeeting, selectMeetings, updateMeeting, deleteMeetingById,
} = require('../../db/sql/meetings/meetings');
const { mergeExisting } = require('../../utils/mergeExisting');
const { meetings: db } = require('../../db/db');
const router = express.Router();

// GET /meetings/:user_id
router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await db.promise().query(
      selectMeetings + ' WHERE user_id=? ORDER BY id',
      [req.params.user_id]
    );
    return res.json({ results: formatDateRows(results) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /meetings/add/:user_id  — 26 values (no id column)
router.post('/add/:user_id', normalizeDate, async (req, res) => {
  const b = req.body;
  try {
    await db.promise().query(
      insertMeeting,
      [req.params.user_id,
       b.date || '', toStr(b.chair) || 'N/A', toStr(b.coChair) || 'N/A',
       toNum(b.newComer), toNum(b.day30), toNum(b.day60), toNum(b.day90),
       toNum(b.month6), toNum(b.month9), toNum(b.month12), toNum(b.month18),
       toNum(b.multiyr),
       toNum(b.gc1), toNum(b.gc2), toNum(b.gc3), toNum(b.gc4), toNum(b.gc5),
       toNum(b.gc6), toNum(b.gc7), toNum(b.gc8), toNum(b.gc9), toNum(b.gc10),
       toNum(b.attendance), toStr(b.memo) || 'N/A', toNum(b.deposit)]
    );
    return res.json({ message: 'Meeting added' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /meetings/edit/:user_id  — 25 SET values + id + user_id in WHERE = 27 total
router.post('/edit/:user_id', normalizeDate, async (req, res) => {
  const reply = updateReply(res, 'Meeting updated');
  try {
    const b = await mergeExisting(db, 'meetings', req.body.id, req.params.user_id, req.body);
    if (!b) return reply(null, { affectedRows: 0 });
    const [result] = await db.promise().query(
      updateMeeting,
      [b.date || '', toStr(b.chair) || 'N/A', toStr(b.coChair) || 'N/A',
       toNum(b.newComer), toNum(b.day30), toNum(b.day60), toNum(b.day90),
       toNum(b.month6), toNum(b.month9), toNum(b.month12), toNum(b.month18),
       toNum(b.multiyr),
       toNum(b.gc1), toNum(b.gc2), toNum(b.gc3), toNum(b.gc4), toNum(b.gc5),
       toNum(b.gc6), toNum(b.gc7), toNum(b.gc8), toNum(b.gc9), toNum(b.gc10),
       toNum(b.attendance), toStr(b.memo) || 'N/A', toNum(b.deposit),
       b.id, req.params.user_id]
    );
    reply(null, result);
  } catch (err) {
    reply(err);
  }
});

// POST /meetings/delete/:user_id
router.post('/delete/:user_id', async (req, res) => {
  try {
    await db.promise().query(deleteMeetingById, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Meeting deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
