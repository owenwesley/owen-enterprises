/**
 * routes/mfa.js  (mounted as /auth/mfa, BEFORE /auth)
 *
 * Two-step sign-in by TEXT MESSAGE (Twilio Verify, US and Canada numbers), with
 * recovery codes and "remember this device for 30 days".
 *
 * Sign-in step 2 (public; needs the short-lived mfaToken that /auth/signin returns):
 *   POST /auth/mfa/send     {mfaToken}                         texts a new code
 *   POST /auth/mfa/verify   {mfaToken, code, rememberDevice}   code = the text-message code or a
 *                                                              recovery code; answers {results, token, deviceToken?}
 * Managing it (signed in):
 *   GET  /auth/mfa/status
 *   POST /auth/mfa/phone/start    {phone, password?}   texts a code to a NEW number (password needed if already on)
 *   POST /auth/mfa/phone/confirm  {code}               turns it on; returns 8 recovery codes the first time
 *   POST /auth/mfa/code/send                           texts a code to the number on file (used before turning off)
 *   POST /auth/mfa/disable        {password, code}
 *   POST /auth/mfa/devices/forget
 *
 * People who enrolled with an authenticator app before the switch can still sign in with
 * its 6-digit code until they move to a phone (phone/start + phone/confirm).
 *
 * Limits (in memory, a restart clears them): 5 wrong codes -> 15 minutes locked;
 * at most 5 texts per person per 15 minutes and 30 per address per hour (each text costs money).
 */
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { owenenterprises: db } = require('../db/db');
const authMiddleware = require('../middleware/auth');
const { selectUser } = require('../db/sql/users');
const { verifyTotp, encryptSecret, decryptSecret } = require('../utils/totp');
const sms = require('../utils/smsVerify');
const devices = require('../utils/mfaDevices');
const { serverError } = require('../utils/serverError');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'owenenterprises_secret_change_in_prod';
const p = () => db.promise();

