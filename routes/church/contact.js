const express = require('express');
const { church: db } = require('../../db/db');
const { requireChurch } = require('../../middleware/church');
const { setShareContact } = require('../../db/sql/church/members');
const { serverError } = require('../../utils/serverError');
const { clean, bad, asFlag } = require('./_helpers');
const router = express.Router({ mergeParams: true });

const PHONE_MAX = 50;
const ADDRESS_MAX = 500;

// POST /church/:church_id/contact/share/:user_id   { share, phone, address }
// Turning sharing off erases the phone and address stored for the church.
router.post('/share/:user_id', requireChurch('contact.share'), async (req, res) => {
  const share = asFlag(req.body.share);
  const phone = share ? clean(req.body.phone) : '';
  const address = share ? clean(req.body.address) : '';
  if (phone.length > PHONE_MAX) return bad(res, `Phone must be ${PHONE_MAX} characters or fewer`);
  if (address.length > ADDRESS_MAX) return bad(res, `Address must be ${ADDRESS_MAX} characters or fewer`);
  try {
    await db.promise().query(setShareContact, [share, phone, address, req.church.id, req.user.id]);
    return res.json({
      message: share ? 'Your contact info is now shared with your church members.' : 'Your contact info is no longer shared.',
      shareContact: !!share, contactPhone: phone, contactAddress: address,
    });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
