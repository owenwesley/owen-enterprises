const express = require('express');
const { deleteAllNutritions } = require('../../../db/sql/bgtracker/nutritions');
const { bgtracker } = require('../../../db/db');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  try {
    await bgtracker.promise().query(deleteAllNutritions, [req.params.user_id]);
    return res.json({ message: 'All nutrition rows deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
