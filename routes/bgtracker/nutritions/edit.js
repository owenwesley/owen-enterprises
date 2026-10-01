const express = require('express');
const { updateReply } = require('../../../utils/dbRespond');
const normalizeDate = require('../../../middleware/normalizeDate');
const { mergeExisting } = require('../../../utils/mergeExisting');
const { updateNutrition } = require('../../../db/sql/bgtracker/nutritions');
const { bgtracker } = require('../../../db/db');
const router = express.Router();

const MEAL_SUFFIXES = ['B', 'L', 'D', 'BB', 'Bed'];
const FIELD_KEYS = [
  'foodName', 'calories', 'saturated', 'trans', 'polyunsaturated',
  'monosaturated', 'cholesterol', 'sodium', 'carbs', 'fiber',
  'sugars', 'protein', 'vitaminA', 'vitaminC', 'vitaminD',
  'calcium', 'iron', 'potassium',
];

function buildParams(b, user_id) {
  const params = [b.date || ''];
  for (const suffix of MEAL_SUFFIXES) {
    for (const key of FIELD_KEYS) {
      const field = `${key}${suffix}`;
      params.push(key === 'foodName' ? (b[field] || '') : (b[field] || 0));
    }
  }
  params.push(b.id, user_id);
  return params;
}

router.post('/:user_id', normalizeDate, async (req, res) => {
  const reply = updateReply(res, 'Nutrition updated');
  try {
    const b = await mergeExisting(bgtracker, 'nutritions', req.body.id, req.params.user_id, req.body);
    if (!b) return reply(null, { affectedRows: 0 });
    const [result] = await bgtracker.promise().query(updateNutrition, buildParams(b, req.params.user_id));
    reply(null, result);
  } catch (err) {
    reply(err);
  }
});

module.exports = router;
