const express = require('express');
const { ioToDb, lostToDb } = require('../../../utils/coerce');
const { updateReply } = require('../../../utils/dbRespond');
const { mergeExisting } = require('../../../utils/mergeExisting');
const { updateBook } = require('../../../db/sql/communitylibrary/books');
const { communitylibrary } = require('../../../db/db');
const { checkWho, whoToDb } = require('../../../utils/borrower');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  const reply = updateReply(res, 'Book updated');
  try {
    const b = await mergeExisting(communitylibrary, 'books', req.body.id, req.params.user_id, req.body);
    if (!b) return reply(null, { affectedRows: 0 });
    const ioVal   = ioToDb(b.io);
    const lostVal = lostToDb(b.lost);
    const whoErr = checkWho(ioVal, b.who, 'this book');
    if (whoErr) return res.status(400).json({ error: whoErr });
    const [result] = await communitylibrary.promise().query(
      updateBook,
      [b.title, b.author, b.publisher, b.copywrite || 0, b.isbn,
       ioVal, whoToDb(ioVal, b.who), lostVal, b.img_url,
       b.id, req.params.user_id]
    );
    reply(null, result);
  } catch (err) {
    reply(err);
  }
});

module.exports = router;
