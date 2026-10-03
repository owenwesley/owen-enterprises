const express = require('express');
const { ioToDb, lostToDb } = require('../../../utils/coerce');
const { insertMovie } = require('../../../db/sql/communitylibrary/movies');
const { communitylibrary } = require('../../../db/db');
const { slotFields, normalizeCollection, checkWho } = require('./_fields');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  const b = req.body;
  const ioVal   = ioToDb(b.io);
  const lostVal = lostToDb(b.lost);
  const whoErr = checkWho(ioVal, b.who);
  if (whoErr) return res.status(400).json({ error: whoErr });
  const col = normalizeCollection(b);
  const params = [
    req.params.user_id,
    b.name || '',
    col.featureMedia,
    col.numMovie,
    ...slotFields(b),
    ioVal,
    ioVal === 1 ? 'In Library' : b.who.trim(),
    lostVal,
    b.img_url || '',
  ];
  // Expect exactly 68 params to match insertMovie's 68 placeholders
  try {
    await communitylibrary.promise().query(insertMovie, params);
    return res.json({ message: 'Movie added' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
