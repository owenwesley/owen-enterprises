const express = require('express');
const { formatDateRows } = require('../../utils/dateFormat');
const { selectNutritions } = require('../../db/sql/bgtracker/nutritions');
const { bgtracker } = require('../../db/db');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

router.use('/add',      require('./nutritions/add'));
router.use('/edit',     require('./nutritions/edit'));
router.use('/delete',   require('./nutritions/delete'));
router.use('/deleteAll',require('./nutritions/deleteAll'));

// GET /bgtracker/nutritions/:user_id
router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await bgtracker.promise().query(
      selectNutritions + ' WHERE user_id=? ORDER BY date, id',
      [req.params.user_id]
    );
    return res.json({ results: formatDateRows(results) });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
