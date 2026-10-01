// This constant is not called anywhere itself — db/init.js and db/db.js own
// actual table creation/bootstrap — but it is kept in sync on purpose: all
// three definitions (here, db/init.js, db/db.js) use the same NOT NULL,
// no-DEFAULT column types. If you change one, change all three. (Every other
// table's unused create*Tbl reference constant was deleted in 1.10.3, so
// nutritions and readings are the only two that remain.)
const createNutritionsTbl =
  `CREATE TABLE IF NOT EXISTS nutritions(
        id int not null auto_increment,
        user_id int not null,
        date text not null,
        foodNameB text not null,
        caloriesB int not null,
        saturatedB double not null,
        transB double not null,
        polyunsaturatedB double not null,
        monosaturatedB double not null,
        cholesterolB int not null,
        sodiumB int not null,
        carbsB int not null,
        fiberB int not null,
        sugarsB double not null,
        proteinB double not null,
        vitaminAB int not null,
        vitaminCB int not null,
        vitaminDB int not null,
        calciumB int not null,
        ironB double not null,
        potassiumB int not null,
        foodNameL text not null,
        caloriesL int not null,
        saturatedL double not null,
        transL double not null,
        polyunsaturatedL double not null,
        monosaturatedL double not null,
        cholesterolL int not null,
        sodiumL int not null,
        carbsL int not null,
        fiberL int not null,
        sugarsL double not null,
        proteinL double not null,
        vitaminAL int not null,
        vitaminCL int not null,
        vitaminDL int not null,
        calciumL int not null,
        ironL double not null,
        potassiumL int not null,
        foodNameD text not null,
        caloriesD int not null,
        saturatedD double not null,
        transD double not null,
        polyunsaturatedD double not null,
        monosaturatedD double not null,
        cholesterolD int not null,
        sodiumD int not null,
        carbsD int not null,
        fiberD int not null,
        sugarsD double not null,
        proteinD double not null,
        vitaminAD int not null,
        vitaminCD int not null,
        vitaminDD int not null,
        calciumD int not null,
        ironD double not null,
        potassiumD int not null,
        foodNameBB text not null,
        caloriesBB int not null,
        saturatedBB double not null,
        transBB double not null,
        polyunsaturatedBB double not null,
        monosaturatedBB double not null,
        cholesterolBB int not null,
        sodiumBB int not null,
        carbsBB int not null,
        fiberBB int not null,
        sugarsBB double not null,
        proteinBB double not null,
        vitaminABB int not null,
        vitaminCBB int not null,
        vitaminDBB int not null,
        calciumBB int not null,
        ironBB double not null,
        potassiumBB int not null,
        foodNameBed text not null,
        caloriesBed int not null,
        saturatedBed double not null,
        transBed double not null,
        polyunsaturatedBed double not null,
        monosaturatedBed double not null,
        cholesterolBed int not null,
        sodiumBed int not null,
        carbsBed int not null,
        fiberBed int not null,
        sugarsBed double not null,
        proteinBed double not null,
        vitaminABed int not null,
        vitaminCBed int not null,
        vitaminDBed int not null,
        calciumBed int not null,
        ironBed double not null,
        potassiumBed int not null,
        primary key (id));`;

// NOTE: the old copyNutritionsTable/deleteNutrition/deleteAllNutritions/
// deleteNutritionById triplet that used to live here (DROP the live table,
// rebuild it from a temp table that didn't even carry the id column, so ids
// reshuffled for EVERY user on every single delete) has been removed
// outright rather than kept as dead code — same bug class as the old
// medications rebuild, just with a wider table. If a table ever genuinely
// needs a full physical rewrite again (e.g. a real column-type change ALTER
// TABLE can't do in place), use the safe temp-table-swap pattern in
// db/maintenance/rebuildTable.js instead: it preserves every row's id via an
// atomic RENAME TABLE swap, so the live `nutritions` name is never briefly
// missing the way DROP+CREATE left it. It's a standalone, manually-run
// utility — nothing here calls it, and none of the fixes below need it.

// Plain single-statement deletes, scoped to one user. These used to append
// copyNutritionsTable, which DROPs and recreates the whole table on every
// delete — the temp table has no id column, so every delete reassigned
// fresh auto-increment ids to EVERY nutrition row for EVERY user (reordered
// by date, user_id), not just the row(s) being touched. Any id a client had
// captured (e.g. mid-edit) could silently start pointing at a different
// row after any other user's delete landed. Row order is already
// guaranteed by the SELECT in the GET route, so no reordering is needed.
const deleteAllNutritions = `DELETE FROM nutritions WHERE user_id=?`;

