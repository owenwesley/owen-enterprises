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
// Leaving or being removed always switches library sharing off (step 2).
const removeMember =
  `UPDATE members SET status='removed', shareLibrary=0, shareContact=0, contactPhone='', contactAddress='' WHERE id=? AND church_id=? AND role='member' AND status IN ('pending','active')`;
const leaveChurch =
  `UPDATE members SET status='removed', shareLibrary=0, shareContact=0, contactPhone='', contactAddress='' WHERE church_id=? AND user_id=? AND role='member' AND status IN ('pending','active')`;
// Step 2: library sharing, ownership hand-over.
const setShareLibrary =
  `UPDATE members SET shareLibrary=? WHERE church_id=? AND user_id=? AND status='active'`;
const selectSharingMembers =
  `SELECT user_id FROM members WHERE church_id=? AND status='active' AND shareLibrary=1 ORDER BY id`;
// Step 3: contact sharing. Name and the account email come from the users table;
// phone and address are typed by the member for this purpose only.
const setShareContact =
  `UPDATE members SET shareContact=?, contactPhone=?, contactAddress=? WHERE church_id=? AND user_id=? AND status='active'`;
// People in the same APPROVED church(es) as :user who switched contact sharing on.
const selectContactSharers =
  `SELECT m.id AS memberId, m.user_id, c.name AS churchName, m.contactPhone, m.contactAddress
     FROM members m
     JOIN churches c ON c.id = m.church_id AND c.status='approved'
    WHERE m.status='active' AND m.shareContact=1 AND m.user_id <> ?
      AND m.church_id IN (SELECT mm.church_id FROM members mm WHERE mm.user_id=? AND mm.status='active')
    ORDER BY c.name, m.id`;
const selectTransferTarget =
  `SELECT id, user_id FROM members WHERE id=? AND church_id=? AND role='member' AND status='active'`;
const setRole = `UPDATE members SET role=? WHERE id=? AND church_id=?`;
const countPendingMembers = `SELECT COUNT(*) AS n FROM members WHERE church_id=? AND status='pending'`;

module.exports = {
  insertMember, selectMembership, selectChurchMembers, rerequestMember,
  approveMember, removeMember, leaveChurch, countPendingMembers,
  setShareLibrary, selectSharingMembers, setShareContact, selectContactSharers, selectTransferTarget, setRole,
};
