// ── borrow_requests table (database `church`) ──────────────────────────────────
// user_id      = the person who owns the book / movie (receives the request)
// requester_id = the person asking to borrow it
// Both are plain numbers (users live in another database). `title` is a snapshot so the request
// still reads correctly if the owner renames or removes the item.
const insertBorrow =
  `INSERT INTO borrow_requests (user_id, requester_id, kind, item_id, title, note) VALUES (?, ?, ?, ?, ?, ?)`;
const selectPendingDuplicate =
  `SELECT id FROM borrow_requests WHERE requester_id=? AND user_id=? AND kind=? AND title=? AND status='pending' LIMIT 1`;
const countPendingByRequester =
  `SELECT COUNT(*) AS n FROM borrow_requests WHERE requester_id=? AND status='pending'`;
// Requests TO me (newest first, max 100) and requests I MADE (max 100).
const selectIncoming =
  `SELECT id, requester_id, kind, title, note, status, createdAt FROM borrow_requests
    WHERE user_id=? AND status IN ('pending','accepted','declined') ORDER BY (status='pending') DESC, createdAt DESC, id DESC LIMIT 100`;
const selectOutgoing =
  `SELECT id, user_id, kind, title, status, createdAt FROM borrow_requests
    WHERE requester_id=? AND status IN ('pending','accepted','declined') ORDER BY createdAt DESC, id DESC LIMIT 100`;
// The owner answers a pending request addressed to them; the asker may cancel their own pending one.
const answerBorrow =
  `UPDATE borrow_requests SET status=? WHERE id=? AND user_id=? AND status='pending'`;
const cancelBorrow =
  `UPDATE borrow_requests SET status='cancelled' WHERE id=? AND requester_id=? AND status='pending'`;
// Clear an answered request off the list (either side).
const clearBorrow =
  `DELETE FROM borrow_requests WHERE id=? AND (user_id=? OR requester_id=?) AND status<>'pending'`;

module.exports = {
  insertBorrow, selectPendingDuplicate, countPendingByRequester, selectIncoming, selectOutgoing,
  answerBorrow, cancelBorrow, clearBorrow,
};
