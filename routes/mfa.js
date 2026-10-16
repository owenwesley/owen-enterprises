/**
 * routes/mfa.js  (mounted as /auth/mfa, BEFORE /auth)   1.13.7
 *
 * Two-step sign-in with an AUTHENTICATOR APP (6-digit TOTP) or by TEXT MESSAGE (Twilio Verify, US and
 * Canada numbers), plus recovery codes and "remember this device for 30 days".
 *
 * Sign-in step 2 (public; needs the short-lived mfaToken that /auth/signin returns):
 *   POST /auth/mfa/send     {mfaToken}                         texts a new code (text-message people only)
 *   POST /auth/mfa/verify   {mfaToken, code, rememberDevice}   code = app code, text-message code or recovery code
 * Managing it (signed in):
 *   GET  /auth/mfa/status
 *   POST /auth/mfa/totp/start     {password?}  new secret + QR code (password needed if two-step is already on)
 *   POST /auth/mfa/totp/confirm   {code}       turns it on; returns 8 recovery codes the first time
 *   POST /auth/mfa/phone/start    {phone, password?}
 *   POST /auth/mfa/phone/confirm  {code}
 *   POST /auth/mfa/code/send                   texts a code to the number on file (used before turning off)
 *   POST /auth/mfa/disable        {password, code}
 *   POST /auth/mfa/devices/forget
 *
 * What protects the code check (HIPAA Security Rule, 45 CFR Part 164 Subpart C):
 *   - one-time use of every code: Redis claim of (user, time step) PLUS an atomic MySQL record of the last
 *     accepted step (user_mfa.lastCounter)                                   164.312(d) authentication
 *   - 5 wrong codes -> 15 minutes locked, kept in Redis when REDIS_URL is set; per-IP limit on failed
 *     attempts in middleware/rateLimits.js (mfaVerify)                       164.308(a)(5)(ii)(C) log-in monitoring
 *   - every success / failure / lockout / enrolment / reset is audited (utils/mfaAudit.js)   164.312(b)
 *   - secrets and phone numbers encrypted at rest, AES-256-GCM (utils/mfaCrypto.js)          164.312(a)(2)(iv)
 *   - a changed or removed method forgets every remembered device                            164.312(a)(1) access control
 */
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { owenenterprises: db } = require('../db/db');
const authMiddleware = require('../middleware/auth');
const { selectUser } = require('../db/sql/users');
const totp = require('../utils/totp');
const mfaCrypto = require('../utils/mfaCrypto');
const mfaStore = require('../utils/mfaStore');
const audit = require('../utils/mfaAudit');
const sms = require('../utils/smsVerify');
const devices = require('../utils/mfaDevices');
const { serverError } = require('../utils/serverError');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'owenenterprises_secret_change_in_prod';
const p = () => db.promise();
const { EVENTS } = audit;

const PHONE_PURPOSE = 'phone-number';
const encPhone = (n) => mfaCrypto.encrypt(n, PHONE_PURPOSE);
const decPhone = (s) => mfaCrypto.decrypt(s, PHONE_PURPOSE);   // pre-1.13.7 rows (no AAD) still decrypt

const REPLAY_MSG = 'That code was already used. Wait for your app to show a new code, then try again.';
const waitMinutes = (ms) => Math.max(1, Math.ceil(ms / 60000));
const lockMessage = (ms) => `Too many wrong codes. Try again in ${waitMinutes(ms)} minute(s).`;

// ── text-message send limits (each text costs money; in memory is fine for these) ────────────────
const sends = new Map();    // key -> [timestamps]
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
const noStore = (res) => { res.set('Cache-Control', 'no-store'); res.set('Pragma', 'no-cache'); };

/** Sends a text to the number on file for this row. Returns null on success or [status, message]. */
async function textCode(userId, row, ip) {
  if (!mayText(userId, ip)) return [429, 'Too many texts were requested. Please wait a few minutes.'];
  const r = await sms.startVerification(decPhone(row.phoneEnc));
  return r.ok ? null : failureMessage(r.reason);
}

