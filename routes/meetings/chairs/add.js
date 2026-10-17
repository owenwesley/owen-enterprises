const express = require('express');
const { insertChair } = require('../../../db/sql/meetings/chairs');
const { meetings: db } = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

// POST /meetings/chairs/add/:user_id
router.post('/:user_id', async (req, res) => {
  const { name } = req.body;
  try {
    await db.promise().query(insertChair, [req.params.user_id, name || 'New Chair']);
    return res.json({ message: 'Chair added' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
