const express = require('express');
const { church: db } = require('../../db/db');
const { requireChurch } = require('../../middleware/church');
const { genCode } = require('../../db/backfillInviteCodes');
const { updateJoinCode } = require('../../db/sql/church/churches');
const { serverError } = require('../../utils/serverError');
const { notFound } = require('./_helpers');
const router = express.Router({ mergeParams: true });

// POST /church/:church_id/joincode/reset/:user_id
// The old code stops working at once. Members and waiting requests are untouched.
router.post('/reset/:user_id', requireChurch('joincode.reset'), async (req, res) => {
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const joinCode = genCode();
      try {
        const [r] = await db.promise().query(updateJoinCode, [joinCode, req.church.id]);
        if (!r.affectedRows) return notFound(res);
        return res.json({ message: 'New join code created. The old one no longer works.', joinCode });
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY') throw e;   // collision with another church: try again
      }
    }
    return res.status(500).json({ error: 'Could not create a join code, please try again' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
