const express = require('express');
const { deleteAllBooks } = require('../../../db/sql/communitylibrary/books');
const { communitylibrary } = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

router.get('/:user_id', async (req, res) => {
  try {
    await communitylibrary.promise().query(deleteAllBooks, [req.params.user_id]);
    res.send('Successfully Deleted All Rows');
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
