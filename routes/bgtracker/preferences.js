const express = require('express');
const { selectPreferences } = require('../../db/sql/bgtracker/preferences');
const { bgtracker } = require('../../db/db');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

router.use('/add',    require('./preferences/add'));
router.use('/edit',   require('./preferences/edit'));
router.use('/delete', require('./preferences/delete'));

// GET /bgtracker/preferences/:user_id — single user preference (returns one object)
router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await bgtracker.promise().query(
      selectPreferences + ' WHERE user_id=?',
      [req.params.user_id]
    );
    // Return single object so frontend can do data.results.id directly
    return res.json({ results: results[0] || null });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
