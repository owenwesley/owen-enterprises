const express = require('express');
const { church: db } = require('../../db/db');
const { requireChurch } = require('../../middleware/church');
const { selectAnnouncements } = require('../../db/sql/church/announcements');
const { serverError } = require('../../utils/serverError');
const { displayNames } = require('./_helpers');
const router = express.Router({ mergeParams: true });

router.use('/post',   require('./announcements/post'));
router.use('/edit',   require('./announcements/edit'));
router.use('/delete', require('./announcements/delete'));

// GET /church/:church_id/announcements/:user_id
router.get('/:user_id', requireChurch('announcements.view'), async (req, res) => {
  try {
    const [rows] = await db.promise().query(selectAnnouncements, [req.church.id]);
    const names = await displayNames([...new Set(rows.map((r) => r.user_id))]);
    const results = rows.map((r) => ({
      announcementId: r.id,
      title: r.title,
      body: r.body,
      author: names.get(r.user_id) || 'Former member',
      createdAt: r.createdAt,
      edited: new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime() > 1000,
    }));
    return res.json({ results });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
