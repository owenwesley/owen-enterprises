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
// (the 90-row cap is now trimWeights, run by the add route),
// but it never existed here, so every weights delete threw
// "Cannot read properties of undefined (reading 'length')" before this fix.
const deleteWeightById = `DELETE FROM weights WHERE id=? AND user_id=?`;

// Keep only the newest 90 weights for a user (newest = latest date, then id).
// Params: user_id, user_id. Run after every add, so the cap is enforced on
// the server and does not depend on the browser (the old client-side trim
// removed just one row, so a table already at 91 stayed at 91).
const trimWeights =
  `DELETE FROM weights WHERE user_id=? AND id NOT IN (
     SELECT id FROM (
       SELECT id FROM weights WHERE user_id=? ORDER BY date DESC, id DESC LIMIT 90
     ) AS keep)`;

const selectWeights =
  `SELECT id,user_id,date,kg,lbs,bmi FROM weights`;
  
const updateWeight =
  `UPDATE weights SET date=?,kg=?,lbs=?,bmi=?
   WHERE id=? AND user_id=?;`;

module.exports = {
  deleteWeightById,
  insertWeights,
  selectWeights,
  trimWeights,
  updateWeight
};
