/**
 * utils/mfaDevices.js - "remember this device for 30 days".
 *
 * After a good second step the person may ask to be remembered. The server makes a
 * random 256-bit token, keeps only its SHA-256 hash (mfa_trusted_devices) and gives
 * the token to the browser, which sends it back with the password at sign-in. A known
 * token for that user that has not expired skips the second step. The password is
 * ALWAYS still required.
 *
 * Forgotten (deleted) when the person: turns two-step off, changes the phone, or
 * presses "Forget my devices". Deleting the account removes them too (foreign key).
 */
const crypto = require('crypto');
const { owenenterprises: db } = require('../db/db');

const DAYS = 30;
const MAX_PER_USER = 10;
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const p = () => db.promise();

async function isTrusted(userId, token) {
  if (!token || typeof token !== 'string' || token.length < 32 || token.length > 200) return false;
  const [rows] = await p().query(
    'SELECT id FROM mfa_trusted_devices WHERE user_id=? AND tokenHash=? AND expiresAt > NOW()', [userId, hash(token)]);
  if (!rows || !rows[0]) return false;
  await p().query('UPDATE mfa_trusted_devices SET lastUsedAt=NOW() WHERE id=?', [rows[0].id]);
  return true;
}

/** Creates a device and returns the raw token (shown to the browser once). */
async function createDevice(userId, label = '') {
  await p().query('DELETE FROM mfa_trusted_devices WHERE user_id=? AND expiresAt <= NOW()', [userId]);
  // Keep the newest MAX_PER_USER - 1, then add the new one.
  await p().query(
    `DELETE FROM mfa_trusted_devices WHERE user_id=? AND id NOT IN (
       SELECT id FROM (SELECT id FROM mfa_trusted_devices WHERE user_id=? ORDER BY id DESC LIMIT ?) keep)`,
    [userId, userId, MAX_PER_USER - 1]);
  const token = crypto.randomBytes(32).toString('hex');
  await p().query(
    `INSERT INTO mfa_trusted_devices (user_id, tokenHash, label, expiresAt)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ${DAYS} DAY))`,
    [userId, hash(token), String(label).slice(0, 120)]);
  return token;
}

async function countDevices(userId) {
  const [[r]] = await p().query('SELECT COUNT(*) AS n FROM mfa_trusted_devices WHERE user_id=? AND expiresAt > NOW()', [userId]);
  return r.n;
}

const forgetAll = (userId) => p().query('DELETE FROM mfa_trusted_devices WHERE user_id=?', [userId]);

module.exports = { isTrusted, createDevice, countDevices, forgetAll, DAYS };
