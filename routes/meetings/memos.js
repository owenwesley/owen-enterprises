const express = require('express');
const { selectMemos } = require('../../db/sql/meetings/memos');
const { meetings: db } = require('../../db/db');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

router.use('/add',    require('./memos/add'));
router.use('/edit',   require('./memos/edit'));
router.use('/delete', require('./memos/delete'));

// GET /meetings/memos/:user_id
router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await db.promise().query(
      selectMemos + ' WHERE user_id=? ORDER BY name',
      [req.params.user_id]
    );
    return res.json({ results });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
