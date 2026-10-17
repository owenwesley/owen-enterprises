const express = require('express');
const bcrypt = require('bcryptjs');
const { church: db, owenenterprises: gateway } = require('../../db/db');
const { makeLimiter } = require('../../utils/attemptLimit');
const { requireChurch } = require('../../middleware/church');
const { toStr } = require('../../utils/coerce');
const { selectTransferTarget, setRole } = require('../../db/sql/church/members');
const { serverError } = require('../../utils/serverError');
const { bad, notFound, waitText } = require('./_helpers');
const router = express.Router({ mergeParams: true });

// Wrong passwords on hand-over: 5 per person per 15 minutes (in memory; a restart clears it).
const passwordMisses = makeLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

// POST /church/:church_id/transfer/:user_id   { memberId, password }
// Hands ownership to an ACTIVE member. Needs the owner's password. One owner at
// all times: both role changes happen in one transaction with the church row locked.
router.post('/:user_id', requireChurch('church.transfer'), async (req, res) => {
  const key = `u${req.user.id}`;
  const wait = passwordMisses.locked(key);
  if (wait) return bad(res, `Too many wrong passwords. Try again in ${waitText(wait)}.`, 429);

  const memberId = Number(req.body.memberId);
  const password = toStr(req.body.password);
  if (!Number.isInteger(memberId) || memberId < 1) return bad(res, 'Choose the member to hand the church to');
  if (!password) return bad(res, 'Enter your password to confirm', 400);

  let conn;
  try {
    const [[u]] = await gateway.promise().query('SELECT password FROM users WHERE id=?', [req.user.id]);
    const ok = u && await bcrypt.compare(password, u.password);
    if (!ok) {
      passwordMisses.miss(key);
      return res.status(400).json({ error: 'Password is incorrect', fieldErrors: { password: 'Password is incorrect' } });
    }
    passwordMisses.clear(key);

    conn = await db.promise().getConnection();
    await conn.beginTransaction();
    await conn.query('SELECT id FROM churches WHERE id=? FOR UPDATE', [req.church.id]);
    // Re-check inside the lock: still the owner of an approved church?
    const [me] = await conn.query(
      `SELECT m.id FROM members m JOIN churches c ON c.id = m.church_id
        WHERE m.church_id=? AND m.user_id=? AND m.role='owner' AND m.status='active' AND c.status='approved'`,
      [req.church.id, req.user.id]);
    const [target] = await conn.query(selectTransferTarget, [memberId, req.church.id]);
    if (!me.length || !target.length || target[0].user_id === req.user.id) {
      await conn.rollback();
      return notFound(res);
    }
    await conn.query(setRole, ['member', me[0].id, req.church.id]);
    await conn.query(setRole, ['owner', target[0].id, req.church.id]);
    await conn.commit();
    return res.json({ message: 'The church now belongs to the new owner. You are a regular member.' });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch { /* connection gone */ } }
    return serverError(res, err);
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
