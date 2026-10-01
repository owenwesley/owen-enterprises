// NOTE: the old copyMedicationsTable/deleteMedication/deleteAllMedications
// triplet that used to live here (DROP the live table, rebuild it from a
// temp table that didn't even carry the id column, so ids reshuffled for
// EVERY user on every write) has been removed outright rather than kept as
// dead code — it's dangerous enough that leaving it importable was its own
// risk. If a table ever genuinely needs a full physical rewrite again (e.g.
// a real column-type change that ALTER TABLE can't do in place), use the
// safe temp-table-swap pattern in db/maintenance/rebuildTable.js instead:
// it preserves every row's id, and RENAME TABLE's atomic swap means the
// live `medications` name is never briefly missing the way DROP+CREATE left
// it. It's a standalone, manually-run utility — nothing here calls it, and
// none of the fixes below need it.

// Plain single-statement INSERT/DELETE. These used to append
// copyMedicationsTable, which DROPs and recreates the whole table — the temp
// table has no id column, so every add or single delete reassigned fresh
// auto-increment ids to EVERY medication row for EVERY user (ordered by
// name, user_id), not just the row being touched. That's a worse version of
// the same bug class fixed for bloodpressures/deleteAll: it undermines the
// id-based draft-editing pattern medications now uses, since an id captured
// by a client could point at a different row after any other add/delete
// landed. Row order is already guaranteed by the SELECT in the GET route.
const insertMedication =
  `INSERT INTO medications (user_id, name, dose, unit, quantity,
    prescriber, am, noon, evening, bed) values(?,?,?,?,?,?,?,?,?,?)`;

const deleteMedicationById = `DELETE FROM medications WHERE id=? AND user_id=?`;

// Plain single-statement delete-all, scoped to one user.
const deleteAllMedicationsByUser = `DELETE FROM medications WHERE user_id=?`;

const selectMedications = `SELECT * FROM medications`;

const updateMedication =
  `UPDATE medications SET name=?,dose=?,unit=?,quantity=?,
   prescriber=?,am=?,noon=?,evening=?,bed=? WHERE id=? AND
    user_id=?;`;

module.exports = {
  deleteMedicationById,
  deleteAllMedicationsByUser,
  insertMedication,
  selectMedications,
  updateMedication
};
