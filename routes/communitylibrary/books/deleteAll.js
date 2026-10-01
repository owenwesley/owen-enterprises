const express = require('express');
const { deleteAllBooks } = require('../../../db/sql/communitylibrary/books');
const { communitylibrary } = require('../../../db/db');
const router = express.Router();

router.get('/:user_id', async (req, res) => {
  try {
    await communitylibrary.promise().query(deleteAllBooks, [req.params.user_id]);
    res.send('Successfully Deleted All Rows');
  } catch (err) {
    res.send(err.message);
  }
});

module.exports = router;
