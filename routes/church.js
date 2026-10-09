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
 * Step 2:
 *   POST /church/:church_id/joincode/reset/:user_id   joincode.reset  new join code
 *   POST /church/:church_id/transfer/:user_id         church.transfer { memberId, password }
 *   GET  /church/:church_id/library/:user_id          library.view    church catalog
 *   POST /church/:church_id/library/share/:user_id    library.share   { share: true|false }
 *
 * Step 3:
 *   GET  /church/shared-library/:user_id              books and movies other members shared (read-only, for the search on Books / Movies)
 *   GET  /church/contacts/:user_id                    church members who shared their contact info
 *   POST /church/:church_id/contact/share/:user_id    contact.share   { share, phone, address }
 *
 * Step 3 (announcements):
 *   GET  /church/:church_id/announcements/:user_id            announcements.view  newest first (max 100)
 *   POST /church/:church_id/announcements/post/:user_id       announcements.post  { title, body }
 *   POST /church/:church_id/announcements/edit/:user_id       announcements.post  { announcementId, title, body }
 *   POST /church/:church_id/announcements/delete/:user_id     announcements.post  { announcementId }
 * Only active members of an approved church can read them; leaving, removal or suspension closes
 * access at once (same check as every other church route). The author is shown by display name only.
 *
 * Step 3 (roles and area switches):
 *   POST /church/:church_id/members/role/:user_id     members.roles   { memberId, role }  (owner only)
 *   POST /church/:church_id/areas/:user_id            areas.manage    { announcements?, library?, contacts? }  (owner only)
 * Roles: owner, leader (posts announcements, approves / removes ordinary members), treasurer and
 * mission leader (labels only for now), member. Permissions live in middleware/church.js.
 * An area switched off closes that area for EVERY member at once, on the server (library and contact
 * sharing are also switched off for everyone and the phone / address erased; announcements are kept hidden).
 *
 * The member list shows display names only. A member's name and ACCOUNT email, plus a phone and
 * address typed for this purpose, are shown to members of the same church ONLY when that member
 * switched contact sharing on (off by default). Sharing is switched off and phone/address erased
 * on leave, removal, reject or suspend. Joining a church never exposes anyone's health or other data.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { church: db, owenenterprises: gateway, communitylibrary: library } = require('../db/db');
const { makeLimiter } = require('../utils/attemptLimit');
const { requireChurch, PERMISSIONS, ASSIGNABLE_ROLES } = require('../middleware/church');
const { genCode } = require('../db/backfillInviteCodes');
const { toStr } = require('../utils/coerce');
const { insertChurch, selectChurchByJoinCode, updateMission, selectMyChurches, updateJoinCode, AREA_COLUMNS, updateArea } = require('../db/sql/church/churches');
const {
  insertMember, selectMembership, selectChurchMembers, rerequestMember,
  approveMember, removeMember, removeAnyMember, leaveChurch, countPendingMembers, selectRoleTarget,
  setShareLibrary, selectSharingMembers, selectTransferTarget, setRole,
  setShareContact, selectContactSharers, selectLibrarySharers,
} = require('../db/sql/church/members');
const { selectSharedBooks, selectSharedMovies, selectBookForBorrow, selectMovieForBorrow } = require('../db/sql/church/library');
const {
  insertBorrow, selectPendingDuplicate, countPendingByRequester, selectIncoming, selectOutgoing,
  answerBorrow, cancelBorrow, clearBorrow,
} = require('../db/sql/church/borrow');
const { selectAnnouncements, insertAnnouncement, updateAnnouncement, deleteAnnouncement } = require('../db/sql/church/announcements');

const router = express.Router();
const NAME_MAX = 150;
const MISSION_MAX = 2000;
const clean = (v) => toStr(v).trim();

