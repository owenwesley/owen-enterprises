const express = require('express');
const normalizeDate = require('../../../middleware/normalizeDate');
const { insertNutritions } = require('../../../db/sql/bgtracker/nutritions');
const { bgtracker } = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

const MEAL_SUFFIXES = ['B', 'L', 'D', 'BB', 'Bed'];
const FIELD_KEYS = [
  'foodName', 'calories', 'saturated', 'trans', 'polyunsaturated',
  'monosaturated', 'cholesterol', 'sodium', 'carbs', 'fiber',
  'sugars', 'protein', 'vitaminA', 'vitaminC', 'vitaminD',
  'calcium', 'iron', 'potassium',
];

function buildParams(user_id, b) {
  const params = [user_id, b.date || ''];
  for (const suffix of MEAL_SUFFIXES) {
    for (const key of FIELD_KEYS) {
      const field = `${key}${suffix}`;
      params.push(key === 'foodName' ? (b[field] || '') : (b[field] || 0));
    }
  }
  return params;
}

router.post('/:user_id', normalizeDate, async (req, res) => {
  const b = req.body;
  try {
    await bgtracker.promise().query(insertNutritions, buildParams(req.params.user_id, b));
    return res.json({ message: 'Nutrition added' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
