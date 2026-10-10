const express = require('express');
const { selectBooks } = require('../../db/sql/communitylibrary/books');
const { communitylibrary } = require('../../db/db');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

router.use('/add',    require('./books/add'));
router.use('/edit',   require('./books/edit'));
router.use('/delete', require('./books/delete'));

router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await communitylibrary.promise().query(
      selectBooks + ' WHERE user_id=? ORDER BY title, id',
      [req.params.user_id]
    );
    return res.json({ results });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
