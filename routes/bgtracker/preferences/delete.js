const express = require('express');
const { bgtracker } = require('../../../db/db');
const { deletePreference } = require('../../../db/sql/bgtracker/preferences');
const router = express.Router();

router.get('/:id', async (req, res) => {
  try {
    await bgtracker.promise().query(deletePreference, [req.params.id, req.user.id]);
    res.send(`Successfully Deleted Row ${req.params.id}`);
  } catch (err) {
    res.send(err.message);
  }
});

module.exports = router;
