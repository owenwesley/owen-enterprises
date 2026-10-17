const express = require('express');
const { church: db } = require('../../../db/db');
const { requireChurch } = require('../../../middleware/church');
const { updateAnnouncement } = require('../../../db/sql/church/announcements');
const { serverError } = require('../../../utils/serverError');
const { notFound } = require('../_helpers');
const { readAnnouncement } = require('./_fields');
const router = express.Router({ mergeParams: true });

// POST /church/:church_id/announcements/edit/:user_id   { announcementId, title, body }
router.post('/:user_id', requireChurch('announcements.post'), async (req, res) => {
  const a = readAnnouncement(req, res);
  if (!a) return undefined;
  try {
    const [r] = await db.promise().query(updateAnnouncement, [a.title, a.body, Number(req.body.announcementId), req.church.id]);
    if (!r.affectedRows) return notFound(res);
    return res.json({ message: 'Announcement saved' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
