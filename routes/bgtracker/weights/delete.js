const express = require('express');
const { deleteWeightById } = require('../../../db/sql/bgtracker/weights');
const { bgtracker }        = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  try {
    await bgtracker.promise().query(deleteWeightById, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Weight deleted' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
