const express = require('express');
const { church: db, communitylibrary: library } = require('../../../db/db');
const { selectLibrarySharers } = require('../../../db/sql/church/members');
const { selectBookForBorrow, selectMovieForBorrow } = require('../../../db/sql/church/library');
const {
  BORROW_COOLDOWN_DAYS, insertBorrow, selectPendingDuplicate, selectRecentDecline, countPendingByRequester, purgeBorrow,
} = require('../../../db/sql/church/borrow');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

const BORROW_NOTE_MAX = 300;
const BORROW_PENDING_MAX = 20;

// POST /church/borrow/request/:user_id   { kind: 'book'|'movie', ref, note? }
router.post('/:user_id', async (req, res) => {
  try {
    const { kind, ref } = req.body || {};
    const note = String((req.body || {}).note || '').trim().slice(0, BORROW_NOTE_MAX);
    if (!['book', 'movie'].includes(kind) || !Number.isInteger(ref)) return res.status(400).json({ error: 'Choose a book or movie.' });
    const [sharers] = await db.promise().query(selectLibrarySharers, [req.user.id, req.user.id]);
    const ids = [...new Set(sharers.map((r) => r.user_id))];
    if (!ids.length) return res.status(404).json({ error: 'That item is not shared with you.' });
    const [rows] = await library.promise().query(kind === 'book' ? selectBookForBorrow : selectMovieForBorrow, [ref, ids]);
    const item = rows[0];
    if (!item) return res.status(404).json({ error: 'That item is not shared with you.' });
    if (item.io !== 1 || item.lost) return res.status(409).json({ error: 'That item is out right now.' });
    const [dup] = await db.promise().query(selectPendingDuplicate, [req.user.id, item.user_id, kind, item.id]);
    if (dup.length) return res.status(409).json({ error: 'You already asked for this one.' });
    const [declined] = await db.promise().query(selectRecentDecline, [req.user.id, item.user_id, kind, item.id]);
    if (declined.length) return res.status(429).json({ error: `The owner said no to this one recently. You can ask again after ${BORROW_COOLDOWN_DAYS} days.` });
    db.promise().query(purgeBorrow).catch(() => { /* housekeeping only */ });
    const [[cnt]] = await db.promise().query(countPendingByRequester, [req.user.id]);
    if (cnt.n >= BORROW_PENDING_MAX) return res.status(429).json({ error: 'You have too many open requests. Cancel some first.' });
    await db.promise().query(insertBorrow, [item.user_id, req.user.id, kind, item.id, item.title, note]);
    return res.status(201).json({ message: 'Request sent.' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
