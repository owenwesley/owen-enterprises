const express = require('express');
const { ioToDb, lostToDb } = require('../../../utils/coerce');
const { insertBook } = require('../../../db/sql/communitylibrary/books');
const { communitylibrary } = require('../../../db/db');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  const b = req.body;
  // io/lost arrive from the frontend as the strings 'In'/'Out' and 'Yes'/'No' —
  // convert to the 1/0 the DB column actually stores.
  const ioVal   = ioToDb(b.io);
  const lostVal = lostToDb(b.lost);
  try {
    await communitylibrary.promise().query(
      insertBook,
      [req.params.user_id, b.title || '', b.author || '', b.publisher || '',
       b.copywrite || 0, b.isbn || '', ioVal, b.who || 'In Library',
       lostVal, b.img_url || '']
    );
    return res.json({ message: 'Book added' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
