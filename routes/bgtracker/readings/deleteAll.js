const express = require('express');
const { bgtracker } = require('../../../db/db');
const { deleteAllReadings } = require('../../../db/sql/bgtracker/readings');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  try {
    await bgtracker.promise().query(deleteAllReadings, [req.params.user_id]);
    return res.json({ message: 'All rows deleted' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
