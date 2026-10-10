const express = require('express');
const { bgtracker } = require('../../../db/db');
const { deletePreference } = require('../../../db/sql/bgtracker/preferences');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

router.get('/:id', async (req, res) => {
  try {
    await bgtracker.promise().query(deletePreference, [req.params.id, req.user.id]);
    res.send(`Successfully Deleted Row ${req.params.id}`);
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
