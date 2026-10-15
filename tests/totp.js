#!/usr/bin/env node
/**
 * tests/totp.js  (npm run check:totp)  - 1.13.7
 *
 * Authenticator-app (TOTP) two-step sign-in against the RUNNING server, plus the pure functions.
 * Start the server with the text-message TEST provider (needed for the "switch to a phone" part):
 *
 *     MFA_SMS_PROVIDER=mock npm start
 *
 * Covers: otplib maths and drift window, AES-256-GCM at rest (AAD, tampering, old format),
 * enrolment (QR, pending secret, confirm), one-time use of a code, older steps refused,
 * lockout, recovery code, audit records (who/when/IP, never a code or secret), method switch,
 * reset. Redis behaviour has its own suite (check:mfaredis). Creates testtotp_<time>_* users and removes them.
 */
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const PW = 'Mfa-Pass-123!';
const stamp = Date.now();
const names = ['a', 'b', 'c', 'd'].map((x) => `testtotp_${stamp}_${x}`);
let passed = 0, failed = 0;
const check = (l, c, d) => { c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}${d ? '  -> ' + d : ''}`)); };
const section = (t) => console.log(`\n${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbs = require('../db/db');
const totp = require('../utils/totp');
const mfaCrypto = require('../utils/mfaCrypto');
const q = async (sql, params) => (await dbs.owenenterprises.promise().query(sql, params))[0];
const STEP = 30000;
const codeFor = (secret, steps = 0) => totp.codeAt(secret, Date.now() + steps * STEP);
const wrongCodeFor = (secret) => {
  const ok = new Set([-1, 0, 1].map((d) => codeFor(secret, d)));
  for (let n = 0; ; n++) { const c = String(n).padStart(6, '0'); if (!ok.has(c)) return c; }
};
// Do not start a check just before a 30-second step ends.
async function settle() { const m = Date.now() % STEP; if (m > 24000) await sleep(STEP - m + 400); }

async function api(method, url, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json: json === null ? {} : json, headers: res.headers };
}
async function makeUser(userName) {
  const up = await api('POST', '/auth/signup', { body: { firstName: 'Totp', lastName: 'Test', userName, email: `${userName}@example.invalid`, password: PW } });
  if (up.status !== 201) throw new Error(`signup failed: ${up.status}`);
  const r = await api('POST', '/auth/signin', { body: { userName, password: PW } });
  return { name: userName, token: r.json.token, id: r.json.results[0].id };
}
const signinToken = async (u) => (await api('POST', '/auth/signin', { body: { userName: u.name, password: PW } })).json;
const verify = (mfaToken, code, extra = {}) => api('POST', '/auth/mfa/verify', { body: { mfaToken, code, ...extra } });
async function enrol(u, steps = -1) {
  const s = await api('POST', '/auth/mfa/totp/start', { token: u.token, body: {} });
  const c = await api('POST', '/auth/mfa/totp/confirm', { token: u.token, body: { code: codeFor(s.json.secret, steps) } });
  if (c.status !== 200) throw new Error(`enrol failed ${c.status} ${JSON.stringify(c.json)}`);
  return { secret: s.json.secret, recovery: c.json.recoveryCodes };
}
const auditRows = (id, action) => q('SELECT * FROM audit_log WHERE user_id=? AND action=? ORDER BY id', [id, action]);

