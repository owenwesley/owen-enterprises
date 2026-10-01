// NOTE: the old copyWeightsTable/deleteAllWeights/deleteWeights triplet that
// used to live here (DROP the live table, rebuild it from a temp table that
// didn't even carry the id column, so ids reshuffled for EVERY user on
// every add/delete) has been removed outright rather than kept as dead
// code — same bug class as medications/nutritions. None of the three was
// referenced by any route (routes/bgtracker/weights/ only has add.js,
// edit.js and delete.js — the last uses deleteWeightById below, and there's
// no deleteAll route for weights), so all three were unused as well as
// dangerous. If a table ever genuinely needs a full physical rewrite again,
// use the safe temp-table-swap pattern in db/maintenance/rebuildTable.js
// instead — it preserves every row's id via an atomic RENAME TABLE swap.
const insertWeights =
  `INSERT INTO weights (user_id,date,kg,lbs,bmi) VALUES (
    ?,?,?,?,?)`;

// Targeted delete by row id — routes/bgtracker/weights/delete.js imports this
// (and useWeights.js's 90-row auto-trim calls the delete route internally),
// but it never existed here, so every weights delete threw
// "Cannot read properties of undefined (reading 'length')" before this fix.
const deleteWeightById = `DELETE FROM weights WHERE id=? AND user_id=?`;

const selectWeights =
  `SELECT id,user_id,date,kg,lbs,bmi FROM weights`;
  
const updateWeight =
  `UPDATE weights SET date=?,kg=?,lbs=?,bmi=?
   WHERE id=? AND user_id=?;`;

module.exports = {
  deleteWeightById,
  insertWeights,
  selectWeights,
  updateWeight
};
