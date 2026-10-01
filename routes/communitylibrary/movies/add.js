const express = require('express');
const { ioToDb, lostToDb } = require('../../../utils/coerce');
const { insertMovie } = require('../../../db/sql/communitylibrary/movies');
const { communitylibrary } = require('../../../db/db');
const { slotFields } = require('./_fields');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  const b = req.body;
  const ioVal   = ioToDb(b.io);
  const lostVal = lostToDb(b.lost);
  const params = [
    req.params.user_id,
    b.name || '',
    b.featureMedia || '',
    b.numMovie || 1,
    ...slotFields(b),
    ioVal,
    b.who || 'In Library',
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