/**
 * Anti-replay for an authenticator code. `step` is the time step the code BELONGS to (not "now"), so a
 * code cannot be reused at any moment of its window, nor an older one after a newer one was accepted.
 *   1. Redis (or memory) claim of (user, step): first caller wins, even across app processes;
 *   2. MySQL: lastCounter moves forward only, in one atomic UPDATE - this is what still holds when Redis is
 *      absent or down, and after an app restart.
 */
async function acceptTotpStep(userId, step) {
  if (!(await mfaStore.claimTimeStep(userId, step))) return false;
  const [r] = await p().query('UPDATE user_mfa SET lastCounter=? WHERE user_id=? AND lastCounter<?', [step, userId, step]);
  return r.affectedRows === 1;
}

/** A wrong code: count it (and lock at the limit), audit it. Returns the answer to send. */
async function wrongCode({ userId, ip, route, method, reason = 'bad_code', message = 'That code is not right.' }) {
  const { locked } = await mfaStore.recordFailure(userId);
  await audit.record({ event: EVENTS.VERIFY_FAILURE, userId, ip, outcome: 'failure', method, reason, route });
  if (locked) await audit.record({ event: EVENTS.LOCKOUT, userId, ip, outcome: 'failure', method, reason: 'too_many_failures', route });
  return { ok: false, status: 400, error: message };
}

/**
 * Checks a second-step code for this person: lockout first, then recovery code / text-message code /
 * authenticator code. A replayed code is refused but does not count toward the lockout.
 * @returns {Promise<{ok: true, method: string} | {ok: false, status: number, error: string}>}
 */
async function checkSecondFactor({ userId, row, code, ip, route, wrongMessage, res }) {
  const wait = await mfaStore.lockRemainingMs(userId);
  if (wait > 0) {
    await audit.record({ event: EVENTS.VERIFY_FAILURE, userId, ip, outcome: 'failure', reason: 'locked', route });
    return { ok: false, status: 429, error: lockMessage(wait) };
  }
  const c = String(code || '').trim();
  const bad = (method) => wrongCode({ userId, ip, route, method, message: wrongMessage });
  let method;

  if (/^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/.test(c)) {
    method = 'recovery';
    const [r] = await p().query(
      'UPDATE mfa_recovery_codes SET usedAt=NOW() WHERE user_id=? AND codeHash=? AND usedAt IS NULL', [userId, hashCode(c)]);
    if (r.affectedRows !== 1) return bad(method);
  } else if (row.phoneEnc) {
    method = 'sms';
    if (!(await sms.checkVerification(decPhone(row.phoneEnc), c))) return bad(method);
  } else if (row.secretEnc) {
    method = 'totp';
    const result = totp.checkCode(totp.decryptSecret(row.secretEnc), c);
    if (!result.valid) return bad(method);
    if (!(await acceptTotpStep(userId, result.step))) {
      await audit.record({ event: EVENTS.VERIFY_FAILURE, userId, ip, outcome: 'failure', method, reason: 'replay', route });
      if (res) res.locals.mfaReplay = true;   // tells the per-IP limiter this was not a wrong guess
      return { ok: false, status: 400, error: REPLAY_MSG };
    }
  } else {
    return bad('none');
  }

  await mfaStore.clearFailures(userId);
  await audit.record({ event: EVENTS.VERIFY_SUCCESS, userId, ip, outcome: 'success', method, route });
  return { ok: true, method };
}

/** Password check for sensitive changes; wrong passwords count toward the same lockout. */
async function passwordOk(userId, password) {
  const [users] = await p().query('SELECT password FROM users WHERE id=?', [userId]);
  return Boolean(users && users[0] && await bcrypt.compare(String(password || ''), users[0].password));
}

