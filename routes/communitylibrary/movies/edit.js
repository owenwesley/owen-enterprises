const express = require('express');
const { ioToDb, lostToDb } = require('../../../utils/coerce');
const { updateReply } = require('../../../utils/dbRespond');
const { mergeExisting } = require('../../../utils/mergeExisting');
const { updateMovie } = require('../../../db/sql/communitylibrary/movies');
const { communitylibrary } = require('../../../db/db');
const { slotFields } = require('./_fields');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  const reply = updateReply(res, 'Movie updated');
  try {
    const b = await mergeExisting(communitylibrary, 'movies', req.body.id, req.params.user_id, req.body);
    if (!b) return reply(null, { affectedRows: 0 });
    const ioVal   = ioToDb(b.io);
    const lostVal = lostToDb(b.lost);
    const params = [
      b.name || '',
      b.featureMedia || '',
      b.numMovie || 1,
      ...slotFields(b),
      ioVal,
      b.who || 'In Library',
      lostVal,
      b.img_url || '',
      b.id,
      req.params.user_id,
    ];
    // Expect exactly 69 params: 67 SET values + id + user_id
    const [result] = await communitylibrary.promise().query(updateMovie, params);
    reply(null, result);
  } catch (err) {
    reply(err);
  }
});

module.exports = router;
