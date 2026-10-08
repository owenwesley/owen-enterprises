#!/usr/bin/env node
/**
 * tests/mfa.js  (npm run check:mfa)
 *
 * Two-step sign-in by text message, remember-this-device and the older authenticator-app
 * path, against the RUNNING server. The server must be started with the TEST provider:
 *
 *     MFA_SMS_PROVIDER=mock npm start        (no text is sent; the code is always 123456)
 *
 * Real Twilio calls are NOT exercised here. Creates testmfa_<time>_a/_b/_c/_d and removes them.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const PW = 'Mfa-Pass-123!';
const CODE = '123456';
const stamp = Date.now();
const names = ['a', 'b', 'c', 'd'].map((x) => `testmfa_${stamp}_${x}`);
let passed = 0, failed = 0;
const check = (l, c, d) => { c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}${d ? '  -> ' + d : ''}`)); };
const section = (t) => console.log(`\n${t}`);
const dbs = require('../db/db');
const totp = require('../utils/totp');
const q = async (sql, params) => (await dbs.owenenterprises.promise().query(sql, params))[0];

async function api(method, url, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json: json === null ? {} : json };
}
async function makeUser(userName) {
  const up = await api('POST', '/auth/signup', { body: { firstName: 'Mfa', lastName: 'Test', userName, email: `${userName}@example.invalid`, password: PW } });
  if (up.status !== 201) throw new Error(`signup failed: ${up.status}`);
  const r = await api('POST', '/auth/signin', { body: { userName, password: PW } });
  return { name: userName, token: r.json.token, id: r.json.results[0].id };
}
const signin = (u, deviceToken) => api('POST', '/auth/signin', { body: { userName: u.name, password: PW, ...(deviceToken ? { deviceToken } : {}) } });
async function enrol(u, phone = '(702) 555-0142') {
  const s = await api('POST', '/auth/mfa/phone/start', { token: u.token, body: { phone } });
  if (s.status !== 200) throw new Error(`phone/start ${s.status} ${JSON.stringify(s.json)} (server needs MFA_SMS_PROVIDER=mock)`);
  return api('POST', '/auth/mfa/phone/confirm', { token: u.token, body: { code: CODE } });
}

async function main() {
  console.log(`MFA (text message) check against ${BASE}`);
  try {
    const made = [];
    for (const n of names) made.push(await makeUser(n));
    const [A, B, C, D] = made;

    section('Before MFA');
    let r = await signin(A);
    check('normal sign-in returns a token', r.status === 200 && r.json.token && !r.json.mfaRequired);
    r = await api('GET', '/auth/mfa/status', { token: A.token });
    check('status: off, texts available', r.json.results && r.json.results.enabled === false && r.json.results.textMessagesAvailable === true, JSON.stringify(r.json));
    r = await api('GET', '/auth/mfa/status');
    check('status needs sign-in (401)', r.status === 401);

    section('Enrol with a phone');
    r = await api('POST', '/auth/mfa/phone/start', { token: A.token, body: { phone: '+44 20 7946 0958' } });
    check('a non US/Canada number is refused (400)', r.status === 400);
    r = await api('POST', '/auth/mfa/phone/start', { token: A.token, body: { phone: '123-456-7890' } });
    check('an impossible US number is refused (400)', r.status === 400);
    r = await api('POST', '/auth/mfa/phone/confirm', { token: A.token, body: { code: CODE } });
    check('confirm before start is refused (400)', r.status === 400);
    r = await api('POST', '/auth/mfa/phone/start', { token: A.token, body: { phone: '(702) 555-0142' } });
    check('US number accepted, code "sent"', r.status === 200 && r.json.phoneLast4 === '0142', JSON.stringify(r.json));
    r = await api('POST', '/auth/mfa/phone/confirm', { token: A.token, body: { code: '000000' } });
    check('wrong code refused (400)', r.status === 400);
    r = await api('POST', '/auth/mfa/phone/confirm', { token: A.token, body: { code: CODE } });
    check('right code turns it on with 8 recovery codes', r.status === 200 && r.json.recoveryCodes && r.json.recoveryCodes.length === 8, JSON.stringify(r.json));
    const recovery = r.json.recoveryCodes;
    const row = (await q('SELECT phoneEnc, phoneLast4, pendingPhoneEnc FROM user_mfa WHERE user_id=?', [A.id]))[0];
    check('number is stored encrypted, only last 4 visible', row && !row.phoneEnc.includes('7025550142') && row.phoneLast4 === '0142' && row.pendingPhoneEnc === '');
    r = await api('GET', '/auth/mfa/status', { token: A.token });
    check('status: on, sms, ****0142', r.json.results.enabled && r.json.results.method === 'sms' && r.json.results.phoneLast4 === '0142');

    section('Two-step sign-in');
    r = await signin(A);
    check('sign-in asks for the second step, no session token', r.json.mfaRequired === true && !r.json.token && r.json.mfaMethod === 'sms' && r.json.phoneHint === '0142', JSON.stringify(r.json));
    const mfaToken = r.json.mfaToken;
    r = await api('GET', '/auth', { token: mfaToken });
    check('the mfaToken is not a session (401)', r.status === 401);
    r = await api('POST', '/auth/tokenIsValid', { token: mfaToken });
    check('tokenIsValid says false for it', r.json === false);
    r = await api('POST', '/auth/mfa/send', { body: { mfaToken } });
    check('a text can be requested', r.status === 200 && r.json.sent === true && r.json.phoneHint === '0142', JSON.stringify(r.json));
    r = await api('POST', '/auth/mfa/send', { body: { mfaToken: 'garbage' } });
    check('send with a bad mfaToken: 401', r.status === 401);
    r = await api('POST', '/auth/mfa/verify', { body: { mfaToken, code: '999999' } });
    check('wrong code refused', r.status === 400 && !r.json.token);
    r = await api('POST', '/auth/mfa/verify', { body: { mfaToken, code: CODE } });
    check('right code gives a session token and NO device token', r.status === 200 && r.json.token && !r.json.deviceToken && !r.json.results[0].password, JSON.stringify(r.json));
    r = await api('GET', '/auth', { token: r.json.token });
    check('that token works', r.status === 200);

    section('Remember this device');
    r = await api('POST', '/auth/mfa/verify', { body: { mfaToken, code: CODE, rememberDevice: true } });
    const device = r.json.deviceToken;
    check('rememberDevice returns a device token', r.status === 200 && typeof device === 'string' && device.length === 64, JSON.stringify(r.json));
    check('only a hash of it is stored', (await q('SELECT 1 FROM mfa_trusted_devices WHERE user_id=? AND tokenHash=?', [A.id, device])).length === 0 &&
      (await q('SELECT 1 FROM mfa_trusted_devices WHERE user_id=?', [A.id])).length === 1);
    r = await signin(A, device);
    check('password + remembered device: signed in with no second step', r.status === 200 && r.json.token && !r.json.mfaRequired, JSON.stringify(r.json));
    r = await api('POST', '/auth/signin', { body: { userName: A.name, password: 'wrong-password', deviceToken: device } });
    check('a remembered device does NOT skip the password', r.status !== 200 || !r.json.token);
    r = await signin(A, 'f'.repeat(64));
    check('an unknown device token asks for the second step', r.json.mfaRequired === true);
    await enrol(B, '(416) 555-0199');
    r = await signin(B, device);
    check("another person's device token does not work", r.json.mfaRequired === true);
    await q("UPDATE mfa_trusted_devices SET expiresAt = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE user_id=?", [A.id]);
    r = await signin(A, device);
    check('an expired device token asks for the second step', r.json.mfaRequired === true);
    r = await api('POST', '/auth/mfa/verify', { body: { mfaToken: r.json.mfaToken, code: CODE, rememberDevice: true } });
    const device2 = r.json.deviceToken;
    r = await api('GET', '/auth/mfa/status', { token: A.token });
    check('status counts 1 trusted device', r.json.results.trustedDevices === 1, JSON.stringify(r.json));
    r = await api('POST', '/auth/mfa/devices/forget', { token: A.token });
    r = await signin(A, device2);
    check('after "forget devices" it asks again', r.json.mfaRequired === true);

    section('Recovery code');
    r = await signin(A); const mt2 = r.json.mfaToken;
    r = await api('POST', '/auth/mfa/verify', { body: { mfaToken: mt2, code: recovery[0] } });
    check('a recovery code signs in', r.status === 200 && r.json.token);
    r = await api('POST', '/auth/mfa/verify', { body: { mfaToken: mt2, code: recovery[0] } });
    check('and only once', r.status === 400);

    section('Change the phone');
    r = await api('POST', '/auth/mfa/phone/start', { token: A.token, body: { phone: '(702) 555-0177' } });
    check('changing needs the password (400 without it)', r.status === 400);
    r = await signin(A); r = await api('POST', '/auth/mfa/verify', { body: { mfaToken: r.json.mfaToken, code: CODE, rememberDevice: true } });
    const device3 = r.json.deviceToken;
    r = await api('POST', '/auth/mfa/phone/start', { token: A.token, body: { phone: '(702) 555-0177', password: PW } });
    check('with the password it sends to the new number', r.status === 200 && r.json.phoneLast4 === '0177');
    r = await api('POST', '/auth/mfa/phone/confirm', { token: A.token, body: { code: CODE } });
    check('confirmed, and NO new recovery codes', r.status === 200 && !r.json.recoveryCodes);
    r = await signin(A, device3);
    check('a new number forgets remembered devices', r.json.mfaRequired === true && r.json.phoneHint === '0177');

    section('Turning it off');
    r = await api('POST', '/auth/mfa/disable', { token: A.token, body: { password: 'wrong', code: CODE } });
    check('wrong password refused', r.status === 400);
    r = await api('POST', '/auth/mfa/code/send', { token: A.token });
    check('a code can be texted before turning off', r.status === 200 && r.json.sent === true);
    r = await api('POST', '/auth/mfa/disable', { token: A.token, body: { password: PW, code: CODE } });
    check('password + code turns it off', r.status === 200, JSON.stringify(r.json));
    r = await signin(A);
    check('sign-in is one-step again', r.status === 200 && r.json.token && !r.json.mfaRequired);
    check('no devices or recovery codes left', (await q('SELECT 1 FROM mfa_trusted_devices WHERE user_id=?', [A.id])).length === 0 &&
      (await q('SELECT 1 FROM mfa_recovery_codes WHERE user_id=?', [A.id])).length === 0);

    section('Rate limits');
    r = await signin(B); const mtB = r.json.mfaToken;
    let last = null;
    for (let i = 0; i < 6; i++) last = await api('POST', '/auth/mfa/verify', { body: { mfaToken: mtB, code: '999999' } });
    check('after repeated wrong codes: 429', last.status === 429, String(last.status));
    r = await api('POST', '/auth/mfa/verify', { body: { mfaToken: mtB, code: CODE } });
    check('even the right code is refused while locked', r.status === 429);
    await enrol(C, '(213) 555-0111');
    r = await signin(C); const mtC = r.json.mfaToken;
    let sends = [];
    for (let i = 0; i < 6; i++) sends.push((await api('POST', '/auth/mfa/send', { body: { mfaToken: mtC } })).status);
    check('texts are limited per person (429 after 5 in 15 min)', sends.includes(429) && sends[0] === 200, sends.join(','));

    section('Older authenticator-app users');
    const secret = totp.generateSecret();
    await q("INSERT INTO user_mfa (user_id, secretEnc, enabled) VALUES (?, ?, 1)", [D.id, totp.encryptSecret(secret)]);
    r = await signin(D);
    check('sign-in says authenticator', r.json.mfaRequired && r.json.mfaMethod === 'authenticator', JSON.stringify(r.json));
    const mtD = r.json.mfaToken;
    r = await api('POST', '/auth/mfa/send', { body: { mfaToken: mtD } });
    check('nothing is texted for them', r.status === 200 && r.json.sent === false);
    r = await api('POST', '/auth/mfa/verify', { body: { mfaToken: mtD, code: totp.hotp(secret, totp.counterAt()) } });
    check('their authenticator code still works', r.status === 200 && r.json.token, JSON.stringify(r.json));
    const dTok = r.json.token;
    r = await api('POST', '/auth/mfa/phone/start', { token: dTok, body: { phone: '(310) 555-0123', password: PW } });
    check('they can switch to a phone', r.status === 200);
    r = await api('POST', '/auth/mfa/phone/confirm', { token: dTok, body: { code: CODE } });
    check('switched, no new recovery codes needed', r.status === 200 && !r.json.recoveryCodes);
    r = await signin(D);
    check('now they get the text-message step', r.json.mfaMethod === 'sms' && r.json.phoneHint === '0123');
  } catch (e) {
    failed++; console.log(`  ERROR  ${e.message}`);
  } finally {
    section('Cleanup');
    const deleteUser = require('../db/maintenance/deleteUser');
    for (const n of names) { try { await deleteUser(n, true, () => {}); } catch (e) { console.log(`  could not remove ${n}: ${e.message}`); } }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
}
main();