function readMfaToken(token) {
  try {
    const payload = jwt.verify(String(token || ''), SECRET);
    return payload.purpose === 'mfa' ? payload : null;
  } catch { return null; }
}
const expired = (res) => res.status(401).json({ error: 'Sign-in expired. Enter your username and password again.' });

/** Turns the person's new method on in the database tail: recovery codes the first time, forget devices if replaced. */
async function afterEnrol({ userId, ip, wasOn, method, route }) {
  if (wasOn) {
    await devices.forgetAll(userId);   // a new method means nobody stays trusted
    await audit.record({ event: EVENTS.RESET, userId, ip, outcome: 'success', method, reason: 'method_replaced', route });
  }
  await audit.record({ event: EVENTS.ENROLL_SUCCESS, userId, ip, outcome: 'success', method, route });
  if (wasOn) return undefined;
  const recoveryCodes = newRecoveryCodes();
  await p().query('DELETE FROM mfa_recovery_codes WHERE user_id=?', [userId]);
  for (const c of recoveryCodes) await p().query('INSERT INTO mfa_recovery_codes (user_id, codeHash) VALUES (?, ?)', [userId, hashCode(c)]);
  return recoveryCodes;
}

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
  } catch (e) {
    console.error('[mfa] send failed:', e && e.message);   // 1.13.9: the reason goes to the server log only
    return res.status(500).json({ error: 'Could not send the code.' });
  }
});

router.post('/verify', async (req, res) => {
  const { mfaToken, code, rememberDevice } = req.body || {};
  const payload = readMfaToken(mfaToken);
  if (!payload) return expired(res);
  try {
    const row = await getMfa(payload.id);
    if (!row || !row.enabled) return expired(res);
    const result = await checkSecondFactor({ userId: payload.id, row, code, ip: req.ip, route: '/auth/mfa/verify', res });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    const [users] = await p().query(selectUser + ' WHERE id=?', [payload.id]);
    if (!users || !users[0]) return expired(res);
    const { password: _pw, ...safeUser } = users[0];
    const token = require('./auth').signToken(safeUser);
    const out = { results: [safeUser], token };
    if (rememberDevice === true) {
      out.deviceToken = await devices.createDevice(payload.id, String(req.headers['user-agent'] || ''));
    }
    return res.json(out);
  } catch (e) {
    console.error('[mfa] verify failed:', e.message);
    return res.status(500).json({ error: 'Could not check the code.' });
  }
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
      authenticatorAvailable: true,
    } });
  } catch (e) { return serverError(res, e); }
});

// -- authenticator app --------------------------------------------------------
router.post('/totp/start', authMiddleware, async (req, res) => {
  const route = '/auth/mfa/totp/start';
  try {
    const row = await getMfa(req.user.id);
    if (row && row.enabled) { // changing an existing method: the password is needed again
      const wait = await mfaStore.lockRemainingMs(req.user.id);
      if (wait > 0) return res.status(429).json({ error: lockMessage(wait) });
      if (!(await passwordOk(req.user.id, (req.body || {}).password))) {
        await mfaStore.recordFailure(req.user.id);
        await audit.record({ event: EVENTS.ENROLL_FAILURE, userId: req.user.id, ip: req.ip, outcome: 'failure', method: 'totp', reason: 'bad_password', route });
        return res.status(400).json({ error: 'Password is not right.' });
      }
    }
    const [users] = await p().query('SELECT userName FROM users WHERE id=?', [req.user.id]);
    const secret = totp.generateSecret();
    await p().query(
      // secretEnc is given explicitly: databases made before the switch to text messages have it NOT NULL with no default.
      `INSERT INTO user_mfa (user_id, secretEnc, pendingSecretEnc) VALUES (?, '', ?)
       ON DUPLICATE KEY UPDATE pendingSecretEnc=VALUES(pendingSecretEnc)`, [req.user.id, totp.encryptSecret(secret)]);
    const uri = totp.otpauthUri(secret, (users && users[0] && users[0].userName) || `user${req.user.id}`);
    const qrDataUrl = await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
    await audit.record({ event: EVENTS.ENROLL_START, userId: req.user.id, ip: req.ip, outcome: 'success', method: 'totp', route });
    noStore(res);   // the secret must never sit in a browser or proxy cache
    return res.json({ secret, otpauthUri: uri, qrDataUrl });
  } catch (e) { return serverError(res, e); }
});

