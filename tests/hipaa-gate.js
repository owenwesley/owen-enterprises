#!/usr/bin/env node
/**
 * tests/hipaa-gate.js
 *
 * Checks middleware/hipaaGate.js, routes/hipaa.js and the doctor patient-data
 * routes against the RUNNING server.
 *
 *   1. Start the server with the gate on:  HIPAA_GATE=on MFA_SMS_PROVIDER=mock npm start   (wait ~10 s)
 *   2. node tests/hipaa-gate.js            (npm run check:hipaa)
 *   Gate off instead:  GATE_MODE=off node tests/hipaa-gate.js   (server started WITHOUT HIPAA_GATE=on;
 *   only checks that requests pass straight through and nothing is logged)
 *
 * Creates throwaway users testhip_<time>_p (patient), _d (doctor), _x (other patient)
 * and removes them at the end. Exit code 0 = all passed, 1 = a failure.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const MODE = process.env.GATE_MODE === 'off' ? 'off' : 'on';
const PW = 'Hip-Pass-123!';
const stamp = Date.now();
const names = { p: `testhip_${stamp}_p`, d: `testhip_${stamp}_d`, x: `testhip_${stamp}_x` };
let passed = 0, failed = 0;
const check = (l, c, d) => { c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}${d ? '  -> ' + d : ''}`)); };
const section = (t) => console.log(`\n${t}`);

async function api(method, url, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json: json || {} };
}
async function makeUser(userName, extra = {}) {
  const up = await api('POST', '/auth/signup', { body: { firstName: 'Hip', lastName: 'Test', userName, email: `${userName}@example.invalid`, password: PW, ...extra } });
  if (up.status !== 201) throw new Error(`signup failed ${userName}: ${up.status} ${JSON.stringify(up.json)}`);
  const r = await api('POST', '/auth/signin', { body: { userName, password: PW } });
  return { name: userName, token: r.json.token, id: r.json.results[0].id };
}
const dbs = require('../db/db');
const q = async (pool, sql, params) => (await pool.promise().query(sql, params))[0];
const setFlag = (u, on) => api('POST', `/owenenterprises/features/edit/${u.id}`, { token: u.token, body: { chkBgtracker: on ? 1 : 0, chkCommunityLibrary: 1, chkMeetings: 1 } });
const audits = (uid) => q(dbs.owenenterprises, 'SELECT * FROM audit_log WHERE user_id=? ORDER BY id', [uid]);
// Two-step sign-in is by text message; the server must run with MFA_SMS_PROVIDER=mock (code 123456).
async function enrolMfa(u) {
  const s = await api('POST', '/auth/mfa/phone/start', { token: u.token, body: { phone: '(702) 555-0142' } });
  if (s.status !== 200) throw new Error(`phone/start failed (${s.status}): is the server running with MFA_SMS_PROVIDER=mock? ${JSON.stringify(s.json)}`);
  const e = await api('POST', '/auth/mfa/phone/confirm', { token: u.token, body: { code: '123456' } });
  u.recovery = e.json.recoveryCodes; return e;
}
async function consentAll(u) {
  const f = await api('GET', `/hipaa/forms/${u.id}`, { token: u.token });
  for (const form of f.json.results || []) await api('POST', `/hipaa/accept/${u.id}`, { token: u.token, body: { formKey: form.key, formVersion: form.version } });
}

async function main() {
  console.log(`HIPAA gate check against ${BASE} (mode: ${MODE})`);
  try {
    const P = await makeUser(names.p);
    const D = await makeUser(names.d, { role: 'doctor', licenseNumber: 'TEST-1', specialty: 'test' });
    const X = await makeUser(names.x);
    await q(dbs.owenenterprises, "UPDATE users SET doctorStatus='approved' WHERE id=?", [D.id]);
    await q(dbs.owenenterprises, "INSERT INTO doctor_patients (doctor_id, patient_id, status) VALUES (?,?, 'active')", [D.id, P.id]);

    if (MODE === 'off') {
      section('Gate off: pass-through');
      await setFlag(P, false);
      const r = await api('GET', `/bgtracker/readings/${P.id}`, { token: P.token });
      check('readings answer 200 even with the flag off', r.status === 200, String(r.status));
      check('nothing written to audit_log', (await audits(P.id)).length === 0);
      return;
    }

    section('Flag off');
    await setFlag(P, false);
    let r = await api('GET', `/bgtracker/readings/${P.id}`, { token: P.token });
    check('readings 403 BGTRACKER_DISABLED', r.status === 403 && r.json.code === 'BGTRACKER_DISABLED', JSON.stringify(r));
    r = await api('GET', `/hipaa/forms/${P.id}`, { token: P.token });
    check('consent forms not handed out', r.status === 403 && r.json.code === 'BGTRACKER_DISABLED');
    r = await api('POST', `/hipaa/accept/${P.id}`, { token: P.token, body: { formKey: 'bgtracker_consent', formVersion: '2' } });
    check('consent cannot be recorded', r.status === 403);
    r = await api('GET', `/hipaa/status/${P.id}`, { token: P.token });
    check('status says disabled, nothing missing', r.json.results && r.json.results.bgtrackerEnabled === false && r.json.results.missing.length === 0);
    check('nothing logged while the flag is off', (await audits(P.id)).length === 0);

    section('Flag on, no consent yet');
    await setFlag(P, true);
    r = await api('GET', `/bgtracker/readings/${P.id}`, { token: P.token });
    check('readings 403 (MFA_REQUIRED, not yet enrolled)', r.status === 403 && r.json.code === 'MFA_REQUIRED', JSON.stringify(r));
    let a = await audits(P.id);
    check('the denial is logged', a.length === 1 && a[0].outcome === 'denied');

    section('Flag on, consent not asked yet: MFA first');
    r = await api('GET', `/hipaa/status/${P.id}`, { token: P.token });
    check('status shows mfaEnabled false', r.json.results && r.json.results.mfaEnabled === false);
    await enrolMfa(P);
    r = await api('GET', `/bgtracker/readings/${P.id}`, { token: P.token });
    check('with MFA done the request now reaches the consent check', r.status === 403 && r.json.code === 'HIPAA_CONSENT_REQUIRED', JSON.stringify(r));

    section('Consent');
    r = await api('GET', `/hipaa/forms/${P.id}`, { token: P.token });
    check('two forms offered', (r.json.results || []).length === 2, JSON.stringify(r.json));
    r = await api('POST', `/hipaa/accept/${P.id}`, { token: P.token, body: { formKey: 'bgtracker_consent', formVersion: '99' } });
    check('wrong version refused (400)', r.status === 400);
    await consentAll(P);
    r = await api('GET', `/bgtracker/readings/${P.id}`, { token: P.token });
    check('readings 200 after consent', r.status === 200, JSON.stringify(r));
    a = await audits(P.id);
    check('the access is logged as allowed', a.some((x) => x.outcome === 'allowed' && x.action === 'GET' && /readings/.test(x.resource)));
    check('consent rows exist', (await q(dbs.owenenterprises, 'SELECT 1 FROM hipaa_consents WHERE user_id=?', [P.id])).length === 2);

    section('Other people');
    r = await api('GET', `/hipaa/status/${P.id}`, { token: X.token });
    check('another user cannot read my consent status', r.status === 403);
    r = await api('GET', `/bgtracker/readings/${P.id}`, { token: X.token });
    check('another user cannot read my readings', r.status === 403);

    section('Doctor reading the patient');
    await setFlag(D, true);
    r = await api('GET', `/doctor/patients/${P.id}/readings`, { token: D.token });
    check('doctor without MFA: 403 MFA_REQUIRED', r.status === 403 && r.json.code === 'MFA_REQUIRED', JSON.stringify(r));
    await enrolMfa(D);
    r = await api('GET', `/doctor/patients/${P.id}/readings`, { token: D.token });
    check('doctor without consent: 403 HIPAA_CONSENT_REQUIRED', r.status === 403 && r.json.code === 'HIPAA_CONSENT_REQUIRED', JSON.stringify(r));
    await consentAll(D);
    r = await api('GET', `/doctor/patients/${P.id}/readings`, { token: D.token });
    check('doctor with consent: 200', r.status === 200, JSON.stringify(r));
    a = await audits(D.id);
    check('log names the doctor and the patient', a.some((x) => x.outcome === 'allowed' && x.patient_id === P.id));
    await setFlag(P, false);
    r = await api('GET', `/doctor/patients/${P.id}/readings`, { token: D.token });
    check('patient flag off: doctor gets 403 BGTRACKER_DISABLED', r.status === 403 && r.json.code === 'BGTRACKER_DISABLED');
    await setFlag(P, true);
    await setFlag(D, false);
    r = await api('GET', `/doctor/patients/${P.id}/readings`, { token: D.token });
    check('doctor flag off: 403 BGTRACKER_DISABLED', r.status === 403 && r.json.code === 'BGTRACKER_DISABLED');

    section('Fail closed');
    await q(dbs.owenenterprises, 'RENAME TABLE audit_log TO audit_log_hold');
    try {
      r = await api('GET', `/bgtracker/readings/${P.id}`, { token: P.token });
      check('audit write fails -> 500 and no data', r.status === 500 && !r.json.results, JSON.stringify(r));
    } finally { await q(dbs.owenenterprises, 'RENAME TABLE audit_log_hold TO audit_log'); }
  } catch (e) {
    failed++; console.log(`  ERROR  ${e.message}`);
  } finally {
    section('Cleanup');
    try {
      const deleteUser = require('../db/maintenance/deleteUser');
      for (const n of Object.values(names)) {
        try { await deleteUser(n, true, () => {}); } catch (e) { if (!/no user named/.test(e.message)) console.log(`  could not remove ${n}: ${e.message}`); }
      }
      await q(dbs.owenenterprises, "DELETE FROM audit_log WHERE user_id IS NULL AND patient_id IS NULL");
    } catch (e) { console.log(`  cleanup problem: ${e.message}`); }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
}
main();
