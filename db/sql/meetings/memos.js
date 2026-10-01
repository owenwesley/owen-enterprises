// ── Memos table ────────────────────────────────────────────────────────────────
// Stores memo options for the meetings memo dropdown.
// NOTE: the old copyMemosTable (DROP the live table, rebuild it from a temp
// table that didn't even carry the id column) has been removed outright
// rather than kept as dead code — same bug class as medications/nutritions.
// It was appended to updateMemo and deleteMemo below, so every single memo
// edit or delete reassigned fresh auto-increment ids to EVERY memo row for
// EVERY user (reordered by name, user_id), not just the row being touched.
// deleteAllMemos, which also called it, was never referenced by
// routes/meetings/memos.js and has been dropped as unused dead code too. If
// a table ever genuinely needs a full physical rewrite again, use the safe
// temp-table-swap pattern in db/maintenance/rebuildTable.js instead — it
// preserves every row's id via an atomic RENAME TABLE swap.

const insertMemo  = `INSERT INTO memos (user_id, name) VALUES (?, ?)`;
const selectMemos = `SELECT * FROM memos`;

// Plain single-statement UPDATE/DELETE, scoped by id AND user_id.
const updateMemo = `UPDATE memos SET name=? WHERE id=? AND user_id=?`;
const deleteMemo = `DELETE FROM memos WHERE id=? AND user_id=?`;

module.exports = {
  insertMemo,
  selectMemos,
  updateMemo,
  deleteMemo,
};