router.post('/totp/confirm', authMiddleware, async (req, res) => {
  const route = '/auth/mfa/totp/confirm';
  const userId = req.user.id;
  const fail = async (reason, error) => {
    await audit.record({ event: EVENTS.ENROLL_FAILURE, userId, ip: req.ip, outcome: 'failure', method: 'totp', reason, route });
    return res.status(400).json({ error });
  };
  try {
    const row = await getMfa(userId);
    if (!row || !row.pendingSecretEnc) return res.status(400).json({ error: 'Start by scanning the QR code.' });
    const wait = await mfaStore.lockRemainingMs(userId);
    if (wait > 0) return res.status(429).json({ error: lockMessage(wait) });
    const result = totp.checkCode(totp.decryptSecret(row.pendingSecretEnc), (req.body || {}).code);
    if (!result.valid) {
      const { locked } = await mfaStore.recordFailure(userId);
      if (locked) await audit.record({ event: EVENTS.LOCKOUT, userId, ip: req.ip, outcome: 'failure', method: 'totp', reason: 'too_many_failures', route });
      return fail('bad_code', 'That code is not right.');
    }
    // The enrolment code is "used" too: it cannot be replayed to sign in. The UPDATE is guarded so a concurrent
    // /totp/start (a different pending secret) cannot be confirmed by mistake.
    if (!(await mfaStore.claimTimeStep(userId, result.step))) return fail('replay', REPLAY_MSG);
    const wasOn = Boolean(row.enabled);
    const [upd] = await p().query(
      `UPDATE user_mfa SET secretEnc=pendingSecretEnc, pendingSecretEnc='', phoneEnc='', phoneLast4='', pendingPhoneEnc='',
              lastCounter=?, enabled=1
        WHERE user_id=? AND pendingSecretEnc=? AND lastCounter<?`, [result.step, userId, row.pendingSecretEnc, result.step]);
    if (upd.affectedRows !== 1) return fail('replay', REPLAY_MSG);
    await mfaStore.clearFailures(userId);
    const recoveryCodes = await afterEnrol({ userId, ip: req.ip, wasOn, method: 'totp', route });
    return res.json({ message: 'Two-step sign-in is on.', ...(recoveryCodes ? { recoveryCodes } : {}) });
  } catch (e) { return serverError(res, e); }
});

// -- text message -------------------------------------------------------------
router.post('/phone/start', authMiddleware, async (req, res) => {
  const route = '/auth/mfa/phone/start';
  try {
    const { phone, password } = req.body || {};
    const number = sms.normalizePhone(phone);
    if (!number) return res.status(400).json({ error: 'Enter a US or Canadian phone number, like (702) 555-0123.' });
    const row = await getMfa(req.user.id);
    if (row && row.enabled) { // changing an existing method: the password is needed again
      if (!(await passwordOk(req.user.id, password))) {
        await mfaStore.recordFailure(req.user.id);
        await audit.record({ event: EVENTS.ENROLL_FAILURE, userId: req.user.id, ip: req.ip, outcome: 'failure', method: 'sms', reason: 'bad_password', route });
        return res.status(400).json({ error: 'Password is not right.' });
      }
    }
    if (!mayText(req.user.id, req.ip)) return res.status(429).json({ error: 'Too many texts were requested. Please wait a few minutes.' });
    const r = await sms.startVerification(number);
    if (!r.ok) { const f = failureMessage(r.reason); return res.status(f[0]).json({ error: f[1] }); }
    await p().query(
      `INSERT INTO user_mfa (user_id, secretEnc, pendingPhoneEnc) VALUES (?, '', ?)
       ON DUPLICATE KEY UPDATE pendingPhoneEnc=VALUES(pendingPhoneEnc)`, [req.user.id, encPhone(number)]);
    await audit.record({ event: EVENTS.ENROLL_START, userId: req.user.id, ip: req.ip, outcome: 'success', method: 'sms', route });
    return res.json({ message: 'Code sent.', phoneLast4: number.slice(-4) });
  } catch (e) { return serverError(res, e); }
});

