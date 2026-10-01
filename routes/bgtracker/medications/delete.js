const express = require('express');
const { deleteMedicationById } = require('../../../db/sql/bgtracker/medications');
const { bgtracker } = require('../../../db/db');
const router = express.Router();

// Deliberately NOT using the deleteMedication export (db/sql/bgtracker/
// medications.js) — that export still does a drop-and-rebuild of the whole
// table, which renumbers EVERY user's row ids just to delete one row. This is
// a plain DELETE scoped to id+user_id, so no other row's id is disturbed.
router.post('/:user_id', async (req, res) => {
  try {
    await bgtracker.promise().query(deleteMedicationById, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Medication deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
module.exports = router;
