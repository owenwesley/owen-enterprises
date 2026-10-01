const express = require('express');
const { deleteMovieById } = require('../../../db/sql/communitylibrary/movies');
const { communitylibrary } = require('../../../db/db');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  try {
    await communitylibrary.promise().query(deleteMovieById, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Movie deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
