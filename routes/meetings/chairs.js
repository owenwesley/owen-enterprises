const express = require('express');
const { selectChairs } = require('../../db/sql/meetings/chairs');
const { meetings: db } = require('../../db/db');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

router.use('/add',    require('./chairs/add'));
router.use('/edit',   require('./chairs/edit'));
router.use('/delete', require('./chairs/delete'));

// GET /meetings/chairs/:user_id
router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await db.promise().query(
      selectChairs + ' WHERE user_id=? ORDER BY name',
      [req.params.user_id]
    );
    return res.json({ results });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
