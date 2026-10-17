const express = require('express');
const { church: db, communitylibrary: library } = require('../../../db/db');
const { selectLibrarySharers } = require('../../../db/sql/church/members');
const { selectMovieForBorrow, reserveBook, reserveMovieSql } = require('../../../db/sql/church/library');
const { selectOwnPending, answerBorrow, declineOthersForItem } = require('../../../db/sql/church/borrow');
const { serverError } = require('../../../utils/serverError');
const { displayNames } = require('../_helpers');
const router = express.Router();

// POST /church/borrow/answer/:user_id   { id, accept }   the owner answers a pending request
// A Yes does real work (1.11.28): it checks the asker is still in a church that shares with the owner,
// then marks the item Out to the asker in one guarded statement (so two Yes answers can never both
// win) and closes every other open request for the same item. A No just records the answer.
router.post('/:user_id', async (req, res) => {
  try {
    const { id, accept } = req.body || {};
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Choose a request.' });
    const [[row]] = await db.promise().query(selectOwnPending, [id, req.user.id]);
    if (!row) return res.status(404).json({ error: 'Request not found.' });
    if (!accept) {
      const [r] = await db.promise().query(answerBorrow, ['declined', 0, id, req.user.id]);
      if (!r.affectedRows) return res.status(404).json({ error: 'Request not found.' });
      return res.json({ message: 'Declined.' });
    }
    // Same visibility rule as asking: seen from the asker, the owner must still be a sharing member.
    const [sharers] = await db.promise().query(selectLibrarySharers, [row.requester_id, row.requester_id]);
    if (!sharers.some((x) => x.user_id === req.user.id)) {
      await db.promise().query(answerBorrow, ['declined', 1, id, req.user.id]);
      return res.status(409).json({ error: 'That person is no longer in a church that shares with you, so the request was closed.' });
    }
    // Claim the request first, then the item; if the item is gone, close the request again.
    const [claim] = await db.promise().query(answerBorrow, ['accepted', 0, id, req.user.id]);
    if (!claim.affectedRows) return res.status(404).json({ error: 'Request not found.' });
    const names = await displayNames([row.requester_id]);
    const who = names.get(row.requester_id) || 'A church member';
    let reserved = 0;
    if (row.kind === 'book') {
      [{ affectedRows: reserved }] = await library.promise().query(reserveBook, [who, row.item_id, req.user.id]);
    } else {
      const [mrows] = await library.promise().query(selectMovieForBorrow, [row.item_id, [req.user.id]]);
      if (mrows[0]) {
        const { sql, slots } = reserveMovieSql(mrows[0].numMovie);
        [{ affectedRows: reserved }] = await library.promise().query(sql, [who, ...Array(slots).fill(who), row.item_id, req.user.id]);
      }
    }
    if (!reserved) {
      await db.promise().query(
        "UPDATE borrow_requests SET status='declined', auto=1, answeredAt=NOW() WHERE id=? AND user_id=?", [id, req.user.id]);
      return res.status(409).json({ error: 'That item is not available any more (it is out, lost or removed), so the request was closed.' });
    }
    await db.promise().query(declineOthersForItem, [req.user.id, row.kind, row.item_id, id]);
    return res.json({ message: `Accepted. "${row.title}" is now marked Out to ${who}.`, markedOut: true });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
