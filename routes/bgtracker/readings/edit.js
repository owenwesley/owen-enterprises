const express  = require('express');
const { toBit, toNum } = require('../../../utils/coerce');
const { updateReply } = require('../../../utils/dbRespond');
const normalizeDate = require('../../../middleware/normalizeDate');
const { mergeExisting } = require('../../../utils/mergeExisting');
const { updateReading } = require('../../../db/sql/bgtracker/readings');
const { bgtracker }     = require('../../../db/db');
const router   = express.Router();

router.post('/:user_id', normalizeDate, async (req, res) => {
  const reply = updateReply(res, 'Reading updated');
  try {
    // Omitted fields keep their stored value (see utils/mergeExisting.js).
    const b = await mergeExisting(bgtracker, 'readings', req.body.id, req.params.user_id, req.body);
    if (!b) return reply(null, { affectedRows: 0 });
    // Param order MUST match SQL: 22 SET values, then id, then user_id
    const [result] = await bgtracker.promise().query(
      updateReading,
      [b.date || '', toNum(b.sugarB), toNum(b.carbsB), toNum(b.insulinSB), toNum(b.insulinFB), toBit(b.chkMedsB),
       toNum(b.sugarL), toNum(b.carbsL), toNum(b.insulinL), toBit(b.chkMedsL),
       toNum(b.sugarD), toNum(b.carbsD), toNum(b.insulinD), toBit(b.chkMedsD),
       toNum(b.sugarBB), toNum(b.carbsBB), toNum(b.insulinBB),
       toNum(b.sugarBed), toNum(b.carbsBed), toNum(b.insulinSBed), toNum(b.insulinFBed),
       toBit(b.chkMedsBed),
       b.id, req.params.user_id]
    );
    reply(null, result);
  } catch (err) {
    reply(err);
  }
});

module.exports = router;
