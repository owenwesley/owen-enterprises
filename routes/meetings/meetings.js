const express = require('express');
const { formatDateRows } = require('../../utils/dateFormat');
const { selectMeetings } = require('../../db/sql/meetings/meetings');
const { meetings: db } = require('../../db/db');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

router.use('/add',    require('./meetings/add'));
router.use('/edit',   require('./meetings/edit'));
router.use('/delete', require('./meetings/delete'));

// GET /meetings/:user_id
router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await db.promise().query(
      selectMeetings + ' WHERE user_id=? ORDER BY id',
      [req.params.user_id]
    );
    return res.json({ results: formatDateRows(results) });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
