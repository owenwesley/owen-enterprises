#!/usr/bin/env node
/**
 * db/approveDoctor.js — admin tool for doctor accounts.
 *
 *   node db/approveDoctor.js --list                 doctors and their status
 *   node db/approveDoctor.js <userName>             approve
 *   node db/approveDoctor.js <userName> reject      reject
 *   node db/approveDoctor.js <userName> pending     put back to pending (suspend)
 *
 * Reads the same DB_* settings from .env as the server. There is deliberately
 * no HTTP endpoint for this yet: approval is a manual check of the licence
 * number, and nothing reachable from the internet should be able to grant it.
 * Only accounts that signed up as doctors can be changed.
 *
 * Rejecting or resetting to pending also revokes every active doctor_patients
 * link for that doctor — see the matching comment in routes/admin.js for why:
 * it's not what cuts off access today (that's requireApprovedDoctor checking
 * live status on every request), it's what stops a later re-approval of the
 * same account from silently restoring access to old patients with no new
 * consent.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const STATUS = { approve: 'approved', reject: 'rejected', pending: 'pending' };

async function main() {
  const [arg, action = 'approve'] = process.argv.slice(2);
  if (!arg || (arg !== '--list' && !STATUS[action])) {
    console.log('Usage: node db/approveDoctor.js --list | <userName> [approve|reject|pending]');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_GATEWAY || 'owenenterprises',
  });

  try {
    if (arg === '--list') {
      const [rows] = await conn.query(
        `SELECT u.id, u.userName, u.firstName, u.lastName, u.email, u.doctorStatus,
                p.licenseNumber, p.specialty, p.inviteCode
           FROM users u LEFT JOIN doctor_profiles p ON p.user_id = u.id
          WHERE u.role = 'doctor' ORDER BY u.doctorStatus, u.id`
      );
      if (rows.length === 0) console.log('No doctor accounts.');
      else console.table(rows);
      return;
    }

    const newStatus = STATUS[action];
    const [result] = await conn.query(
      `UPDATE users SET doctorStatus = ? WHERE userName = ? AND role = 'doctor'`,
      [newStatus, arg]
    );
    if (result.affectedRows === 0) {
      console.error(`No doctor account with username "${arg}".`);
      process.exitCode = 1;
      return;
    }
    console.log(`${arg}: doctorStatus = ${newStatus}`);

    if (newStatus !== 'approved') {
      const [{ id }] = (await conn.query('SELECT id FROM users WHERE userName = ?', [arg]))[0];
      const [revoke] = await conn.query(
        `UPDATE doctor_patients SET status = 'revoked' WHERE doctor_id = ? AND status = 'active'`,
        [id]
      );
      if (revoke.affectedRows > 0) {
        console.log(`  also revoked ${revoke.affectedRows} active patient link(s) — re-approval will require patients to re-link`);
      }
    }
  } finally {
    await conn.end();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
