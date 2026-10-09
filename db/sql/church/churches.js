// ── churches table (database `church`) ─────────────────────────────────────────
// A church is a group that users belong to. It is created as 'pending' and an
// admin approves it with db/approveChurch.js. joinCode is what members type to
// ask to join. Plain single-statement SQL only (ids stay stable).

const insertChurch = `INSERT INTO churches (name, missionStatement, joinCode, status) VALUES (?, ?, ?, 'pending')`;
const selectChurchByJoinCode = `SELECT id, name, status FROM churches WHERE joinCode=?`;
const updateMission = `UPDATE churches SET missionStatement=? WHERE id=?`;

// Every church the user is in (pending, active) with their role in it.
const selectMyChurches =
  `SELECT c.id AS churchId, c.name, c.missionStatement, c.status AS churchStatus, c.joinCode,
          m.role, m.status AS memberStatus, m.shareLibrary
     FROM members m JOIN churches c ON c.id = m.church_id
    WHERE m.user_id=? AND m.status <> 'removed'
    ORDER BY c.name, c.id`;

const updateJoinCode = `UPDATE churches SET joinCode=? WHERE id=?`;

module.exports = { insertChurch, selectChurchByJoinCode, updateMission, selectMyChurches, updateJoinCode };
