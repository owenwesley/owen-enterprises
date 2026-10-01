#!/usr/bin/env node
/**
 * db/makeAdmin.js — promote an existing user to the admin role.
 *
 *   node db/makeAdmin.js <userName>            promote to admin
 *   node db/makeAdmin.js <userName> revoke     demote back to patient
 *   node db/makeAdmin.js --list                show current admins
 *
 * There is no HTTP endpoint or UI for this, on purpose: it is the one step
 * that has to happen outside the app, so a bug or a stolen session can never
 * mint its own admin. Reads the same DB_* settings from .env as the server.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const [arg, action] = process.argv.slice(2);
  if (!arg) {
    console.log('Usage: node db/makeAdmin.js --list | <userName> [revoke]');
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
        `SELECT id, userName, firstName, lastName, email FROM users WHERE role = 'admin' ORDER BY id`
      );
      if (rows.length === 0) console.log('No admin accounts yet.');
      else console.table(rows);
      return;
    }

    const newRole = action === 'revoke' ? 'patient' : 'admin';
    const [current] = await conn.query('SELECT role FROM users WHERE userName = ?', [arg]);
    if (current.length === 0) {
      console.error(`No user with username "${arg}".`);
      process.exitCode = 1;
      return;
    }
    if (action === 'revoke' && current[0].role !== 'admin') {
      console.error(`"${arg}" is not currently an admin.`);
      process.exitCode = 1;
      return;
    }
    await conn.query('UPDATE users SET role = ? WHERE userName = ?', [newRole, arg]);
    console.log(`${arg}: role = ${newRole}`);
  } finally {
    await conn.end();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
