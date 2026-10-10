// ── borrow_requests table (database `church`) ──────────────────────────────────
// user_id      = the person who owns the book / movie (receives the request)
// requester_id = the person asking to borrow it
// Both are plain numbers (users live in another database). `title` is a snapshot so the request
// still reads correctly if the owner renames or removes the item.
// Since 1.11.28: answeredAt (when it was answered / cancelled), auto (1 = declined by the system
// because someone else got the item or the asker left, so it does not count as a "No" for the
// cooldown), hideOwner / hideRequester ("Clear" hides a row from that side only; the row is kept
// for a while so the cooldown after a No cannot be dodged by clearing it).
const BORROW_COOLDOWN_DAYS = 7;
// 1.11.29: a request nobody answered for this long is closed as 'expired' (auto=1, so it is never a "No"
// and never blocks asking again). Override with BORROW_EXPIRE_DAYS in .env.
const BORROW_EXPIRE_DAYS = Math.max(1, parseInt(process.env.BORROW_EXPIRE_DAYS, 10) || 21);

const insertBorrow =
  `INSERT INTO borrow_requests (user_id, requester_id, kind, item_id, title, note) VALUES (?, ?, ?, ?, ?, ?)`;
// One open request per asker per item (matched on the item's row id, not its title).
const selectPendingDuplicate =
  `SELECT id FROM borrow_requests WHERE requester_id=? AND user_id=? AND kind=? AND item_id=? AND status='pending' LIMIT 1`;
// A real "No" from the owner in the last N days blocks asking for the same item again.
const selectRecentDecline =
  `SELECT id FROM borrow_requests WHERE requester_id=? AND user_id=? AND kind=? AND item_id=?
      AND status='declined' AND auto=0 AND answeredAt > (NOW() - INTERVAL ${BORROW_COOLDOWN_DAYS} DAY) LIMIT 1`;
const countPendingByRequester =
  `SELECT COUNT(*) AS n FROM borrow_requests WHERE requester_id=? AND status='pending'`;
// Requests TO me (newest first, max 100) and requests I MADE (max 100). Cleared rows stay hidden.
const selectIncoming =
  `SELECT id, requester_id, kind, title, note, status, auto, createdAt FROM borrow_requests
    WHERE user_id=? AND hideOwner=0 AND status IN ('pending','accepted','declined') ORDER BY (status='pending') DESC, createdAt DESC, id DESC LIMIT 100`;
const selectOutgoing =
  `SELECT id, user_id, kind, title, status, auto, createdAt FROM borrow_requests
    WHERE requester_id=? AND hideRequester=0 AND status IN ('pending','accepted','declined','expired') ORDER BY createdAt DESC, id DESC LIMIT 100`;
// Close stale pending requests that involve this person (as owner or asker). Run from the list and badge routes.
const expireStale =
  `UPDATE borrow_requests SET status='expired', auto=1, answeredAt=NOW()
    WHERE (user_id=? OR requester_id=?) AND status='pending' AND createdAt < (NOW() - INTERVAL ${BORROW_EXPIRE_DAYS} DAY)`;
// How many requests are waiting for this owner's answer (the nav badge).
const countIncomingPending =
  `SELECT kind, COUNT(*) AS n FROM borrow_requests WHERE user_id=? AND hideOwner=0 AND status='pending' GROUP BY kind`;
// The pending request the signed-in owner is about to answer.
const selectOwnPending =
  `SELECT id, user_id, requester_id, kind, item_id, title FROM borrow_requests WHERE id=? AND user_id=? AND status='pending'`;
// Claim / close a request. Guarded by status='pending', so two clicks (or two tabs) cannot both win.
const answerBorrow =
  `UPDATE borrow_requests SET status=?, auto=?, answeredAt=NOW() WHERE id=? AND user_id=? AND status='pending'`;
// After a Yes: every other open request for the same item is closed as a system decline.
const declineOthersForItem =
  `UPDATE borrow_requests SET status='declined', auto=1, answeredAt=NOW()
    WHERE user_id=? AND kind=? AND item_id=? AND status='pending' AND id<>?`;
const cancelBorrow =
  `UPDATE borrow_requests SET status='cancelled', answeredAt=NOW() WHERE id=? AND requester_id=? AND status='pending'`;
// "Clear" hides an answered request from the clearing side only.
const clearBorrow =
  `UPDATE borrow_requests SET hideOwner=IF(user_id=?,1,hideOwner), hideRequester=IF(requester_id=?,1,hideRequester)
    WHERE id=? AND (user_id=? OR requester_id=?) AND status<>'pending'`;
// Housekeeping, run now and then from the request route: rows hidden by both sides, once the cooldown
// is over, and any closed row older than 30 days.
const purgeBorrow =
  `DELETE FROM borrow_requests WHERE status<>'pending' AND (
      (hideOwner=1 AND hideRequester=1 AND answeredAt < (NOW() - INTERVAL ${BORROW_COOLDOWN_DAYS} DAY))
      OR answeredAt < (NOW() - INTERVAL 30 DAY))`;

module.exports = {
  BORROW_COOLDOWN_DAYS, BORROW_EXPIRE_DAYS, expireStale, countIncomingPending,
  insertBorrow, selectPendingDuplicate, selectRecentDecline, countPendingByRequester, selectIncoming, selectOutgoing,
  selectOwnPending, answerBorrow, declineOthersForItem, cancelBorrow, clearBorrow, purgeBorrow,
};
