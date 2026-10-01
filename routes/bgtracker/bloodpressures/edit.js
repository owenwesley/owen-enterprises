const express = require('express');
const { toNum } = require('../../../utils/coerce');
const { updateReply } = require('../../../utils/dbRespond');
const normalizeDate = require('../../../middleware/normalizeDate');
const { mergeExisting } = require('../../../utils/mergeExisting');
const { updateBP } = require('../../../db/sql/bgtracker/bloodpressures');
const { bgtracker } = require('../../../db/db');
const router = express.Router();

router.post('/:user_id', normalizeDate, async (req, res) => {
  if (req.body.id == null || req.body.id === '') {
    return res.status(400).json({ error: 'Missing blood pressure row id.' });
  }
  const reply = updateReply(res, 'Blood pressure updated');
  try {
    const b = await mergeExisting(bgtracker, 'bloodpressures', req.body.id, req.params.user_id, req.body);
    if (!b) return reply(null, { affectedRows: 0 });
    // Param order MUST match the SQL placeholder order exactly:
    // SET date=?,hbp=?,lbp=?,hr=?,hbp2=?,lbp2=?,hr2=? WHERE id=? AND user_id=?
    // Numbers go through toNum so a cleared field ('') is stored as 0, not junk.
    const [result] = await bgtracker.promise().query(
      updateBP,
      [b.date || '', toNum(b.hbp), toNum(b.lbp), toNum(b.hr), toNum(b.hbp2), toNum(b.lbp2), toNum(b.hr2), b.id, req.params.user_id]
    );
    reply(null, result);
  } catch (err) {
    reply(err);
  }
});
module.exports = router;
