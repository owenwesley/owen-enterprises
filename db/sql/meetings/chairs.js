// ── Chairs table ───────────────────────────────────────────────────────────────
// Stores chair/co-chair names for the meetings dropdowns.
// NOTE: the old copyChairsTable (DROP the live table, rebuild it from a temp
// table that didn't even carry the id column) has been removed outright
// rather than kept as dead code — same bug class as medications/nutritions.
// It was appended to updateChair and deleteChair below, so every single
// chair edit or delete reassigned fresh auto-increment ids to EVERY chair
// row for EVERY user (reordered by name, user_id), not just the row being
// touched. deleteAllChairs, which also called it, was never referenced by
// routes/meetings/chairs.js and has been dropped as unused dead code too.
// If a table ever genuinely needs a full physical rewrite again, use the
// safe temp-table-swap pattern in db/maintenance/rebuildTable.js instead —
// it preserves every row's id via an atomic RENAME TABLE swap.

const insertChair  = `INSERT INTO chairs (user_id, name) VALUES (?, ?)`;
const selectChairs = `SELECT * FROM chairs`;

// Plain single-statement UPDATE/DELETE, scoped by id AND user_id.
const updateChair = `UPDATE chairs SET name=? WHERE id=? AND user_id=?`;
const deleteChair = `DELETE FROM chairs WHERE id=? AND user_id=?`;

module.exports = {
  insertChair,
  selectChairs,
  updateChair,
  deleteChair,
};
