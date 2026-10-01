// NOTE: the old copyMeetingsTable/deleteAllMeetings/deleteMeetingsByUserID
// triplet that used to live here (DROP the live table, rebuild it from a
// temp table that didn't even carry the id column, so ids reshuffled for
// EVERY user on every add/delete) has been removed outright rather than
// kept as dead code — same bug class as medications/nutritions. None of the
// three was referenced by routes/meetings/meetings.js, which uses
// insertMeeting, selectMeetings, updateMeeting and deleteMeetingById below,
// so all three were unused as well as dangerous. If a table ever genuinely
// needs a full physical rewrite again, use the safe temp-table-swap pattern
// in db/maintenance/rebuildTable.js instead — it preserves every row's id
// via an atomic RENAME TABLE swap.

const insertMeeting = `INSERT INTO meetings (user_id,date,chair,coChair,newComer,
      day30,day60,day90,month6,month9,month12,month18,multiyr,
      gc1,gc2,gc3,gc4,gc5,gc6,gc7,gc8,gc9,gc10,attendance,memo,deposit)
       values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`;

const selectMeetings = `SELECT * from meetings`;

// Previously this had NO WHERE clause at all — it put id=?,user_id=? into the
// SET list (nonsensical; you don't SET a primary key) instead of a WHERE
// clause, and misspelled multiyr as multi_yr. Without a WHERE clause, every
// call to this UPDATE would have overwritten EVERY meeting row for EVERY
// user in the database — a live data-corruption bug, not just a crash.
// 25 SET values, then WHERE id=? AND user_id=? (27 placeholders total,
// matching the param order routes/meetings/meetings.js sends).
const updateMeeting = `UPDATE meetings SET
        date = ?,chair = ?,coChair = ?,newComer = ?,
        day30 = ?,day60 = ?,day90 = ?,month6 = ?,month9 = ?,
        month12 = ?,month18 = ?,multiyr = ?,gc1 = ?,gc2 = ?,gc3 = ?,
        gc4 = ?,gc5 = ?,gc6 = ?,gc7 = ?,gc8 = ?,gc9 = ?,gc10 = ?,
        attendance = ?,memo = ?,deposit = ?
        WHERE id=? AND user_id=?`;

// deleteMeetingById — targeted delete by id, matching what
// routes/meetings/meetings.js's per-row delete button sends.
const deleteMeetingById = `DELETE FROM meetings WHERE id=? AND user_id=?`;

module.exports = {
  deleteMeetingById,
  insertMeeting,
  selectMeetings,
  updateMeeting
};
