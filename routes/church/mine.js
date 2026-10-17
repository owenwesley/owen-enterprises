const express = require('express');
const { church: db } = require('../../db/db');
const { PERMISSIONS } = require('../../middleware/church');
const { selectMyChurches } = require('../../db/sql/church/churches');
const { countPendingMembers } = require('../../db/sql/church/members');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

// GET /church/mine/:user_id
router.get('/:user_id', async (req, res) => {
  try {
    const [rows] = await db.promise().query(selectMyChurches, [req.user.id]);
    const results = [];
    for (const r of rows) {
      const isOwner = r.role === 'owner';
      const live = r.churchStatus === 'approved' && r.memberStatus === 'active';
      let pendingMembers = 0;
      if (isOwner && live) {
        const [[c]] = await db.promise().query(countPendingMembers, [r.churchId]);
        pendingMembers = Number(c.n);
      }
      results.push({
        churchId: r.churchId,
        name: r.name,
        missionStatement: r.missionStatement,
        churchStatus: r.churchStatus,
        role: r.role,
        // What this person may do here, so the page never has to guess from the role name.
        permissions: r.memberStatus === 'active' && r.churchStatus === 'approved' ? (PERMISSIONS[r.role] || []) : [],
        areas: { announcements: !!r.areaAnnouncements, library: !!r.areaLibrary, contacts: !!r.areaContacts },
        memberStatus: r.memberStatus,
        // The join code is shown to the owner of a working church only.
        joinCode: isOwner && live ? r.joinCode : undefined,
        shareLibrary: !!r.shareLibrary,
        shareContact: !!r.shareContact,
        contactPhone: r.contactPhone || '',
        contactAddress: r.contactAddress || '',
        pendingMembers,
      });
    }
    return res.json({ results });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
