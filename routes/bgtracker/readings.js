const express = require('express');
const { formatDateRows } = require('../../utils/dateFormat');
const { selectReadings } = require('../../db/sql/bgtracker/readings');
const { bgtracker } = require('../../db/db');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

// Middleware
router.use('/add', require('./readings/add'));
router.use('/edit', require('./readings/edit'));
router.use('/delete', require('./readings/delete'));
router.use('/deleteAll', require('./readings/deleteAll'));
router.use('/deleteByYear', require('./readings/deleteByYear'));

router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await bgtracker.promise().query(
      selectReadings + ' WHERE user_id=? ORDER BY date, id',
      [req.params.user_id]
    );
    return res.json({ results: formatDateRows(results) });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
