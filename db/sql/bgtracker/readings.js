// This constant is not called anywhere itself — db/init.js and db/db.js own
// actual table creation/bootstrap, same as every other bgtracker table — but
// as of this tightening, this one (like nutritions' createNutritionsTbl) is
// now kept in sync on purpose: all three definitions (here, db/init.js,
// db/db.js) use the same NOT NULL, no-DEFAULT column types, and `date` is
// TEXT rather than VARCHAR(20). If you change one, change all three, or
// they'll drift apart. (The other tables' unused create*Tbl reference constants
// were deleted outright in 1.10.3; these two remain because their three
// definitions are deliberately kept identical.)
const createReadingsTbl = `
  CREATE TABLE readings(
    id int not null auto_increment,
    user_id int not null,
    date text not null,
    sugarB int not null,
    carbsB int not null,
    insulinSB int not null,
    insulinFB int not null,
    chkMedsB tinyint not null,
    sugarL int not null,
    carbsL int not null,
    insulinL int not null,
    chkMedsL tinyint not null,
    sugarD int not null,
    carbsD int not null,
    insulinD int not null,
    chkMedsD tinyint not null,
    sugarBB int not null,
    carbsBB int not null,
    insulinBB int not null,
    sugarBed int not null,
    carbsBed int not null,
    insulinSBed int not null,
    insulinFBed int not null,
    chkMedsBed tinyint not null,
    primary key (id));
`;

// NOTE: the old copyReadingsTable/deleteReadings triplet that used to live
// here (DROP the live table, rebuild it from a temp table that didn't even
// carry the id column, so ids reshuffled for EVERY user on every add/delete)
// has been removed outright rather than kept as dead code — same bug class
// as medications/nutritions. `deleteReadings` (delete-oldest-row-by-user)
// was unused — routes/bgtracker/readings/delete.js uses deleteReadingById
// instead. deleteAllReadings *was* wired into routes/bgtracker/readings/
// deleteAll.js, but only for its DELETE half; it's rewritten below as a
// plain single-statement delete-all scoped to one user, instead of also
// running the whole-table rebuild afterward. If a table ever genuinely
// needs a full physical rewrite again, use the safe temp-table-swap pattern
// in db/maintenance/rebuildTable.js instead — it preserves every row's id
// via an atomic RENAME TABLE swap.
const deleteAllReadings = `DELETE FROM readings WHERE user_id=?`;

// insulinB and insulinBed were retired: a single-type dose at Breakfast or
// Bedtime now lives in insulinSB / insulinSBed (see buildColumns.js on the
// client), the same column two-type mode uses for the "Slow" dose — one
// canonical field per slot regardless of mode, instead of a 3rd field that
// duplicated insulinFB / insulinFBed's meaning. db/migrateInsulinColumns.js
// moves any historical insulinB/insulinBed data into insulinSB/insulinSBed
// and drops the old columns on existing databases; new databases never get
// them (see db/init.js and db/db.js).
const insertReadings =
  `INSERT INTO readings (user_id,date,sugarB,carbsB,
    insulinSB,insulinFB,chkMedsB,sugarL,carbsL,insulinL,chkMedsL,sugarD,
    carbsD,insulinD,chkMedsD,sugarBB,carbsBB,insulinBB,sugarBed,carbsBed,
    insulinSBed,insulinFBed,chkMedsBed) VALUES (
    ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

const selectReadings =
  `SELECT id,user_id,date,sugarB,carbsB,insulinSB,insulinFB,
    IF(chkMedsB, 'true','false') AS chkMedsB_text, chkMedsB,sugarL,carbsL,insulinL,
    IF(chkMedsL, 'true','false') AS chkMedsL_text, chkMedsL,sugarD,carbsD,insulinD,
    IF(chkMedsD, 'true','false') AS chkMedsD_text, chkMedsD,sugarBB,carbsBB,insulinBB,
    sugarBed,carbsBed,insulinSBed,insulinFBed,
    IF(chkMedsBed, 'true','false') AS chkMedsBed_text, chkMedsBed FROM readings`;

const updateReading =
  `UPDATE readings SET date=?,sugarB=?,carbsB=?,insulinSB=?,
   insulinFB=?,chkMedsB=?,sugarL=?,carbsL=?,insulinL=?,chkMedsL=?,
   sugarD=?,carbsD=?,insulinD=?,chkMedsD=?,sugarBB=?,carbsBB=?,
   insulinBB=?,sugarBed=?,carbsBed=?,insulinSBed=?,
   insulinFBed=?,chkMedsBed=? WHERE id=? AND user_id=?;`;

// Targeted delete by row id — routes/bgtracker/readings/delete.js and
// deleteByYear.js both imported these but neither existed here, so both
// routes threw "Cannot read properties of undefined (reading 'length')"
// before this fix.
const deleteReadingById = `DELETE FROM readings WHERE id=? AND user_id=?`;
const deleteReadingsByYear = `DELETE FROM readings WHERE user_id=? AND date LIKE ?`;

module.exports = {
  createReadingsTbl,
  deleteAllReadings,
  deleteReadingById,
  deleteReadingsByYear,
  insertReadings,
  selectReadings,
  updateReading
};
