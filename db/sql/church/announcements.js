// ── announcements table (database `church`) ──────────────────────────────────
// Plain single-statement SQL. church_id is a real foreign key (ON DELETE CASCADE);
// user_id is the author (users live in another database, so no foreign key).
const selectAnnouncements =
  `SELECT id, user_id, title, body, createdAt, updatedAt FROM announcements
    WHERE church_id=? ORDER BY createdAt DESC, id DESC LIMIT 100`;
const insertAnnouncement = `INSERT INTO announcements (church_id, user_id, title, body) VALUES (?, ?, ?, ?)`;
const updateAnnouncement = `UPDATE announcements SET title=?, body=? WHERE id=? AND church_id=?`;
const deleteAnnouncement = `DELETE FROM announcements WHERE id=? AND church_id=?`;

module.exports = { selectAnnouncements, insertAnnouncement, updateAnnouncement, deleteAnnouncement };