// ── rate limits ─────────────────────────────────────────────────────────────
const MAX_MISSES = 5, LOCK_MS = 15 * 60 * 1000;
const misses = new Map();   // userId -> { n, until }
const sends = new Map();    // key -> [timestamps]
function lockedFor(id) {
  const m = misses.get(id);
  return m && m.until > Date.now() ? Math.ceil((m.until - Date.now()) / 60000) : 0;
}
function miss(id) {
  const m = misses.get(id) || { n: 0, until: 0 };
  if (m.until && m.until <= Date.now()) { m.n = 0; m.until = 0; }
  m.n += 1;
  if (m.n >= MAX_MISSES) m.until = Date.now() + LOCK_MS;
  misses.set(id, m);
}
function sendAllowed(key, max, windowMs) {
  const now = Date.now();
  const list = (sends.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { sends.set(key, list); return false; }
  list.push(now); sends.set(key, list); return true;
}
// (The per-address limit is skipped with the test provider so repeated test runs are not blocked.)
const mayText = (userId, ip) =>
  sendAllowed(`u${userId}`, 5, 15 * 60 * 1000) && (sms.isMock() || sendAllowed(`ip${ip}`, 30, 60 * 60 * 1000));

// ── helpers ─────────────────────────────────────────────────────────────────
const hashCode = (c) => crypto.createHash('sha256').update(String(c).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');
function newRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
async function getMfa(userId) {
  const [rows] = await p().query('SELECT * FROM user_mfa WHERE user_id=?', [userId]);
  return rows && rows[0];
}
const methodOf = (row) => (row && row.phoneEnc ? 'sms' : row && row.secretEnc ? 'authenticator' : null);
const failureMessage = (reason) => reason === 'not_configured'
  ? [503, 'Text messages are not set up on this server yet.']
  : reason === 'rate_limited'
    ? [429, 'Too many texts were requested. Please wait a few minutes.']
    : [502, 'The text message could not be sent. Please try again.'];

/** Sends a text to the number on file for this row. Returns null on success or [status, message]. */
async function textCode(userId, row, ip) {
  if (!mayText(userId, ip)) return [429, 'Too many texts were requested. Please wait a few minutes.'];
  const r = await sms.startVerification(decryptSecret(row.phoneEnc));
  return r.ok ? null : failureMessage(r.reason);
}

/** True if `code` is an unused recovery code (consumed), or the right code for the person's method. */
async function checkCode(userId, row, code) {
  const c = String(code || '').trim();
  if (/^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/.test(c) && !/^[0-9]{6}$/.test(c)) {
    const [r] = await p().query(
      'UPDATE mfa_recovery_codes SET usedAt=NOW() WHERE user_id=? AND codeHash=? AND usedAt IS NULL', [userId, hashCode(c)]);
    return r.affectedRows === 1;
  }
  if (row.phoneEnc) return sms.checkVerification(decryptSecret(row.phoneEnc), c);
  if (row.secretEnc) {
    const counter = verifyTotp(decryptSecret(row.secretEnc), c, row.lastCounter);
    if (counter === null) return false;
    const [r] = await p().query('UPDATE user_mfa SET lastCounter=? WHERE user_id=? AND lastCounter<?', [counter, userId, counter]);
    return r.affectedRows === 1;
  }
  return false;
}

function readMfaToken(token) {
  try {
    const payload = jwt.verify(String(token || ''), SECRET);
    return payload.purpose === 'mfa' ? payload : null;
  } catch { return null; }
}
const expired = (res) => res.status(401).json({ error: 'Sign-in expired. Enter your username and password again.' });

// ── sign-in step 2 ──────────────────────────────────────────────────────────
router.post('/send', async (req, res) => {
  const payload = readMfaToken((req.body || {}).mfaToken);
  if (!payload) return expired(res);
  try {
    const row = await getMfa(payload.id);
    if (!row || !row.enabled) return expired(res);
    if (methodOf(row) !== 'sms') return res.json({ sent: false, method: 'authenticator' });
    const fail = await textCode(payload.id, row, req.ip);
    if (fail) return res.status(fail[0]).json({ error: fail[1] });
    return res.json({ sent: true, method: 'sms', phoneHint: row.phoneLast4 });
  } catch (e) { return res.status(500).json({ error: 'Could not send the code.' }); }
});

router.post('/verify', async (req, res) => {
  const { mfaToken, code, rememberDevice } = req.body || {};
  const payload = readMfaToken(mfaToken);
  if (!payload) return expired(res);
  try {
    const wait = lockedFor(payload.id);
    if (wait) return res.status(429).json({ error: `Too many wrong codes. Try again in ${wait} minute(s).` });
    const row = await getMfa(payload.id);
    if (!row || !row.enabled) return expired(res);
    if (!(await checkCode(payload.id, row, code))) {
      miss(payload.id);
      return res.status(400).json({ error: 'That code is not right.' });
    }
    misses.delete(payload.id);
    const [users] = await p().query(selectUser + ' WHERE id=?', [payload.id]);
    if (!users || !users[0]) return expired(res);
    const { password: _pw, ...safeUser } = users[0];
    const token = require('./auth').signToken(safeUser);
    const out = { results: [safeUser], token };
    if (rememberDevice === true) {
      out.deviceToken = await devices.createDevice(payload.id, String(req.headers['user-agent'] || ''));
    }
    return res.json(out);
  } catch (e) { return res.status(500).json({ error: 'Could not check the code.' }); }
});

// ── managing it (signed in) ─────────────────────────────────────────────────
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const row = await getMfa(req.user.id);
    const on = Boolean(row && row.enabled);
    const [[left]] = await p().query('SELECT COUNT(*) AS n FROM mfa_recovery_codes WHERE user_id=? AND usedAt IS NULL', [req.user.id]);
    return res.json({ results: {
      enabled: on,
      method: on ? methodOf(row) : null,
      phoneLast4: on && row.phoneEnc ? row.phoneLast4 : '',
      recoveryCodesLeft: on ? left.n : 0,
      trustedDevices: on ? await devices.countDevices(req.user.id) : 0,
      textMessagesAvailable: sms.configured(),
    } });
  } catch (e) { return serverError(res, e); }
});

