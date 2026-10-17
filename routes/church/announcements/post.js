const express = require('express');
const { church: db } = require('../../../db/db');
const { requireChurch } = require('../../../middleware/church');
const { insertAnnouncement } = require('../../../db/sql/church/announcements');
const { serverError } = require('../../../utils/serverError');
const { readAnnouncement } = require('./_fields');
const router = express.Router({ mergeParams: true });

// POST /church/:church_id/announcements/post/:user_id   { title, body }
router.post('/:user_id', requireChurch('announcements.post'), async (req, res) => {
  const a = readAnnouncement(req, res);
  if (!a) return undefined;
  try {
    const [r] = await db.promise().query(insertAnnouncement, [req.church.id, req.user.id, a.title, a.body]);
    return res.status(201).json({ message: 'Announcement posted', announcementId: r.insertId });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
