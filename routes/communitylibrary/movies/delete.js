const express = require('express');
const { deleteMovieById } = require('../../../db/sql/communitylibrary/movies');
const { communitylibrary } = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  try {
    await communitylibrary.promise().query(deleteMovieById, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Movie deleted' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
