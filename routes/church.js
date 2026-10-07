/**
 * routes/church.js  (mounted at /church in server.js)
 *
 * Church module, step 1: request a church, join one with a code, see members,
 * owner approves / removes members and edits the mission statement.
 *
 * Every path ends with the signed-in user's id (server.js puts auth + ownerOnly
 * in front). Routes that act INSIDE a church also carry :church_id and go
 * through requireChurch(permission) (middleware/church.js).
 *
 *   GET  /church/mine/:user_id                        my churches
 *   POST /church/create/:user_id                      request a new church (pending)
 *   POST /church/join/:user_id                        ask to join with a code (pending)
 *   GET  /church/:church_id/members/:user_id          members.view
 *   POST /church/:church_id/members/approve/:user_id  members.manage  { memberId }
 *   POST /church/:church_id/members/remove/:user_id   members.manage  { memberId }
 *   POST /church/:church_id/edit/:user_id             church.edit     { missionStatement }
 *   POST /church/:church_id/leave/:user_id            leave (or withdraw a request)
 *
 * Members are shown by display name only (first + last name); never an email.
 * Joining a church never exposes anyone's library, health or other data.
 */
const express = require('express');
const { church: db, owenenterprises: gateway } = require('../db/db');
const { requireChurch } = require('../middleware/church');
const { genCode } = require('../db/backfillInviteCodes');
const { toStr } = require('../utils/coerce');
const { insertChurch, selectChurchByJoinCode, updateMission, selectMyChurches } = require('../db/sql/church/churches');
const {
  insertMember, selectMembership, selectChurchMembers, rerequestMember,
  approveMember, removeMember, leaveChurch, countPendingMembers,
} = require('../db/sql/church/members');

const router = express.Router();
const NAME_MAX = 150;
const MISSION_MAX = 2000;
const clean = (v) => toStr(v).trim();
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const notFound = (res) => res.status(404).json({ error: 'Nothing was updated — that row was not found.' });

// GET /church/mine/:user_id
router.get('/mine/:user_id', async (req, res) => {
  try {
    const [rows] = await db.promise().query(selectMyChurches, [req.user.id]);
    const results = [];
    for (const r of rows) {
      const isOwner = r.role === 'owner';
      const live = r.churchStatus === 'approved' && r.memberStatus === 'active';
      let pendingMembers = 0;
      if (isOwner && live) {
        const [[c]] = await db.promise().query(countPendingMembers, [r.churchId]);
        pendingMembers = Number(c.n);
      }
      results.push({
        churchId: r.churchId,
        name: r.name,
        missionStatement: r.missionStatement,
        churchStatus: r.churchStatus,
        role: r.role,
        memberStatus: r.memberStatus,
        // The join code is shown to the owner of a working church only.
        joinCode: isOwner && live ? r.joinCode : undefined,
        pendingMembers,
      });
    }
    return res.json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /church/create/:user_id   { name, missionStatement }
router.post('/create/:user_id', async (req, res) => {
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
    if (!churchId) throw new Error('Could not create a join code, please try again');
    // The person who requests a church becomes its owner (active at once; the
    // church itself is unusable until an admin approves it).
    await conn.query(insertMember, [churchId, req.user.id, 'owner', 'active']);
    await conn.commit();
    return res.status(201).json({ message: 'Church requested. It is waiting for approval.', churchId });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch { /* connection gone */ } }
    return res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// POST /church/join/:user_id   { joinCode }
router.post('/join/:user_id', async (req, res) => {
  const code = clean(req.body.joinCode).toUpperCase();
  if (!code) return bad(res, 'Enter the join code');
  try {
    const [found] = await db.promise().query(selectChurchByJoinCode, [code]);
    // An unknown code and a church that is not approved look the same.
    if (!found.length || found[0].status !== 'approved') return bad(res, 'Join code not found', 404);
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
    return res.status(500).json({ error: err.message });
  }
});

// GET /church/:church_id/members/:user_id
router.get('/:church_id/members/:user_id', requireChurch('members.view'), async (req, res) => {
  try {
    const isOwner = req.church.role === 'owner';
    const [rows] = await db.promise().query(selectChurchMembers, [req.church.id]);
    // Only the owner sees people who are still waiting.
    const visible = rows.filter((r) => isOwner || r.status === 'active');
    const ids = [...new Set(visible.map((r) => r.user_id))];
    const names = new Map();
    if (ids.length) {
      const [users] = await gateway.promise().query(
        'SELECT id, firstName, lastName FROM users WHERE id IN (?)', [ids]);
      for (const u of users) names.set(u.id, `${u.firstName} ${u.lastName}`.trim());
    }
    const results = visible.map((r) => ({
      memberId: r.id,
      name: names.get(r.user_id) || 'Former member',
      role: r.role,
      status: r.status,
      joinedAt: r.createdAt,
      isYou: r.user_id === req.user.id,
    }));
    return res.json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /church/:church_id/members/approve/:user_id   { memberId }
router.post('/:church_id/members/approve/:user_id', requireChurch('members.manage'), async (req, res) => {
  try {
    const [r] = await db.promise().query(approveMember, [Number(req.body.memberId), req.church.id]);
    if (!r.affectedRows) return notFound(res);
    return res.json({ message: 'Member approved' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /church/:church_id/members/remove/:user_id   { memberId }
router.post('/:church_id/members/remove/:user_id', requireChurch('members.manage'), async (req, res) => {
  try {
    const [r] = await db.promise().query(removeMember, [Number(req.body.memberId), req.church.id]);
    if (!r.affectedRows) return notFound(res);
    return res.json({ message: 'Member removed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /church/:church_id/edit/:user_id   { missionStatement }
router.post('/:church_id/edit/:user_id', requireChurch('church.edit'), async (req, res) => {
  const mission = clean(req.body.missionStatement);
  if (mission.length > MISSION_MAX) return bad(res, `Mission statement must be ${MISSION_MAX} characters or fewer`);
  try {
    const [r] = await db.promise().query(updateMission, [mission, req.church.id]);
    if (!r.affectedRows) return notFound(res);
    return res.json({ message: 'Mission statement saved' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /church/:church_id/leave/:user_id
// No permission check on purpose: a person whose request is still pending, or
// whose church was suspended, must still be able to step out.
router.post('/:church_id/leave/:user_id', async (req, res) => {
  const churchId = Number(req.params.church_id);
  try {
    const [mem] = await db.promise().query(selectMembership, [churchId, req.user.id]);
    if (!mem.length || mem[0].status === 'removed') return notFound(res);
    if (mem[0].role === 'owner') {
      return bad(res, 'The owner cannot leave. Contact the site owner to close the church.', 400);
    }
    const [r] = await db.promise().query(leaveChurch, [churchId, req.user.id]);
    if (!r.affectedRows) return notFound(res);
    return res.json({ message: 'You left the church' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
