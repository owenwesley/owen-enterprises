const express = require('express');
const { church: db } = require('../../../db/db');
const { cancelBorrow } = require('../../../db/sql/church/borrow');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

// POST /church/borrow/cancel/:user_id   { id }   the asker withdraws their own pending request
router.post('/:user_id', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Choose a request.' });
    const [r] = await db.promise().query(cancelBorrow, [id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Request not found.' });
    return res.json({ message: 'Cancelled.' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
