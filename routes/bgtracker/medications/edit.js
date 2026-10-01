const express = require('express');
const { toNum, toStr } = require('../../../utils/coerce');
const { updateReply } = require('../../../utils/dbRespond');
const { mergeExisting } = require('../../../utils/mergeExisting');
const { updateMedication } = require('../../../db/sql/bgtracker/medications');
const { bgtracker } = require('../../../db/db');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  const reply = updateReply(res, 'Medication updated');
  try {
    const b = await mergeExisting(bgtracker, 'medications', req.body.id, req.params.user_id, req.body);
    if (!b) return reply(null, { affectedRows: 0 });
    // Param order MUST match SQL placeholder order exactly:
    // SET name=?,dose=?,unit=?,quantity=?,prescriber=?,am=?,noon=?,evening=?,bed=?
    // WHERE id=? AND user_id=?
    const [result] = await bgtracker.promise().query(
      updateMedication,
      [toStr(b.name), toStr(b.dose), toStr(b.unit), toNum(b.quantity), toStr(b.prescriber),
       toNum(b.am), toNum(b.noon), toNum(b.evening), toNum(b.bed),
       b.id, req.params.user_id]
    );
    reply(null, result);
  } catch (err) {
    reply(err);
  }
});
module.exports = router;
