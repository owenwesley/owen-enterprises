const express = require('express');
const { savePreference } = require('./_save');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

// POST /bgtracker/preferences/edit/:user_id
// Upsert by user_id — the client-supplied `id` is not needed (or trusted),
// so a stale id can no longer turn the save into a silent no-op.
router.post('/:user_id', async (req, res) => {
  try {
    await savePreference(req.params.user_id, req.body);
    return res.json({ message: 'Preference updated' });
  } catch (err) {
    return serverError(res, err);
  }
});
module.exports = router;
