const express = require('express');
const { toNum } = require('../../../utils/coerce');
const normalizeDate = require('../../../middleware/normalizeDate');
const { insertWeights, trimWeights } = require('../../../db/sql/bgtracker/weights');
const { bgtracker }     = require('../../../db/db');
const router = express.Router();

router.post('/:user_id', normalizeDate, async (req, res) => {
  const b = req.body;
  try {
    await bgtracker.promise().query(
      insertWeights,
      [req.params.user_id, b.date || '', toNum(b.kg), toNum(b.lbs), toNum(b.bmi)]
    );
    // Keep the newest 90 rows only.
    await bgtracker.promise().query(trimWeights, [req.params.user_id, req.params.user_id]);
    return res.json({ message: 'Weight added' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