router.post('/phone/start', authMiddleware, async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    const number = sms.normalizePhone(phone);
    if (!number) return res.status(400).json({ error: 'Enter a US or Canadian phone number, like (702) 555-0123.' });
    const row = await getMfa(req.user.id);
    if (row && row.enabled) { // changing an existing method: the password is needed again
      const [users] = await p().query('SELECT password FROM users WHERE id=?', [req.user.id]);
      if (!(users && users[0] && await bcrypt.compare(String(password || ''), users[0].password))) {
        return res.status(400).json({ error: 'Password is not right.' });
      }
    }
    if (!mayText(req.user.id, req.ip)) return res.status(429).json({ error: 'Too many texts were requested. Please wait a few minutes.' });
    const r = await sms.startVerification(number);
    if (!r.ok) { const f = failureMessage(r.reason); return res.status(f[0]).json({ error: f[1] }); }
    await p().query(
      // secretEnc is given explicitly: databases made before the switch to text messages
      // have it NOT NULL with no default.
      `INSERT INTO user_mfa (user_id, secretEnc, pendingPhoneEnc) VALUES (?, '', ?)
       ON DUPLICATE KEY UPDATE pendingPhoneEnc=VALUES(pendingPhoneEnc)`, [req.user.id, encryptSecret(number)]);
    return res.json({ message: 'Code sent.', phoneLast4: number.slice(-4) });
  } catch (e) { return serverError(res, e); }
});

router.post('/phone/confirm', authMiddleware, async (req, res) => {
  try {
    const row = await getMfa(req.user.id);
    if (!row || !row.pendingPhoneEnc) return res.status(400).json({ error: 'Start by entering your phone number.' });
    const wait = lockedFor(req.user.id);
    if (wait) return res.status(429).json({ error: `Too many wrong codes. Try again in ${wait} minute(s).` });
    const number = decryptSecret(row.pendingPhoneEnc);
    if (!(await sms.checkVerification(number, (req.body || {}).code))) {
      miss(req.user.id);
      return res.status(400).json({ error: 'That code is not right.' });
    }
    misses.delete(req.user.id);
    const wasOn = Boolean(row.enabled);
    await p().query(
      `UPDATE user_mfa SET phoneEnc=?, phoneLast4=?, pendingPhoneEnc='', secretEnc='', lastCounter=0, enabled=1 WHERE user_id=?`,
      [encryptSecret(number), number.slice(-4), req.user.id]);
    if (wasOn) await devices.forgetAll(req.user.id); // a new number means nobody stays trusted
    let recoveryCodes;
    if (!wasOn) {
      recoveryCodes = newRecoveryCodes();
      await p().query('DELETE FROM mfa_recovery_codes WHERE user_id=?', [req.user.id]);
      for (const c of recoveryCodes) await p().query('INSERT INTO mfa_recovery_codes (user_id, codeHash) VALUES (?, ?)', [req.user.id, hashCode(c)]);
    }
    return res.json({ message: 'Two-step sign-in is on.', ...(recoveryCodes ? { recoveryCodes } : {}) });
  } catch (e) { return serverError(res, e); }
});

router.post('/code/send', authMiddleware, async (req, res) => {
  try {
    const row = await getMfa(req.user.id);
    if (!row || !row.enabled || methodOf(row) !== 'sms') return res.status(400).json({ error: 'No phone number is set up.' });
    const fail = await textCode(req.user.id, row, req.ip);
    if (fail) return res.status(fail[0]).json({ error: fail[1] });
    return res.json({ sent: true });
  } catch (e) { return serverError(res, e); }
});

router.post('/disable', authMiddleware, async (req, res) => {
  try {
    const { password, code } = req.body || {};
    const row = await getMfa(req.user.id);
    if (!row || !row.enabled) return res.status(400).json({ error: 'Two-step sign-in is not on.' });
    const wait = lockedFor(req.user.id);
    if (wait) return res.status(429).json({ error: `Too many wrong attempts. Try again in ${wait} minute(s).` });
    const [users] = await p().query('SELECT password FROM users WHERE id=?', [req.user.id]);
    const okPw = users && users[0] && await bcrypt.compare(String(password || ''), users[0].password);
    if (!okPw || !(await checkCode(req.user.id, row, code))) {
      miss(req.user.id);
      return res.status(400).json({ error: 'Password or code is not right.' });
    }
    misses.delete(req.user.id);
    await devices.forgetAll(req.user.id);
    await p().query('DELETE FROM mfa_recovery_codes WHERE user_id=?', [req.user.id]);
    await p().query('DELETE FROM user_mfa WHERE user_id=?', [req.user.id]);
    return res.json({ message: 'Two-step sign-in is off.' });
  } catch (e) { return serverError(res, e); }
});

router.post('/devices/forget', authMiddleware, async (req, res) => {
  try { await devices.forgetAll(req.user.id); return res.json({ message: 'All remembered devices were forgotten.' }); }
  catch (e) { return serverError(res, e); }
});

module.exports = router;
