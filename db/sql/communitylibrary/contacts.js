// NOTE: the old copyContactsTable/deleteContacts/deleteAllContacts triplet
// that used to live here (DROP the live table, rebuild it from a temp table
// that didn't even carry the id column, so ids reshuffled for EVERY user on
// every add/delete/edit) has been removed outright rather than kept as dead
// code — same bug class as medications/nutritions, just here it was also
// wired into updateContact on every single edit. Neither deleteContacts nor
// deleteAllContacts was referenced by any route (only add/edit/delete are
// mounted under routes/communitylibrary/contacts/; there's no deleteAll
// route), so both were unused as well as dangerous. If a table ever
// genuinely needs a full physical rewrite again, use the safe
// temp-table-swap pattern in db/maintenance/rebuildTable.js instead — it
// preserves every row's id via an atomic RENAME TABLE swap.

// Plain single-statement INSERT. The sql file previously exported this as
// `insertContacts` (plural), but routes/communitylibrary/contacts/add.js
// imports `insertContact` (singular) — the mismatch meant that name was
// undefined and every contact-add request threw before this fix.
const insertContact =
    `INSERT INTO contacts(user_id,firstName,lastName,phoneNum,
       email,address) values(?,?,?,?,?,?)`;

const selectContacts = `select * from contacts`;

// Targeted delete by row id — routes/communitylibrary/contacts/delete.js
// imports `deleteContactById`, which didn't exist here, so every delete
// threw before this fix.
const deleteContactById = `DELETE FROM contacts WHERE id=? AND user_id=?`;

// Plain single-statement UPDATE, scoped by id AND user_id. This used to
// SET id=?,user_id=?,... (nonsensical — overwriting the primary key from
// the request body) and appended copyContactsTable, which DROPs and
// recreates the whole table on every edit — the temp table has no id
// column, so every edit reassigned fresh auto-increment ids to EVERY
// contact row for EVERY user (reordered by lastName, user_id), not just the
// row being edited. It also had 9 placeholders while the route
// (routes/communitylibrary/contacts/edit.js) only ever sends 7 params, so
// the extra id=?,user_id=? in the SET list would have bound to the wrong
// values. Row order is already guaranteed by the SELECT ... ORDER BY
// lastName, firstName, id in the GET route.
const updateContact =
    `UPDATE contacts SET firstName=?,lastName=?,phoneNum=?,email=?,
     address=? WHERE id=? AND user_id=?`;

module.exports = {
  insertContact,
  deleteContactById,
  selectContacts,
  updateContact,
};
