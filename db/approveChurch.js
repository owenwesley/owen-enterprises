#!/usr/bin/env node
/**
 * db/approveChurch.js: admin tool for churches (copies db/approveDoctor.js).
 *
 *   node db/approveChurch.js --list              every church, status, owner, member counts
 *   node db/approveChurch.js <id>                approve
 *   node db/approveChurch.js <id> approve        approve
 *   node db/approveChurch.js <id> reject         reject (every non-owner member is marked removed)
 *   node db/approveChurch.js <id> suspend        suspend (every non-owner member is marked removed)
 *   node db/approveChurch.js <id> pending        put back to pending (nobody is removed)
 *   node db/approveChurch.js <id> delete         delete the church and its member rows
 *
 * Reads the same DB_* settings from .env as the server. There is deliberately
 * no web page for this yet: nothing reachable from the internet should be able
 * to approve a church. Rejecting or suspending removes the non-owner members so
 * a later re-approval does not silently bring everyone back without them
 * asking again (the same reasoning as doctor links in approveDoctor.js).
 * A church owner's account cannot be deleted until the church is deleted here.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), quiet: true });
const mysql = require('mysql2/promise');

const STATUS = { approve: 'approved', reject: 'rejected', suspend: 'suspended', pending: 'pending' };

async function main() {
  const [arg, action = 'approve'] = process.argv.slice(2);
  const isId = /^[0-9]+$/.test(arg || '');
  if (!arg || (arg !== '--list' && (!isId || (!STATUS[action] && action !== 'delete')))) {
    console.log('Usage: node db/approveChurch.js --list | <id> [approve|reject|suspend|pending|delete]');
    process.exit(1);
  }

  const base = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    port: Number(process.env.DB_PORT) || 3306,
  };
  const churchDb = process.env.DB_CHURCH || 'church';
  const gatewayDb = process.env.DB_GATEWAY || 'owenenterprises';
  const conn = await mysql.createConnection({ ...base, database: churchDb });

  try {
    if (arg === '--list') {
      const [rows] = await conn.query(
        `SELECT c.id, c.name, c.status, c.joinCode, c.createdAt,
                SUM(m.status='active') AS active, SUM(m.status='pending') AS pending,
                MAX(CASE WHEN m.role='owner' THEN m.user_id END) AS ownerId
           FROM churches c LEFT JOIN members m ON m.church_id = c.id
          GROUP BY c.id ORDER BY FIELD(c.status,'pending','approved','suspended','rejected'), c.id`);
      if (!rows.length) { console.log('No churches.'); return; }
      const ids = rows.map((r) => r.ownerId).filter(Boolean);
      const owners = new Map();
      if (ids.length) {
        const [u] = await conn.query(
          `SELECT id, userName FROM \`${gatewayDb}\`.users WHERE id IN (?)`, [ids]);
        for (const x of u) owners.set(x.id, x.userName);
      }
      for (const r of rows) {
        console.log(`#${r.id}  ${r.status.padEnd(9)} "${r.name}"  owner: ${owners.get(r.ownerId) || '?'}  ` +
          `members: ${r.active || 0} active, ${r.pending || 0} waiting  code: ${r.joinCode}`);
      }
      return;
    }

    const id = Number(arg);
    const [found] = await conn.query('SELECT id, name, status FROM churches WHERE id=?', [id]);
    if (!found.length) { console.log(`No church with id ${id}.`); process.exitCode = 1; return; }
    const c = found[0];

    if (action === 'delete') {
      await conn.query('DELETE FROM churches WHERE id=?', [id]);   // members go with it (ON DELETE CASCADE)
      console.log(`Deleted church #${id} "${c.name}" and its member rows.`);
      return;
    }

    const status = STATUS[action];
    await conn.query('UPDATE churches SET status=? WHERE id=?', [status, id]);
    let removed = 0;
    if (action === 'reject' || action === 'suspend') {
      const [r] = await conn.query(
        `UPDATE members SET status='removed', shareLibrary=0, shareContact=0, contactPhone='', contactAddress='' WHERE church_id=? AND role='member' AND status<>'removed'`, [id]);
      removed = r.affectedRows;
      await conn.query(`UPDATE members SET shareLibrary=0, shareContact=0, contactPhone='', contactAddress='' WHERE church_id=?`, [id]);
    }
    console.log(`Church #${id} "${c.name}": ${c.status} -> ${status}` +
      (removed ? `  (${removed} member(s) marked removed)` : ''));
  } finally {
    await conn.end();
  }
}

main().catch((e) => { console.error('approveChurch failed:', e.message); process.exit(1); });