async function main() {
  console.log(`TOTP check against ${BASE}`);
  try {
    section('The maths (otplib) and the drift window');
    const s0 = totp.generateSecret();
    check('a secret is 32 base32 characters (160 bits)', /^[A-Z2-7]{32}$/.test(s0), s0);
    const now = Date.now();
    check('the current code is accepted', totp.checkCode(s0, codeFor(s0, 0), now).valid);
    const prev = totp.checkCode(s0, totp.codeAt(s0, now - STEP), now), next = totp.checkCode(s0, totp.codeAt(s0, now + STEP), now);
    check('one step either side is accepted (phone clock drift)', prev.valid && prev.delta === -1 && next.valid && next.delta === 1);
    check('two steps away is refused', !totp.checkCode(s0, totp.codeAt(s0, now - 2 * STEP), now).valid && !totp.checkCode(s0, totp.codeAt(s0, now + 2 * STEP), now).valid);
    check('it names the time step (what the one-time rule stores)', totp.checkCode(s0, codeFor(s0, 0), now).step === totp.timeStepAt(now));
    check('malformed input is "not valid", never an exception',
      ['', '12345', '1234567', 'abcdef', '12 34', null, undefined, {}].every((x) => totp.checkCode(s0, x, now).valid === false));
    check('a spaced code (123 456) is accepted', (() => { const c = codeFor(s0, 0); return totp.checkCode(s0, `${c.slice(0, 3)} ${c.slice(3)}`, now).valid; })());
    check('RFC 6238 test vector (SHA-1, T=59 s) gives 94287082 -> 287082',
      totp.codeAt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000) === '287082');
    check('otpauth link carries issuer, 6 digits, 30 s', (() => { const u = totp.otpauthUri(s0, 'a@b.c'); return u.startsWith('otpauth://totp/OwenEnterprises:') && /digits=6/.test(u) && /period=30/.test(u) && u.includes(`secret=${s0}`); })());

    section('Encryption at rest (AES-256-GCM)');
    const enc = totp.encryptSecret(s0);
    check('ciphertext is versioned and does not contain the secret', enc.startsWith('v2.') && !enc.includes(s0));
    check('it decrypts back', totp.decryptSecret(enc) === s0);
    check('two encryptions of the same secret differ (fresh random IV)', totp.encryptSecret(s0) !== enc);
    const parts = enc.split('.'); const bad = Buffer.from(parts[3], 'base64'); bad[0] ^= 1;
    check('a changed ciphertext is rejected (integrity)', (() => { try { totp.decryptSecret([parts[0], parts[1], parts[2], bad.toString('base64')].join('.')); return false; } catch { return true; } })());
    check('a ciphertext made for another purpose is rejected (AAD)', (() => { try { totp.decryptSecret(mfaCrypto.encrypt(s0, 'phone-number')); return false; } catch { return true; } })());
    check('the pre-1.13.7 format (3 parts, no AAD) still decrypts', (() => {
      const key = crypto.createHash('sha256').update(process.env.MFA_KEY || process.env.JWT_SECRET || 'owenenterprises_secret_change_in_prod').digest();
      const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const e = Buffer.concat([c.update(s0, 'utf8'), c.final()]);
      return totp.decryptSecret([iv, c.getAuthTag(), e].map((b) => b.toString('base64')).join('.')) === s0;
    })());

    const made = []; for (const n of names) made.push(await makeUser(n));
    const [UA, UB, UC, UD] = made;

    section('Setting up');
    let r = await api('POST', '/auth/mfa/totp/start', { body: {} });
    check('start needs sign-in (401)', r.status === 401);
    r = await api('GET', '/auth/mfa/status', { token: UA.token });
    check('status offers the authenticator method', r.json.results && r.json.results.authenticatorAvailable === true && r.json.results.enabled === false, JSON.stringify(r.json));
    await settle();
    r = await api('POST', '/auth/mfa/totp/start', { token: UA.token, body: {} });
    const sec = r.json.secret;
    check('start returns a secret, an otpauth link and a QR image', r.status === 200 && /^[A-Z2-7]{32}$/.test(sec) && r.json.otpauthUri.startsWith('otpauth://totp/') && /^data:image\/png;base64,/.test(r.json.qrDataUrl), JSON.stringify(r.json).slice(0, 200));
    check('the response is not cacheable', /no-store/.test(r.headers.get('cache-control') || ''));
    let row = (await q('SELECT * FROM user_mfa WHERE user_id=?', [UA.id]))[0];
    check('the secret is stored ENCRYPTED and only as pending', row.pendingSecretEnc.startsWith('v2.') && !JSON.stringify(row).includes(sec) && row.secretEnc === '' && row.enabled === 0);
    r = await api('GET', '/auth/mfa/status', { token: UA.token });
    check('still off until a code from the app is confirmed', r.json.results.enabled === false);
    r = await signinToken(UA);
    check('sign-in is still one step before confirming', Boolean(r.token) && !r.mfaRequired);
    r = await api('POST', '/auth/mfa/totp/confirm', { token: UA.token, body: { code: wrongCodeFor(sec) } });
    check('a wrong code does not turn it on (400)', r.status === 400);
    r = await api('POST', '/auth/mfa/totp/confirm', { token: UA.token, body: { code: 'abcdef' } });
    check('non-digits are refused (400)', r.status === 400);
    r = await api('POST', '/auth/mfa/totp/confirm', { token: UA.token, body: { code: codeFor(sec, -1) } });
    check('the right code turns it on and returns 8 recovery codes', r.status === 200 && Array.isArray(r.json.recoveryCodes) && r.json.recoveryCodes.length === 8, JSON.stringify(r.json));
    const recovery = r.json.recoveryCodes;
    row = (await q('SELECT * FROM user_mfa WHERE user_id=?', [UA.id]))[0];
    check('pending secret moved to the live column and is readable only with the key', row.enabled === 1 && row.pendingSecretEnc === '' && totp.decryptSecret(row.secretEnc) === sec);
    check('the accepted step is recorded in MySQL (lastCounter)', Number(row.lastCounter) === totp.timeStepAt(Date.now() - STEP) || Number(row.lastCounter) === totp.timeStepAt(), String(row.lastCounter));
    r = await api('GET', '/auth/mfa/status', { token: UA.token });
    check('status: on, authenticator, 8 recovery codes left', r.json.results.enabled && r.json.results.method === 'authenticator' && r.json.results.recoveryCodesLeft === 8, JSON.stringify(r.json));

    section('Signing in with a code, once');
    let si = await signinToken(UA);
    check('sign-in now asks for a code (authenticator)', si.mfaRequired === true && si.mfaMethod === 'authenticator' && !si.token, JSON.stringify(si));
    r = await api('POST', '/auth/mfa/send', { body: { mfaToken: si.mfaToken } });
    check('nothing is texted', r.status === 200 && r.json.sent === false);
    const good = codeFor(sec, 0);
    r = await verify(si.mfaToken, good);
    check('the current code signs in', r.status === 200 && r.json.token, JSON.stringify(r.json));
    r = await verify(si.mfaToken, good);
    check('the SAME code again is refused as already used (anti-replay)', r.status === 400 && /already used/.test(r.json.error || ''), JSON.stringify(r.json));
    si = await signinToken(UA);
    r = await verify(si.mfaToken, good);
    check('...also on a brand-new sign-in attempt', r.status === 400 && /already used/.test(r.json.error || ''), JSON.stringify(r.json));
    r = await verify(si.mfaToken, codeFor(sec, -1));
    check('an OLDER step than the last accepted one is refused too', r.status === 400 && /already used/.test(r.json.error || ''), JSON.stringify(r.json));
    r = await verify(si.mfaToken, codeFor(sec, 1));
    check('the NEXT step (phone clock ahead) is accepted once', r.status === 200 && r.json.token, JSON.stringify(r.json));
    check('a replay never counts toward the lockout',
      (await (async () => { const out = []; for (let i = 0; i < 7; i++) out.push((await verify(si.mfaToken, good)).status); return out; })()).every((s) => s === 400));

    section('Recovery code');
    si = await signinToken(UA);
    r = await verify(si.mfaToken, recovery[0]);
    check('a recovery code signs in', r.status === 200 && r.json.token);
    r = await verify(si.mfaToken, recovery[0]);
    check('and only once', r.status === 400);

    section('Lockout');
    await settle();
    const eb = await enrol(UB, -1);
    si = await signinToken(UB);
    const sts = [];
    for (let i = 0; i < 6; i++) sts.push((await verify(si.mfaToken, wrongCodeFor(eb.secret))).status);
    check('5 wrong codes -> 400 each, then 429', sts.slice(0, 5).every((x) => x === 400) && sts[5] === 429, sts.join(','));
    r = await verify(si.mfaToken, codeFor(eb.secret, 0));
    check('even the right code is refused while locked', r.status === 429);

    section('Audit records (45 CFR 164.312(b))');
    const succ = await auditRows(UA.id, 'MFA_VERIFY_SUCCESS');
    check('every successful sign-in code is logged, with the user and an IP', succ.length >= 3 && succ.every((x) => x.user_id === UA.id && x.ipAddress && x.outcome === 'allowed' && x.createdAt), String(succ.length));
    const fails = await auditRows(UA.id, 'MFA_VERIFY_FAILURE');
    check('failures are logged with a reason (replay)', fails.length >= 3 && fails.some((x) => /reason=replay/.test(x.detail)) && fails.every((x) => x.outcome === 'denied'), String(fails.length));
    check('enrolment start + success are logged', (await auditRows(UA.id, 'MFA_ENROLL_START')).length === 1 && (await auditRows(UA.id, 'MFA_ENROLL_SUCCESS')).length === 1);
    check('the failed confirmation is logged', (await auditRows(UA.id, 'MFA_ENROLL_FAILURE')).length >= 1);
    const lock = await auditRows(UB.id, 'MFA_LOCKOUT');
    check('the lockout is logged once', lock.length === 1 && /too_many_failures/.test(lock[0].detail), String(lock.length));
    const everything = JSON.stringify(await q('SELECT * FROM audit_log WHERE user_id IN (?,?,?,?)', [UA.id, UB.id, UC.id, UD.id]));
    check('NO code, secret or recovery code appears in the log',
      ![sec, eb.secret, good, ...recovery, ...Object.values(totp).filter((v) => typeof v === 'string' && v.length > 20)].some((x) => everything.includes(x)));

    section('Switching to a new authenticator, then to a phone');
    // (A time step is claimed per PERSON, so each enrolment/sign-in below uses a different step.)
    await settle();
    const ec = await enrol(UC, -1);
    si = await signinToken(UC);
    r = await verify(si.mfaToken, codeFor(ec.secret, 0), { rememberDevice: true });
    const device = r.json.deviceToken;
    check('remember-this-device still works with an authenticator', r.status === 200 && Boolean(device));
    r = await api('POST', '/auth/mfa/totp/start', { token: UC.token, body: {} });
    check('setting up a NEW authenticator needs the password again (400)', r.status === 400);
    r = await api('POST', '/auth/mfa/totp/start', { token: UC.token, body: { password: PW } });
    const sec2 = r.json.secret;
    check('...and with it, it starts', r.status === 200 && sec2 && sec2 !== ec.secret);
    r = await api('POST', '/auth/mfa/totp/confirm', { token: UC.token, body: { code: codeFor(ec.secret, 1) } });
    check('the OLD secret does not confirm the new setup', r.status === 400);
    r = await api('POST', '/auth/mfa/totp/confirm', { token: UC.token, body: { code: codeFor(sec2, 1) } });
    check('the new secret does, with NO new recovery codes', r.status === 200 && !r.json.recoveryCodes, JSON.stringify(r.json));
    r = await api('POST', '/auth/signin', { body: { userName: UC.name, password: PW, deviceToken: device } });
    check('a changed method forgets remembered devices', r.json.mfaRequired === true);
    check('the replacement is logged as a reset', (await auditRows(UC.id, 'MFA_RESET')).some((x) => /method_replaced/.test(x.detail)));
    r = await api('POST', '/auth/mfa/phone/start', { token: UC.token, body: { phone: '(702) 555-0142', password: PW } });
    check('switching to a text-message phone works (test provider)', r.status === 200, JSON.stringify(r.json));
    r = await api('POST', '/auth/mfa/phone/confirm', { token: UC.token, body: { code: '123456' } });
    check('...and removes the authenticator secret', r.status === 200 && (await q('SELECT secretEnc, pendingSecretEnc FROM user_mfa WHERE user_id=?', [UC.id]))[0].secretEnc === '');
    si = await signinToken(UC);
    check('sign-in now says sms', si.mfaMethod === 'sms');

    section('Turning it off (reset)');
    await settle();
    const ed = await enrol(UD, -1);
    si = await signinToken(UD);
    r = await verify(si.mfaToken, codeFor(ed.secret, 0));
    check('(setup) UD signs in with the current code', r.status === 200);
    r = await api('POST', '/auth/mfa/disable', { token: UD.token, body: { password: 'wrong', code: codeFor(ed.secret, 1) } });
    check('turning off with a wrong password is refused', r.status === 400);
    r = await api('POST', '/auth/mfa/disable', { token: UD.token, body: { password: PW, code: codeFor(ed.secret, 0) } });
    check('turning off with a code that was just used is refused as already used', r.status === 400 && /already used/.test(r.json.error || ''), JSON.stringify(r.json));
    r = await api('POST', '/auth/mfa/disable', { token: UD.token, body: { password: PW, code: codeFor(ed.secret, 1) } });
    check('password + a fresh code turns it off', r.status === 200, JSON.stringify(r.json));
    const reset = await auditRows(UD.id, 'MFA_RESET');
    check('the reset is logged (user_disabled) with user and IP', reset.length === 1 && /user_disabled/.test(reset[0].detail) && reset[0].user_id === UD.id && reset[0].ipAddress, JSON.stringify(reset));
    check('nothing is left in user_mfa or the recovery table', (await q('SELECT 1 FROM user_mfa WHERE user_id=?', [UD.id])).length === 0 && (await q('SELECT 1 FROM mfa_recovery_codes WHERE user_id=?', [UD.id])).length === 0);
    si = await signinToken(UD);
    check('sign-in is one-step again', Boolean(si.token) && !si.mfaRequired);
  } catch (e) {
    failed++; console.log(`  ERROR  ${e.stack || e.message}`);
  } finally {
    section('Cleanup');
    const deleteUser = require('../db/maintenance/deleteUser');
    for (const n of names) { try { await deleteUser(n, true, () => {}); } catch (e) { console.log(`  could not remove ${n}: ${e.message}`); } }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
}
main();
