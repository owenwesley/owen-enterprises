const express = require('express');
const { savePreference } = require('./_save');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

// POST /bgtracker/preferences/add/:user_id
// Upsert — see _save.js. Safe to call more than once.
router.post('/:user_id', async (req, res) => {
  try {
    await savePreference(req.params.user_id, req.body);
    return res.json({ message: 'Preference added' });
  } catch (err) {
    return serverError(res, err);
  }
});
module.exports = router;
