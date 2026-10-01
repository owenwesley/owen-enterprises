const express = require('express');
const { savePreference } = require('./_save');
const router = express.Router();

// POST /bgtracker/preferences/add/:user_id
// Upsert — see _save.js. Safe to call more than once.
router.post('/:user_id', async (req, res) => {
  try {
    await savePreference(req.params.user_id, req.body);
    return res.json({ message: 'Preference added' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
module.exports = router;
