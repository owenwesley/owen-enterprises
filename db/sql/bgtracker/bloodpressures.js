// NOTE: the old copyBloodpressuresTable/deleteBloodpressure/
// deleteAllBloodpressures triplet that used to live here (DROP the live
// table, rebuild it from a temp table that didn't even carry the id column,
// so ids reshuffled for EVERY user on every add/delete) has been removed
// outright rather than kept as dead code — same bug class as
// medications/nutritions. Neither deleteBloodpressure nor
// deleteAllBloodpressures was referenced by any route — delete.js does its
// own targeted `DELETE ... WHERE id=? AND user_id=?` inline, and deleteAll.js
// uses deleteAllBloodpressuresByUser below — so both were unused as well as
// dangerous. If a table ever genuinely needs a full physical rewrite again,
// use the safe temp-table-swap pattern in db/maintenance/rebuildTable.js
// instead — it preserves every row's id via an atomic RENAME TABLE swap.

// Plain single-statement INSERT/UPDATE. These used to append
// copyBloodpressuresTable, which DROPs and recreates the whole table — the
// temp table has no id column, so every add or edit reassigned fresh
// auto-increment ids to EVERY row for EVERY user, not just the row being
// touched. Row order is already guaranteed by the SELECT ... ORDER BY date,
// id in the GET routes.
const insertBloodpressure =
  `INSERT INTO bloodpressures (user_id,date,hbp,lbp,hr,hbp2,lbp2,hr2)
     VALUES (?,?,?,?,?,?,?,?)`;

const selectBloodPressures = 'SELECT * FROM bloodpressures';

// Plain single-statement delete-all, scoped to one user.
// routes/bgtracker/bloodpressures/deleteAll.js uses this.
const deleteAllBloodpressuresByUser = `DELETE FROM bloodpressures WHERE user_id=?`;

const updateBP =
  `UPDATE bloodpressures SET date=?,hbp=?,lbp=?,hr=?,hbp2=?,lbp2=?,
   hr2=? WHERE id=? AND user_id=?`;

module.exports = {
  deleteAllBloodpressuresByUser,
  insertBloodpressure,
  selectBloodPressures,
  updateBP
};
