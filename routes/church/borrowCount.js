const express = require('express');
const { church: db } = require('../../db/db');
const { expireStale, countIncomingPending } = require('../../db/sql/church/borrow');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

// GET /church/borrow-count/:user_id  ->  { pending, books, movies }   requests waiting for MY answer (nav badge)
router.get('/:user_id', async (req, res) => {
  try {
    await db.promise().query(expireStale, [req.user.id, req.user.id]);
    const [rows] = await db.promise().query(countIncomingPending, [req.user.id]);
    const n = (k) => Number((rows.find((r) => r.kind === k) || {}).n) || 0;
    return res.json({ pending: n('book') + n('movie'), books: n('book'), movies: n('movie') });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
