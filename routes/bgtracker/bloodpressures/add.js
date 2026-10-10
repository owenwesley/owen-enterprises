const express = require('express');
const { toNum } = require('../../../utils/coerce');
const normalizeDate = require('../../../middleware/normalizeDate');
const { insertBloodpressure } = require('../../../db/sql/bgtracker/bloodpressures');
const { bgtracker } = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

router.post('/:user_id', normalizeDate, async (req, res) => {
  const b = req.body;
  const user_id = req.params.user_id;
  try {
    await bgtracker.promise().query(
      insertBloodpressure,
      [user_id, b.date || '', toNum(b.hbp), toNum(b.lbp), toNum(b.hr), toNum(b.hbp2), toNum(b.lbp2), toNum(b.hr2)]
    );
    return res.json({ message: 'Blood pressure added' });
  } catch (err) {
    return serverError(res, err);
  }
});
module.exports = router;
