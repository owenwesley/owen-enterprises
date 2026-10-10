const express  = require('express');
const { deleteReadingsByYear } = require('../../../db/sql/bgtracker/readings');
const { bgtracker }            = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router   = express.Router();

// POST /bgtracker/readings/deleteByYear/:user_id
// body: { year: 'YY' | 'YYYY' }
//   Dates are stored as ISO 'YYYY-MM-DD', so a year is matched with 'YYYY-%'.
//   A 2-digit year is read as 20YY (same convention as the rest of the app).
router.post('/:user_id', async (req, res) => {
  const y = String(req.body.year ?? '').trim();
  let fullYear;
  if (/^\d{2}$/.test(y)) fullYear = 2000 + Number(y);
  else if (/^\d{4}$/.test(y)) fullYear = Number(y);
  else {
    return res.status(400).json({ error: 'year must be a 2- or 4-digit string, e.g. "20" or "2020"' });
  }
  const pattern = `${fullYear}-%`;
  try {
    const [result] = await bgtracker.promise().query(deleteReadingsByYear, [req.params.user_id, pattern]);
    return res.json({ message: 'Readings for year deleted', affectedRows: result?.affectedRows });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