router.post('/phone/confirm', authMiddleware, async (req, res) => {
  const route = '/auth/mfa/phone/confirm';
  const userId = req.user.id;
  try {
    const row = await getMfa(userId);
    if (!row || !row.pendingPhoneEnc) return res.status(400).json({ error: 'Start by entering your phone number.' });
    const wait = await mfaStore.lockRemainingMs(userId);
    if (wait > 0) return res.status(429).json({ error: lockMessage(wait) });
    const number = decPhone(row.pendingPhoneEnc);
    if (!(await sms.checkVerification(number, (req.body || {}).code))) {
      const { locked } = await mfaStore.recordFailure(userId);
      await audit.record({ event: EVENTS.ENROLL_FAILURE, userId, ip: req.ip, outcome: 'failure', method: 'sms', reason: 'bad_code', route });
      if (locked) await audit.record({ event: EVENTS.LOCKOUT, userId, ip: req.ip, outcome: 'failure', method: 'sms', reason: 'too_many_failures', route });
      return res.status(400).json({ error: 'That code is not right.' });
    }
    await mfaStore.clearFailures(userId);
    const wasOn = Boolean(row.enabled);
    await p().query(
      `UPDATE user_mfa SET phoneEnc=?, phoneLast4=?, pendingPhoneEnc='', secretEnc='', pendingSecretEnc='', lastCounter=0, enabled=1 WHERE user_id=?`,
      [encPhone(number), number.slice(-4), userId]);
    const recoveryCodes = await afterEnrol({ userId, ip: req.ip, wasOn, method: 'sms', route });
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
  const route = '/auth/mfa/disable';
  const userId = req.user.id;
  try {
    const { password, code } = req.body || {};
    const row = await getMfa(userId);
    if (!row || !row.enabled) return res.status(400).json({ error: 'Two-step sign-in is not on.' });
    const wait = await mfaStore.lockRemainingMs(userId);
    if (wait > 0) return res.status(429).json({ error: lockMessage(wait) });
    // Password first, and BEFORE the code is looked at: a wrong password must not use up a good code.
    if (!(await passwordOk(userId, password))) {
      await wrongCode({ userId, ip: req.ip, route, method: methodOf(row) || '', reason: 'bad_password' });
      return res.status(400).json({ error: 'Password or code is not right.' });
    }
    const result = await checkSecondFactor({ userId, row, code, ip: req.ip, route, wrongMessage: 'Password or code is not right.', res });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    await devices.forgetAll(userId);
    await p().query('DELETE FROM mfa_recovery_codes WHERE user_id=?', [userId]);
    await p().query('DELETE FROM user_mfa WHERE user_id=?', [userId]);
    await audit.record({ event: EVENTS.RESET, userId, ip: req.ip, outcome: 'success', method: methodOf(row) || '', reason: 'user_disabled', route });
    return res.json({ message: 'Two-step sign-in is off.' });
  } catch (e) { return serverError(res, e); }
});

router.post('/devices/forget', authMiddleware, async (req, res) => {
  try { await devices.forgetAll(req.user.id); return res.json({ message: 'All remembered devices were forgotten.' }); }
  catch (e) { return serverError(res, e); }
});

module.exports = router;
