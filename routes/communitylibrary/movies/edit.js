const express = require('express');
const { lostToDb } = require('../../../utils/coerce');
const { updateReply } = require('../../../utils/dbRespond');
const { mergeExisting } = require('../../../utils/mergeExisting');
const { updateMovie } = require('../../../db/sql/communitylibrary/movies');
const { communitylibrary } = require('../../../db/db');
const { buildMovie, perFilmStatusSent } = require('./_fields');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  const reply = updateReply(res, 'Movie updated');
  try {
    const b = await mergeExisting(communitylibrary, 'movies', req.body.id, req.params.user_id, req.body);
    if (!b) return reply(null, { affectedRows: 0 });
    const m = buildMovie(b, perFilmStatusSent(req.body) || (
      // A full stored row always carries per-film status; only a sparse body
      // that sets disc-level io/who alone should apply to every film.
      req.body.io === undefined && req.body.who === undefined
    ));
    if (m.error) return res.status(400).json({ error: m.error });
    const params = [
      b.name || '',
      m.featureMedia,
      m.numMovie,
      ...m.slotParams,
      m.io,
      m.who,
      lostToDb(b.lost),
      b.img_url || '',
      b.id,
      req.params.user_id,
    ];
    // Expect exactly 105 params: 103 SET values + id + user_id
    const [result] = await communitylibrary.promise().query(updateMovie, params);
    reply(null, result);
  } catch (err) {
    reply(err);
  }
});

module.exports = router;
