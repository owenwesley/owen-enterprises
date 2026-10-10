const express = require('express');
const { bgtracker } = require('../../../db/db');
const { deleteAllMedicationsByUser } = require('../../../db/sql/bgtracker/medications');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

// Deliberately NOT using the deleteAllMedications export (db/sql/bgtracker/
// medications.js) — that export still does a drop-and-rebuild of the whole
// table, which renumbers EVERY user's row ids just to delete one user's rows.
// This is a plain DELETE scoped to user_id, so other users' rows are untouched.
router.post('/:user_id', async (req, res) => {
  try {
    await bgtracker.promise().query(deleteAllMedicationsByUser, [req.params.user_id]);
    return res.json({ message: 'All medications deleted' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
