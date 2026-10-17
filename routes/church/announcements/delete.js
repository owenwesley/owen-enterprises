const express = require('express');
const { church: db } = require('../../../db/db');
const { requireChurch } = require('../../../middleware/church');
const { deleteAnnouncement } = require('../../../db/sql/church/announcements');
const { serverError } = require('../../../utils/serverError');
const { notFound } = require('../_helpers');
const router = express.Router({ mergeParams: true });

// POST /church/:church_id/announcements/delete/:user_id   { announcementId }
router.post('/:user_id', requireChurch('announcements.post'), async (req, res) => {
  try {
    const [r] = await db.promise().query(deleteAnnouncement, [Number(req.body.announcementId), req.church.id]);
    if (!r.affectedRows) return notFound(res);
    return res.json({ message: 'Announcement deleted' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
