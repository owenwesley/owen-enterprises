const express = require('express');
const { ioToDb, lostToDb } = require('../../../utils/coerce');
const { insertBook } = require('../../../db/sql/communitylibrary/books');
const { communitylibrary } = require('../../../db/db');
const { checkWho, whoToDb } = require('../../../utils/borrower');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  const b = req.body;
  // io/lost arrive from the frontend as the strings 'In'/'Out' and 'Yes'/'No' —
  // convert to the 1/0 the DB column actually stores.
  const ioVal   = ioToDb(b.io);
  const lostVal = lostToDb(b.lost);
  const whoErr = checkWho(ioVal, b.who, 'this book');
  if (whoErr) return res.status(400).json({ error: whoErr });
  try {
    await communitylibrary.promise().query(
      insertBook,
      [req.params.user_id, b.title || '', b.author || '', b.publisher || '',
       b.copywrite || 0, b.isbn || '', ioVal, whoToDb(ioVal, b.who),
       lostVal, b.img_url || '']
    );
    return res.json({ message: 'Book added' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
