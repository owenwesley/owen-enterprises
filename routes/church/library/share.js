const express = require('express');
const { church: db } = require('../../../db/db');
const { requireChurch } = require('../../../middleware/church');
const { setShareLibrary } = require('../../../db/sql/church/members');
const { serverError } = require('../../../utils/serverError');
const { asFlag } = require('../_helpers');
const router = express.Router({ mergeParams: true });

// POST /church/:church_id/library/share/:user_id   { share: true | false }
// Opt-in, per person, per church. Off by default; leaving or removal switches it off.
router.post('/:user_id', requireChurch('library.share'), async (req, res) => {
  const share = asFlag(req.body.share);
  try {
    await db.promise().query(setShareLibrary, [share, req.church.id, req.user.id]);
    return res.json({
      message: share ? 'Your books and movies are now listed in the church catalog.' : 'Your books and movies are no longer listed.',
      shareLibrary: !!share,
    });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
