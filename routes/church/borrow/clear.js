const express = require('express');
const { church: db } = require('../../../db/db');
const { clearBorrow } = require('../../../db/sql/church/borrow');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

// POST /church/borrow/clear/:user_id   { id }   remove an answered request from either side's list
router.post('/:user_id', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Choose a request.' });
    await db.promise().query(clearBorrow, [req.user.id, req.user.id, id, req.user.id, req.user.id]);
    return res.json({ message: 'Cleared.' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
