const express = require('express');
const { toNum, toStr } = require('../../../utils/coerce');
const { insertMedication } = require('../../../db/sql/bgtracker/medications');
const { bgtracker } = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  const b = req.body;
  const user_id = req.params.user_id;
  try {
    await bgtracker.promise().query(
      insertMedication,
      [user_id, toStr(b.name) || 'Name', toStr(b.dose) || '0.00', toStr(b.unit) || 'G',
       toNum(b.quantity), toStr(b.prescriber) || 'Name',
       toNum(b.am), toNum(b.noon), toNum(b.evening), toNum(b.bed)]
    );
    return res.json({ message: 'Medication added' });
  } catch (err) {
    return serverError(res, err);
  }
});
module.exports = router;
