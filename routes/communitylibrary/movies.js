const express = require('express');
const { selectMovies } = require('../../db/sql/communitylibrary/movies');
const { communitylibrary } = require('../../db/db');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

router.use('/add',    require('./movies/add'));
router.use('/edit',   require('./movies/edit'));
router.use('/delete', require('./movies/delete'));

router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await communitylibrary.promise().query(
      selectMovies + ' WHERE user_id=? ORDER BY name, id',
      [req.params.user_id]
    );
    return res.json({ results });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
