const express = require('express');
const { bgtracker } = require('../../../db/db');
const { deleteAllBloodpressuresByUser } = require('../../../db/sql/bgtracker/bloodpressures');
const router = express.Router();

// Deliberately NOT using the deleteAllBloodpressures export (db/sql/bgtracker/
// bloodpressures.js) — that export still does a drop-and-rebuild of the whole
// table, which renumbers EVERY user's row ids just to delete one user's rows.
// This is a plain DELETE scoped to user_id, so other users' rows are untouched.
router.post('/:user_id', async (req, res) => {
  try {
    await bgtracker.promise().query(deleteAllBloodpressuresByUser, [req.params.user_id]);
    return res.json({ message: 'All rows deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
