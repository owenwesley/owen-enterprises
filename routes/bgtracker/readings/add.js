const express  = require('express');
const { toBit, toNum } = require('../../../utils/coerce');
const normalizeDate = require('../../../middleware/normalizeDate');
const { insertReadings } = require('../../../db/sql/bgtracker/readings');
const { bgtracker }      = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router   = express.Router();

router.post('/:user_id', normalizeDate, async (req, res) => {
  const b = req.body;
  const user_id = req.params.user_id;
  try {
    await bgtracker.promise().query(
      insertReadings,
      [user_id, b.date || '', toNum(b.sugarB), toNum(b.carbsB), toNum(b.insulinSB), toNum(b.insulinFB),
       toBit(b.chkMedsB), toNum(b.sugarL), toNum(b.carbsL), toNum(b.insulinL), toBit(b.chkMedsL),
       toNum(b.sugarD), toNum(b.carbsD), toNum(b.insulinD), toBit(b.chkMedsD),
       toNum(b.sugarBB), toNum(b.carbsBB), toNum(b.insulinBB),
       toNum(b.sugarBed), toNum(b.carbsBed), toNum(b.insulinSBed), toNum(b.insulinFBed),
       toBit(b.chkMedsBed)]
    );
    return res.json({ message: 'Reading added' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
