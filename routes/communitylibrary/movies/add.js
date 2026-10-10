const express = require('express');
const { lostToDb } = require('../../../utils/coerce');
const { insertMovie } = require('../../../db/sql/communitylibrary/movies');
const { communitylibrary } = require('../../../db/db');
const { buildMovie, perFilmStatusSent } = require('./_fields');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  const b = req.body;
  const m = buildMovie(b, perFilmStatusSent(b));
  if (m.error) return res.status(400).json({ error: m.error });
  const params = [
    req.params.user_id,
    b.name || '',
    m.featureMedia,
    m.numMovie,
    ...m.slotParams,
    m.io,
    m.who,
    lostToDb(b.lost),
    b.img_url || '',
  ];
  // Expect exactly 104 params to match insertMovie's 104 placeholders
  try {
    await communitylibrary.promise().query(insertMovie, params);
    return res.json({ message: 'Movie added' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
