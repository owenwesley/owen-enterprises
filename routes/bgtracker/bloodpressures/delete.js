const express = require('express');
const { bgtracker } = require('../../../db/db');
const router = express.Router();

// Delete a specific row by its own id (safe, targeted delete)
router.post('/:user_id', async (req, res) => {
  try {
    await bgtracker.promise().query(
      `DELETE FROM bloodpressures WHERE id=? AND user_id=?`,
      [req.body.id, req.params.user_id]
    );
    return res.json({ message: 'Blood pressure deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
module.exports = router;
