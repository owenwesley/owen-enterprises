// NOTE: the old copyPrefereceTable (DROP the live table, rebuild it from a
// temp table that didn't even carry the id column — the same bug class as
// medications/nutritions/bloodpressures/etc.) has been removed outright
// rather than kept as dead code. Unlike those other tables, none of the
// queries in this file ever actually called it — deletePreference,
// insertPreference and updatePreference below were already plain,
// single-statement, id/user_id-scoped queries — so this table was never hit
// by the reshuffling bug in practice. The export was still a live landmine
// though: anything wiring it in later would reintroduce the exact bug this
// session is cleaning up elsewhere, so it's removed rather than left
// importable. If a table ever genuinely needs a full physical rewrite
// again, use the safe temp-table-swap pattern in
// db/maintenance/rebuildTable.js instead — it preserves every row's id via
// an atomic RENAME TABLE swap.
const deletePreference = `DELETE FROM preferences WHERE id=? AND user_id=? ORDER BY id LIMIT 1;`;

const insertPreference =
  `INSERT INTO preferences (
    user_id,timesPD,chkNutrition,chkWeight,height,chkMeds,chkMedsB,
    chkMedsL,chkMedsD,chkMedsBed,chkInsulin,typInsulin,
    chkBP,chkSlidingScale,slidingScale1,slidingScale2a,
    slidingScale2b,slidingScale3a,slidingScale3b,slidingScale4a,
    slidingScale4b, slidingScale5,carbRatio,calorieGoal)
     values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

const selectPreferences =
  `SELECT id, user_id, timesPD,
    IF(chkNutrition, 'true','false') AS chkNutrition_text, chkNutrition,
    IF(chkWeight, 'true','false') AS chkWeight_text, chkWeight, height,
    IF(chkMeds, 'true','false') AS chkMeds_text, chkMeds, 
    IF(chkMedsB, 'true','false') AS chkMedsB_text, chkMedsB, 
    IF(chkMedsL, 'true','false') AS chkMedsL_text, chkMedsL, 
    IF(chkMedsD, 'true','false') AS chkMedsD_text, chkMedsD, 
    IF(chkMedsBed, 'true','false') AS chkMedsBed_text, chkMedsBed, 
    IF(chkInsulin, 'true','false') AS chkInsulin_text, chkInsulin, 
    typInsulin,IF(chkBP, 'true','false') AS chkBP_text, chkBP, 
    IF(chkSlidingScale, 'true','false') AS chkSlidingScale_text, chkSlidingScale, 
    slidingScale1, slidingScale2a, slidingScale2b, slidingScale3a, 
    slidingScale3b, slidingScale4a, slidingScale4b, slidingScale5, 
    carbRatio, calorieGoal FROM preferences`;

const updatePreference =
  `UPDATE preferences SET timesPD=?,chkNutrition=?,chkWeight=?,
  height=?,chkMeds=?,chkMedsB=?,chkMedsL=?,chkMedsD=?,chkMedsBed=?,
  chkInsulin=?,typInsulin=?,chkBP=?,chkSlidingScale=?,slidingScale1=?,
  slidingScale2a=?,slidingScale2b=?,slidingScale3a=?,slidingScale3b=?,
  slidingScale4a=?,slidingScale4b=?,slidingScale5=?,carbRatio=?,calorieGoal=?
   WHERE id=? AND user_id=?;`;

module.exports = {
  deletePreference,
  insertPreference,
  selectPreferences,
  updatePreference
};
