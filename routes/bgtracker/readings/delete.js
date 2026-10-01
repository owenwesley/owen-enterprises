const express  = require('express');
const { deleteReadingById } = require('../../../db/sql/bgtracker/readings');
const { bgtracker }         = require('../../../db/db');
const router   = express.Router();

router.post('/:user_id', async (req, res) => {
  // Delete the specific row by id (matches frontend's per-row delete button)
  try {
    await bgtracker.promise().query(deleteReadingById, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Reading deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
