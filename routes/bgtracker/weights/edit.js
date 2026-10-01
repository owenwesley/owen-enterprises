const express = require('express');
const { toNum } = require('../../../utils/coerce');
const { updateReply } = require('../../../utils/dbRespond');
const { mergeExisting } = require('../../../utils/mergeExisting');
const normalizeDate = require('../../../middleware/normalizeDate');
const { updateWeight } = require('../../../db/sql/bgtracker/weights');
const { bgtracker }    = require('../../../db/db');
const router = express.Router();

router.post('/:user_id', normalizeDate, async (req, res) => {
  const reply = updateReply(res, 'Weight updated');
  try {
    // Omitted fields keep their stored value (see utils/mergeExisting.js).
    const b = await mergeExisting(bgtracker, 'weights', req.body.id, req.params.user_id, req.body);
    if (!b) return reply(null, { affectedRows: 0 });
    // A cleared kg box used to be saved as 0 kg (toNum('') is 0). Refuse it
    // instead, so the stored weight is never silently wiped.
    if (!(toNum(b.kg) > 0)) {
      return res.status(400).json({ error: 'Enter a weight greater than 0 before saving.' });
    }
    // Param order MUST match SQL: date,kg,lbs,bmi, then id, then user_id
    const [result] = await bgtracker.promise().query(
      updateWeight,
      [b.date || '', toNum(b.kg), toNum(b.lbs), toNum(b.bmi), b.id, req.params.user_id]
    );
    reply(null, result);
  } catch (err) {
    reply(err);
  }
});

module.exports = router;
