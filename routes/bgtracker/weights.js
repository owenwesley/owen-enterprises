const express = require('express');
const { formatDateRows } = require('../../utils/dateFormat');
const { selectWeights } = require('../../db/sql/bgtracker/weights');
const { bgtracker }     = require('../../db/db');
const router = express.Router();

router.use('/add',    require('./weights/add'));
router.use('/edit',   require('./weights/edit'));
router.use('/delete', require('./weights/delete'));

// GET /bgtracker/weights/:user_id
router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await bgtracker.promise().query(
      selectWeights + ' WHERE user_id=? ORDER BY date, id',
      [req.params.user_id]
    );
    return res.json({ results: formatDateRows(results) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
