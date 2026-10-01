const express = require('express');
const { deleteBookById } = require('../../../db/sql/communitylibrary/books');
const { communitylibrary } = require('../../../db/db');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  try {
    await communitylibrary.promise().query(deleteBookById, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Book deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
