// ── members table (database `church`) ──────────────────────────────────────────
// user_id is a plain number: users live in another database (owenenterprises)
// and a foreign key cannot cross databases. church_id is a real foreign key.

const insertMember = `INSERT INTO members (church_id, user_id, role, status) VALUES (?, ?, ?, ?)`;
const selectMembership = `SELECT id, role, status FROM members WHERE church_id=? AND user_id=?`;
const selectChurchMembers =
  `SELECT id, user_id, role, status, createdAt FROM members
    WHERE church_id=? AND status IN ('active','pending')
    ORDER BY (role='owner') DESC, status, id`;
const rerequestMember = `UPDATE members SET status='pending' WHERE id=? AND status='removed'`;
const approveMember = `UPDATE members SET status='active' WHERE id=? AND church_id=? AND status='pending'`;
const removeMember =
  `UPDATE members SET status='removed' WHERE id=? AND church_id=? AND role='member' AND status IN ('pending','active')`;
const leaveChurch =
  `UPDATE members SET status='removed' WHERE church_id=? AND user_id=? AND role='member' AND status IN ('pending','active')`;
const countPendingMembers = `SELECT COUNT(*) AS n FROM members WHERE church_id=? AND status='pending'`;

module.exports = {
  insertMember, selectMembership, selectChurchMembers, rerequestMember,
  approveMember, removeMember, leaveChurch, countPendingMembers,
};
