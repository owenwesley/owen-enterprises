const express = require('express');
const { church: db } = require('../../db/db');
const { genCode } = require('../../db/backfillInviteCodes');
const { insertChurch } = require('../../db/sql/church/churches');
const { insertMember } = require('../../db/sql/church/members');
const { serverError } = require('../../utils/serverError');
const { clean, bad } = require('./_helpers');
const router = express.Router();

const NAME_MAX = 150;
const MISSION_MAX = 2000;

// POST /church/create/:user_id   { name, missionStatement }
router.post('/:user_id', async (req, res) => {
  const name = clean(req.body.name);
  const mission = clean(req.body.missionStatement);
  if (!name) return bad(res, 'Church name is required');
  if (name.length > NAME_MAX) return bad(res, `Church name must be ${NAME_MAX} characters or fewer`);
  if (mission.length > MISSION_MAX) return bad(res, `Mission statement must be ${MISSION_MAX} characters or fewer`);

  let conn;
  try {
    // A person can have only one church waiting for approval at a time.
    const [waiting] = await db.promise().query(
      `SELECT c.id FROM members m JOIN churches c ON c.id = m.church_id
        WHERE m.user_id=? AND m.role='owner' AND c.status='pending'`,
      [req.user.id]
    );
    if (waiting.length) return bad(res, 'You already have a church waiting for approval.', 409);

    conn = await db.promise().getConnection();
    await conn.beginTransaction();
    let churchId = null;
    for (let attempt = 0; attempt < 5 && !churchId; attempt++) {
      try {
        const [ins] = await conn.query(insertChurch, [name, mission, genCode()]);
        churchId = ins.insertId;
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY') throw e;   // join code collision: try another
      }
    }
    if (!churchId) { const e = new Error('Could not create a join code, please try again'); e.expose = true; throw e; }
    // The person who requests a church becomes its owner (active at once; the
    // church itself is unusable until an admin approves it).
    await conn.query(insertMember, [churchId, req.user.id, 'owner', 'active']);
    await conn.commit();
    return res.status(201).json({ message: 'Church requested. It is waiting for approval.', churchId });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch { /* connection gone */ } }
    return serverError(res, err);
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
