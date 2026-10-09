/**
 * routes/adminChurches.js  (mounted at /admin/churches by routes/admin.js, which
 * puts requireAdmin in front)
 *
 * The web version of `node db/approveChurch.js`; the script still works.
 *
 *   GET    /admin/churches               every church, owner, member counts (never an email or join code)
 *   POST   /admin/churches/:id/status    { status: pending|approved|rejected|suspended }
 *   DELETE /admin/churches/:id           delete the church and its member rows
 *
 * Rejecting or suspending marks every non-owner member 'removed' and switches
 * library sharing off for everyone in the church, so a later re-approval does not
 * quietly bring people (or their shared catalog) back. Putting a church back to
 * pending or approving it removes nobody.
 */
const express = require('express');
const { church: db, owenenterprises: gateway } = require('../db/db');
const { requireAdmin } = require('../middleware/admin');

const router = express.Router();
const VALID_STATUS = new Set(['pending', 'approved', 'rejected', 'suspended']);

router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT c.id, c.name, c.status, c.createdAt,
              COALESCE(SUM(m.status='active'), 0)  AS active,
              COALESCE(SUM(m.status='pending'), 0) AS pending,
              MAX(CASE WHEN m.role='owner' THEN m.user_id END) AS ownerId
         FROM churches c LEFT JOIN members m ON m.church_id = c.id
        GROUP BY c.id
        ORDER BY FIELD(c.status,'pending','approved','suspended','rejected'), c.id`);
    const ids = [...new Set(rows.map((r) => r.ownerId).filter(Boolean))];
    const owners = new Map();
    if (ids.length) {
      const [users] = await gateway.promise().query(
        'SELECT id, userName, firstName, lastName FROM users WHERE id IN (?)', [ids]);
      for (const u of users) owners.set(u.id, u);
    }
    const results = rows.map((r) => {
      const o = owners.get(r.ownerId);
      return {
        id: r.id,
        name: r.name,
        status: r.status,
        createdAt: r.createdAt,
        active: Number(r.active),
        pending: Number(r.pending),
        ownerUserName: o ? o.userName : '',
        ownerName: o ? `${o.firstName} ${o.lastName}`.trim() : '',
      };
    });
    return res.json({ results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUS.has(status)) {
    return res.status(400).json({ error: 'status must be pending, approved, rejected or suspended' });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: 'No church with that id' });
  let conn;
  try {
    conn = await db.promise().getConnection();
    await conn.beginTransaction();
    const [r] = await conn.query('UPDATE churches SET status=? WHERE id=?', [status, id]);
    if (!r.affectedRows) { await conn.rollback(); return res.status(404).json({ error: 'No church with that id' }); }
    let removedMembers = 0;
    if (status === 'rejected' || status === 'suspended') {
      const [rm] = await conn.query(
        `UPDATE members SET status='removed', shareLibrary=0, shareContact=0, contactPhone='', contactAddress='' WHERE church_id=? AND role<>'owner' AND status<>'removed'`, [id]);
      removedMembers = rm.affectedRows;
      await conn.query(`UPDATE members SET shareLibrary=0, shareContact=0, contactPhone='', contactAddress='' WHERE church_id=?`, [id]);
    }
    await conn.commit();
    return res.json({ message: `Church status set to ${status}`, removedMembers });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch { /* connection gone */ } }
    return res.status(500).json({ error: e.message });
  } finally {
    if (conn) conn.release();
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: 'No church with that id' });
  try {
    const [r] = await db.promise().query('DELETE FROM churches WHERE id=?', [id]);   // members go with it (ON DELETE CASCADE)
    if (!r.affectedRows) return res.status(404).json({ error: 'No church with that id' });
    return res.json({ message: 'Church deleted' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
