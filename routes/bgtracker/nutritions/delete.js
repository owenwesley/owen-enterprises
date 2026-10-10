const express = require('express');
const { deleteNutritionById } = require('../../../db/sql/bgtracker/nutritions');
const { bgtracker } = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  try {
    await bgtracker.promise().query(deleteNutritionById, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Nutrition deleted' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
