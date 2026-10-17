const express = require('express');
const { church: db } = require('../../db/db');
const { makeLimiter } = require('../../utils/attemptLimit');
const { selectChurchByJoinCode } = require('../../db/sql/church/churches');
const { insertMember, selectMembership, rerequestMember } = require('../../db/sql/church/members');
const { serverError } = require('../../utils/serverError');
const { clean, bad, waitText } = require('./_helpers');
const router = express.Router();

// In-memory limits (a restart clears them, like routes/mfa.js):
// wrong join codes: 5 per person per 15 minutes, 50 per IP per hour.
const codeMissesByUser = makeLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
const codeMissesByIp   = makeLimiter({ max: 50, windowMs: 60 * 60 * 1000 });

// POST /church/join/:user_id   { joinCode }
router.post('/:user_id', async (req, res) => {
  const code = clean(req.body.joinCode).toUpperCase();
  if (!code) return bad(res, 'Enter the join code');
  const userKey = `u${req.user.id}`;
  const ipKey = `ip${req.ip}`;
  const wait = Math.max(codeMissesByUser.locked(userKey), codeMissesByIp.locked(ipKey));
  if (wait) return bad(res, `Too many wrong join codes. Try again in ${waitText(wait)}.`, 429);
  try {
    const [found] = await db.promise().query(selectChurchByJoinCode, [code]);
    // An unknown code and a church that is not approved look the same.
    if (!found.length || found[0].status !== 'approved') {
      codeMissesByUser.miss(userKey);
      codeMissesByIp.miss(ipKey);
      return bad(res, 'Join code not found', 404);
    }
    codeMissesByUser.clear(userKey);   // a right code forgets earlier wrong ones
    const church = found[0];

    const [mem] = await db.promise().query(selectMembership, [church.id, req.user.id]);
    if (mem.length) {
      if (mem[0].status === 'active')  return bad(res, 'You are already a member of this church.', 409);
      if (mem[0].status === 'pending') return bad(res, 'Your request to join is already waiting for approval.', 409);
      await db.promise().query(rerequestMember, [mem[0].id]);   // was removed: ask again
    } else {
      await db.promise().query(insertMember, [church.id, req.user.id, 'member', 'pending']);
    }
    return res.json({ message: `Request sent to ${church.name}. The church owner needs to approve it.`, churchName: church.name });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
