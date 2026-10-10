const express = require('express');
const { formatDateRows } = require('../../utils/dateFormat');
const router = express.Router();
const { selectBloodPressures } = require('../../db/sql/bgtracker/bloodpressures');
const { bgtracker } = require('../../db/db');
const { serverError } = require('../../utils/serverError');

// Middleware
router.use('/add', require('./bloodpressures/add'));
router.use('/edit', require('./bloodpressures/edit'));
router.use('/delete', require('./bloodpressures/delete'));
router.use('/deleteAll', require('./bloodpressures/deleteAll'));

router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await bgtracker.promise().query(
      selectBloodPressures + ' WHERE user_id=? ORDER BY date, id',
      [req.params.user_id]
    );
    return res.json({ results: formatDateRows(results) });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