// In-memory limits (a restart clears them, like routes/mfa.js).
//  - wrong join codes: 5 per person per 15 minutes, 50 per IP per hour
//  - wrong passwords on hand-over: 5 per person per 15 minutes
const codeMissesByUser = makeLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
const codeMissesByIp   = makeLimiter({ max: 50, windowMs: 60 * 60 * 1000 });
const passwordMisses   = makeLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
const waitText = (m) => `${m} minute${m === 1 ? '' : 's'}`;
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
        // What this person may do here, so the page never has to guess from the role name.
        permissions: r.memberStatus === 'active' && r.churchStatus === 'approved' ? (PERMISSIONS[r.role] || []) : [],
        areas: { announcements: !!r.areaAnnouncements, library: !!r.areaLibrary, contacts: !!r.areaContacts },
        memberStatus: r.memberStatus,
        // The join code is shown to the owner of a working church only.
        joinCode: isOwner && live ? r.joinCode : undefined,
        shareLibrary: !!r.shareLibrary,
        shareContact: !!r.shareContact,
        contactPhone: r.contactPhone || '',
        contactAddress: r.contactAddress || '',
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
    return res.status(500).json({ error: err.message });
  }
});

// GET /church/:church_id/members/:user_id
router.get('/:church_id/members/:user_id', requireChurch('members.view'), async (req, res) => {
  try {
    const canManage = (PERMISSIONS[req.church.role] || []).includes('members.manage');
    const [rows] = await db.promise().query(selectChurchMembers, [req.church.id]);
    // Only the owner and leaders see people who are still waiting.
    const visible = rows.filter((r) => canManage || r.status === 'active');
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
    // The owner may remove anyone but the owner; a leader only ordinary members (never another leader or role holder).
    const sql = req.church.role === 'owner' ? removeAnyMember : removeMember;
    const [r] = await db.promise().query(sql, [Number(req.body.memberId), req.church.id]);
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

// ── Step 2 ─────────────────────────────────────────────────────────────────────

// POST /church/:church_id/joincode/reset/:user_id
// The old code stops working at once. Members and waiting requests are untouched.
router.post('/:church_id/joincode/reset/:user_id', requireChurch('joincode.reset'), async (req, res) => {
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
    return res.status(500).json({ error: err.message });
  }
});

// POST /church/:church_id/transfer/:user_id   { memberId, password }
// Hands ownership to an ACTIVE member. Needs the owner's password. One owner at
// all times: both role changes happen in one transaction with the church row locked.
router.post('/:church_id/transfer/:user_id', requireChurch('church.transfer'), async (req, res) => {
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
    return res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// POST /church/:church_id/members/role/:user_id   { memberId, role }   owner only
router.post('/:church_id/members/role/:user_id', requireChurch('members.roles'), async (req, res) => {
  const memberId = Number(req.body.memberId);
  const role = clean(req.body.role);
  if (!Number.isInteger(memberId) || memberId < 1) return bad(res, 'Choose a member');
  if (!ASSIGNABLE_ROLES.includes(role)) return bad(res, 'Unknown role');
  try {
    const [t] = await db.promise().query(selectRoleTarget, [memberId, req.church.id]);
    if (!t.length || t[0].user_id === req.user.id) return notFound(res);
    await db.promise().query(setRole, [role, memberId, req.church.id]);
    return res.json({ message: 'Role saved', role });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const asFlag = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);

// POST /church/:church_id/areas/:user_id   { announcements?, library?, contacts? }   owner only
// Only the keys sent are changed. Switching library or contacts off also switches every member's
// sharing off and erases the stored phone / address, so switching it back on shares nothing until
// each person opts in again. Announcements are only hidden (nothing is deleted).
router.post('/:church_id/areas/:user_id', requireChurch('areas.manage'), async (req, res) => {
  const keys = Object.keys(AREA_COLUMNS).filter((k) => req.body[k] !== undefined);
  if (!keys.length) return bad(res, 'Nothing to change');
  try {
    for (const k of keys) {
      const on = asFlag(req.body[k]);
      await db.promise().query(updateArea(k), [on, req.church.id]);
      if (!on && k === 'library') await db.promise().query('UPDATE members SET shareLibrary=0 WHERE church_id=?', [req.church.id]);
      if (!on && k === 'contacts') await db.promise().query("UPDATE members SET shareContact=0, contactPhone='', contactAddress='' WHERE church_id=?", [req.church.id]);
    }
    return res.json({ message: 'Saved' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /church/:church_id/library/share/:user_id   { share: true | false }
// Opt-in, per person, per church. Off by default; leaving or removal switches it off.
router.post('/:church_id/library/share/:user_id', requireChurch('library.share'), async (req, res) => {
  const share = req.body.share === true || req.body.share === 1 || req.body.share === '1' || req.body.share === 'true' ? 1 : 0;
  try {
    await db.promise().query(setShareLibrary, [share, req.church.id, req.user.id]);
    return res.json({
      message: share ? 'Your books and movies are now listed in the church catalog.' : 'Your books and movies are no longer listed.',
      shareLibrary: !!share,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /church/:church_id/library/:user_id
// One entry per member who switched sharing on: display name, books and movies.
// Only whitelisted columns are read (db/sql/church/library.js): no borrower names,
// no pictures, no contacts, no ids, no emails. (Contact sharing is a separate opt-in below.)
router.get('/:church_id/library/:user_id', requireChurch('library.view'), async (req, res) => {
  try {
    const [sharers] = await db.promise().query(selectSharingMembers, [req.church.id]);
    const ids = sharers.map((r) => r.user_id);
    if (!ids.length) return res.json({ results: [] });

    const [users] = await gateway.promise().query('SELECT id, firstName, lastName FROM users WHERE id IN (?)', [ids]);
    const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
    const [books] = await library.promise().query(selectSharedBooks, [ids]);
    const [movies] = await library.promise().query(selectSharedMovies, [ids]);

    const results = ids.filter((id) => names.has(id)).map((id) => ({
      name: names.get(id),
      isYou: id === req.user.id,
      books: books.filter((b) => b.user_id === id).map((b) => ({
        title: b.title,
        author: b.author,
        year: b.copywrite || undefined,
        available: b.io === 1 && !b.lost,
      })),
      movies: movies.filter((m) => m.user_id === id).map((m) => {
        const count = Math.min(Math.max(Number(m.numMovie) || 1, 1), 12);
        const films = [];
        for (let i = 1; i <= count; i++) {
          if (m[`name${i}`]) films.push({ name: m[`name${i}`], img: m[`img${i}`] || undefined, available: m[`io${i}`] === 1 && !m.lost });
        }
        return {
          name: m.name,
          media: m.featureMedia || undefined,
          available: m.io === 1 && !m.lost,
          films,
        };
      }),
    }));
    return res.json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const PHONE_MAX = 50;
const ADDRESS_MAX = 500;

// POST /church/:church_id/contact/share/:user_id   { share, phone, address }
// Turning sharing off erases the phone and address stored for the church.
router.post('/:church_id/contact/share/:user_id', requireChurch('contact.share'), async (req, res) => {
  const share = req.body.share === true || req.body.share === 1 || req.body.share === '1' || req.body.share === 'true' ? 1 : 0;
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
    return res.status(500).json({ error: err.message });
  }
});

// GET /church/shared-library/:user_id
// Live, read-only list for the Books and Movies pages: other members' shared titles, so a search there
// can say "Russ has it". Nothing is copied into anyone's tables and there is no edit or delete route
// for these rows: the Community Library routes only ever touch the signed-in user's own rows
// (WHERE id=? AND user_id=?). Same whitelist as the church catalog: no borrower names, owner user
// ids or emails. Since 1.11.27 it also carries the cover picture path and `ref` (the item's own row id,
// used only to ask to borrow it). Only people from a church where the viewer has also switched sharing on.
router.get('/shared-library/:user_id', async (req, res) => {
  try {
    const [rows] = await db.promise().query(selectLibrarySharers, [req.user.id, req.user.id]);
    if (!rows.length) return res.json({ books: [], movies: [] });
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const [users] = await gateway.promise().query('SELECT id, firstName, lastName FROM users WHERE id IN (?)', [ids]);
    const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
    const churchOf = new Map();
    for (const r of rows) churchOf.set(r.user_id, [...(churchOf.get(r.user_id) || []), r.churchName].filter((x, i, a) => a.indexOf(x) === i));
    const owner = (id) => ({ sharedBy: names.get(id), church: churchOf.get(id).join(', ') });
    const [books] = await library.promise().query(selectSharedBooks, [ids]);
    const [movies] = await library.promise().query(selectSharedMovies, [ids]);
    return res.json({
      books: books.filter((b) => names.has(b.user_id)).map((b) => ({
        ...owner(b.user_id), ref: b.id, title: b.title, author: b.author, year: b.copywrite || undefined, img: b.img_url || undefined, available: b.io === 1 && !b.lost,
      })),
      movies: movies.filter((m) => names.has(m.user_id)).map((m) => {
        const count = Math.min(Math.max(Number(m.numMovie) || 1, 1), 12);
        const films = [];
        for (let i = 1; i <= count; i++) {
          if (m[`name${i}`]) films.push({ name: m[`name${i}`], img: m[`img${i}`] || undefined, available: m[`io${i}`] === 1 && !m.lost });
        }
        return { ...owner(m.user_id), ref: m.id, name: m.name, media: m.featureMedia || undefined, img: m.img_url || undefined, available: m.io === 1 && !m.lost, films };
      }),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Ask to borrow ──────────────────────────────────────────────────────────────
// A request goes from a member to the member who shared the book / movie. Both must still be in
// a church where library sharing is on (same rule as the shared list). Every path ends in the
// signed-in user's id, as ownerOnly() requires. Nobody's id is ever sent to the browser: the owner
// sees the asker's name, the asker sees the owner's name.
const BORROW_NOTE_MAX = 300;
const BORROW_PENDING_MAX = 20;
const personName = async (ids) => {
  if (!ids.length) return new Map();
  const [u] = await gateway.promise().query('SELECT id, firstName, lastName FROM users WHERE id IN (?)', [ids]);
  return new Map(u.map((x) => [x.id, `${x.firstName} ${x.lastName}`.trim()]));
};

// POST /church/borrow/request/:user_id   { kind: 'book'|'movie', ref, note? }
router.post('/borrow/request/:user_id', async (req, res) => {
  try {
    const { kind, ref } = req.body || {};
    const note = String((req.body || {}).note || '').trim().slice(0, BORROW_NOTE_MAX);
    if (!['book', 'movie'].includes(kind) || !Number.isInteger(ref)) return res.status(400).json({ error: 'Choose a book or movie.' });
    const [sharers] = await db.promise().query(selectLibrarySharers, [req.user.id, req.user.id]);
    const ids = [...new Set(sharers.map((r) => r.user_id))];
    if (!ids.length) return res.status(404).json({ error: 'That item is not shared with you.' });
    const [rows] = await library.promise().query(kind === 'book' ? selectBookForBorrow : selectMovieForBorrow, [ref, ids]);
    const item = rows[0];
    if (!item) return res.status(404).json({ error: 'That item is not shared with you.' });
    if (item.io !== 1 || item.lost) return res.status(409).json({ error: 'That item is out right now.' });
    const [dup] = await db.promise().query(selectPendingDuplicate, [req.user.id, item.user_id, kind, item.title]);
    if (dup.length) return res.status(409).json({ error: 'You already asked for this one.' });
    const [[cnt]] = await db.promise().query(countPendingByRequester, [req.user.id]);
    if (cnt.n >= BORROW_PENDING_MAX) return res.status(429).json({ error: 'You have too many open requests. Cancel some first.' });
    await db.promise().query(insertBorrow, [item.user_id, req.user.id, kind, item.id, item.title, note]);
    return res.status(201).json({ message: 'Request sent.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /church/borrow/:user_id  ->  { incoming: [...], outgoing: [...] }
router.get('/borrow/:user_id', async (req, res) => {
  try {
    const [inc] = await db.promise().query(selectIncoming, [req.user.id]);
    const [out] = await db.promise().query(selectOutgoing, [req.user.id]);
    const names = await personName([...new Set([...inc.map((r) => r.requester_id), ...out.map((r) => r.user_id)])]);
    return res.json({
      incoming: inc.map((r) => ({ id: r.id, from: names.get(r.requester_id) || 'Someone', kind: r.kind, title: r.title, note: r.note, status: r.status, createdAt: r.createdAt })),
      outgoing: out.map((r) => ({ id: r.id, to: names.get(r.user_id) || 'Someone', kind: r.kind, title: r.title, status: r.status, createdAt: r.createdAt })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /church/borrow/answer/:user_id   { id, accept }   the owner answers a pending request
router.post('/borrow/answer/:user_id', async (req, res) => {
  try {
    const { id, accept } = req.body || {};
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Choose a request.' });
    const [r] = await db.promise().query(answerBorrow, [accept ? 'accepted' : 'declined', id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Request not found.' });
    return res.json({ message: accept ? 'Accepted.' : 'Declined.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /church/borrow/cancel/:user_id   { id }   the asker withdraws their own pending request
router.post('/borrow/cancel/:user_id', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Choose a request.' });
    const [r] = await db.promise().query(cancelBorrow, [id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Request not found.' });
    return res.json({ message: 'Cancelled.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /church/borrow/clear/:user_id   { id }   remove an answered request from either side's list
router.post('/borrow/clear/:user_id', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Choose a request.' });
    await db.promise().query(clearBorrow, [id, req.user.id, req.user.id]);
    return res.json({ message: 'Cleared.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /church/contacts/:user_id
// Live list for the Contacts page: nothing is copied into anyone's contacts table, so a person
// who leaves, is removed, switches sharing off or whose church is suspended is gone at once.
// Only: church name, first/last name, account email, the phone and address they chose to share.
// No user ids. One entry per person (church names joined if they share several churches).
router.get('/contacts/:user_id', async (req, res) => {
  try {
    const [rows] = await db.promise().query(selectContactSharers, [req.user.id, req.user.id]);
    if (!rows.length) return res.json({ results: [] });
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const [users] = await gateway.promise().query('SELECT id, firstName, lastName, email FROM users WHERE id IN (?)', [ids]);
    const byId = new Map(users.map((u) => [u.id, u]));
    const seen = new Map();
    for (const r of rows) {
      const u = byId.get(r.user_id);
      if (!u) continue;
      const prev = seen.get(r.user_id);
      if (prev) { if (!prev.churches.includes(r.churchName)) prev.churches.push(r.churchName); continue; }
      seen.set(r.user_id, {
        key: `church-${r.memberId}`,
        firstName: u.firstName, lastName: u.lastName, email: u.email || '',
        phoneNum: r.contactPhone || '', address: r.contactAddress || '',
        churches: [r.churchName],
      });
    }
    const results = [...seen.values()]
      .map((x) => ({ ...x, church: x.churches.join(', ') }))
      .map(({ churches, ...rest }) => rest)
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
    return res.json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Announcements ──────────────────────────────────────────────────────────────
const TITLE_MAX = 150;
const BODY_MAX = 4000;

// GET /church/:church_id/announcements/:user_id
router.get('/:church_id/announcements/:user_id', requireChurch('announcements.view'), async (req, res) => {
  try {
    const [rows] = await db.promise().query(selectAnnouncements, [req.church.id]);
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const names = new Map();
    if (ids.length) {
      const [users] = await gateway.promise().query('SELECT id, firstName, lastName FROM users WHERE id IN (?)', [ids]);
      for (const u of users) names.set(u.id, `${u.firstName} ${u.lastName}`.trim());
    }
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
    return res.status(500).json({ error: err.message });
  }
});

function readAnnouncement(req, res) {
  const title = clean(req.body.title);
  const body = clean(req.body.body);
  if (!title) { bad(res, 'A title is required'); return null; }
  if (title.length > TITLE_MAX) { bad(res, `Title must be ${TITLE_MAX} characters or fewer`); return null; }
  if (body.length > BODY_MAX) { bad(res, `Message must be ${BODY_MAX} characters or fewer`); return null; }
  return { title, body };
}

// POST /church/:church_id/announcements/post/:user_id   { title, body }
router.post('/:church_id/announcements/post/:user_id', requireChurch('announcements.post'), async (req, res) => {
  const a = readAnnouncement(req, res);
  if (!a) return undefined;
  try {
    const [r] = await db.promise().query(insertAnnouncement, [req.church.id, req.user.id, a.title, a.body]);
    return res.status(201).json({ message: 'Announcement posted', announcementId: r.insertId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /church/:church_id/announcements/edit/:user_id   { announcementId, title, body }
router.post('/:church_id/announcements/edit/:user_id', requireChurch('announcements.post'), async (req, res) => {
  const a = readAnnouncement(req, res);
  if (!a) return undefined;
  try {
    const [r] = await db.promise().query(updateAnnouncement, [a.title, a.body, Number(req.body.announcementId), req.church.id]);
    if (!r.affectedRows) return notFound(res);
    return res.json({ message: 'Announcement saved' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /church/:church_id/announcements/delete/:user_id   { announcementId }
router.post('/:church_id/announcements/delete/:user_id', requireChurch('announcements.post'), async (req, res) => {
  try {
    const [r] = await db.promise().query(deleteAnnouncement, [Number(req.body.announcementId), req.church.id]);
    if (!r.affectedRows) return notFound(res);
    return res.json({ message: 'Announcement deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