// delete a specific nutrition entry by id and user
const deleteNutritionById = `DELETE FROM nutritions WHERE id=? AND user_id=?`;

const insertNutritions =
  `INSERT INTO nutritions (user_id,date,
    foodNameB,caloriesB,saturatedB,transB,polyunsaturatedB,monosaturatedB,
    cholesterolB,sodiumB,carbsB,fiberB,sugarsB,proteinB,vitaminAB,vitaminCB,
    vitaminDB,calciumB,ironB,potassiumB,foodNameL,caloriesL,saturatedL,
    transL,polyunsaturatedL,monosaturatedL,cholesterolL,sodiumL,carbsL,
    fiberL,sugarsL,proteinL,vitaminAL,vitaminCL,vitaminDL,calciumL,ironL,
    potassiumL,foodNameD,caloriesD,saturatedD,transD,polyunsaturatedD,
    monosaturatedD,cholesterolD,sodiumD,carbsD,fiberD,sugarsD,proteinD,
    vitaminAD,vitaminCD,vitaminDD,calciumD,ironD,potassiumD,foodNameBB,
    caloriesBB,saturatedBB,transBB,polyunsaturatedBB,monosaturatedBB,
    cholesterolBB,sodiumBB,carbsBB,fiberBB,sugarsBB,proteinBB,vitaminABB,
    vitaminCBB,vitaminDBB,calciumBB,ironBB,potassiumBB,foodNameBed,
    caloriesBed,saturatedBed,transBed,polyunsaturatedBed,monosaturatedBed,
    cholesterolBed,sodiumBed,carbsBed,fiberBed,sugarsBed,proteinBed,
    vitaminABed,vitaminCBed,vitaminDBed,calciumBed,ironBed,potassiumBed)
    VALUES (${Array(92).fill('?').join(',')});`;

const selectNutritions = 'SELECT * FROM nutritions';

const updateNutrition =
  `UPDATE nutritions SET date=?,foodNameB=?,
  caloriesB=?,saturatedB=?,transB=?,polyunsaturatedB=?,
  monosaturatedB=?,cholesterolB=?,sodiumB=?,carbsB=?,
  fiberB=?,sugarsB=?,proteinB=?,vitaminAB=?,
  vitaminCB=?,vitaminDB=?,calciumB=?,ironB=?,
  potassiumB=?,foodNameL=?,caloriesL=?,saturatedL=?,
  transL=?,polyunsaturatedL=?,monosaturatedL=?,
  cholesterolL=?,sodiumL=?,carbsL=?,fiberL=?,
  sugarsL=?,proteinL=?,vitaminAL=?,vitaminCL=?,
  vitaminDL=?,calciumL=?,ironL=?,potassiumL=?,
  foodNameD=?,caloriesD=?,saturatedD=?,transD=?,
  polyunsaturatedD=?,monosaturatedD=?,cholesterolD=?,
  sodiumD=?,carbsD=?,fiberD=?,sugarsD=?,proteinD=?,
  vitaminAD=?,vitaminCD=?,vitaminDD=?,calciumD=?,
  ironD=?,potassiumD=?,foodNameBB=?,caloriesBB=?,
  saturatedBB=?,transBB=?,polyunsaturatedBB=?,
  monosaturatedBB=?,cholesterolBB=?,sodiumBB=?,carbsBB=?,
  fiberBB=?,sugarsBB=?,proteinBB=?,vitaminABB=?,
  vitaminCBB=?,vitaminDBB=?,calciumBB=?,ironBB=?,
  potassiumBB=?,foodNameBed=?,caloriesBed=?,
  saturatedBed=?,transBed=?,polyunsaturatedBed=?,
  monosaturatedBed=?,cholesterolBed=?,sodiumBed=?,
  carbsBed=?,fiberBed=?,sugarsBed=?,proteinBed=?,
  vitaminABed=?,vitaminCBed=?,vitaminDBed=?,calciumBed=?,
  ironBed=?,potassiumBed=? WHERE id=? AND user_id=?;`;

module.exports = {
  createNutritionsTbl,
  deleteAllNutritions,
  insertNutritions,
  deleteNutritionById,
  selectNutritions,
  updateNutrition
};


