const express = require('express');
const { church: db } = require('../../db/db');
const { selectIncoming, selectOutgoing, expireStale } = require('../../db/sql/church/borrow');
const { serverError } = require('../../utils/serverError');
const { displayNames } = require('./_helpers');
const router = express.Router();

// Ask to borrow. A request goes from a member to the member who shared the book / movie. Both must
// still be in a church where library sharing is on (same rule as the shared list). Every path ends in
// the signed-in user's id, as ownerOnly() requires. Nobody's id is ever sent to the browser: the owner
// sees the asker's name, the asker sees the owner's name.
router.use('/request', require('./borrow/request'));
router.use('/answer',  require('./borrow/answer'));
router.use('/cancel',  require('./borrow/cancel'));
router.use('/clear',   require('./borrow/clear'));

// GET /church/borrow/:user_id  ->  { incoming: [...], outgoing: [...] }
router.get('/:user_id', async (req, res) => {
  try {
    await db.promise().query(expireStale, [req.user.id, req.user.id]);
    const [inc] = await db.promise().query(selectIncoming, [req.user.id]);
    const [out] = await db.promise().query(selectOutgoing, [req.user.id]);
    const names = await displayNames([...new Set([...inc.map((r) => r.requester_id), ...out.map((r) => r.user_id)])]);
    return res.json({
      incoming: inc.map((r) => ({ id: r.id, from: names.get(r.requester_id) || 'Someone', kind: r.kind, title: r.title, note: r.note, status: r.status, auto: !!r.auto, createdAt: r.createdAt })),
      outgoing: out.map((r) => ({ id: r.id, to: names.get(r.user_id) || 'Someone', kind: r.kind, title: r.title, status: r.status, auto: !!r.auto, createdAt: r.createdAt })),
    });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
