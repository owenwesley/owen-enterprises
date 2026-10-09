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
          c.areaAnnouncements, c.areaLibrary, c.areaContacts,
          m.role, m.status AS memberStatus, m.shareLibrary, m.shareContact, m.contactPhone, m.contactAddress
     FROM members m JOIN churches c ON c.id = m.church_id
    WHERE m.user_id=? AND m.status <> 'removed'
    ORDER BY c.name, c.id`;

const updateJoinCode = `UPDATE churches SET joinCode=? WHERE id=?`;

// Step 3 (area switches). Column names come from this fixed list, never from the request.
const AREA_COLUMNS = { announcements: 'areaAnnouncements', library: 'areaLibrary', contacts: 'areaContacts' };
const updateArea = (key) => `UPDATE churches SET ${AREA_COLUMNS[key]}=? WHERE id=?`;

module.exports = { AREA_COLUMNS, updateArea, insertChurch, selectChurchByJoinCode, updateMission, selectMyChurches, updateJoinCode };
