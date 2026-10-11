#!/usr/bin/env node
/**
 * tests/clinics-hospitals.js   (npm run check:clinics)
 *
 * Clinics AND hospitals, and a doctor working at several places (1.12.0),
 * against the RUNNING server:
 *   - admin adds a clinic / hospital (type, default, bad type refused)
 *   - a doctor requests to add places; admin approves / rejects; the first place
 *     becomes primary; the same place cannot be requested twice
 *   - a doctor can have two (or more) places; removal requests; the primary moves
 *     to another place when the primary is removed or its place is deleted
 *   - admin can add / remove / set primary directly
 *   - none of it ever changes a doctor_patients link
 *   - non-admins and patients are refused
 *
 * Creates throwaway users testclh_<time>_* and clinics named TESTCLH <time> ...
 * and removes them at the end. Exit code 0 = all passed, 1 = a failure.
 */
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const PW = 'Clh-Pass-123!';
const stamp = Date.now();
const names = { admin: `testclh_${stamp}_adm`, doc: `testclh_${stamp}_doc`, doc2: `testclh_${stamp}_dc2`, pat: `testclh_${stamp}_pat` };
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
  const up = await api('POST', '/auth/signup', { body: { firstName: 'Clh', lastName: 'Test', userName, email: `${userName}@example.invalid`, password: PW, ...extra } });
  if (up.status !== 201) throw new Error(`signup failed ${userName}: ${up.status} ${JSON.stringify(up.json)}`);
  return signIn(userName);
}
async function signIn(userName) {
  const r = await api('POST', '/auth/signin', { body: { userName, password: PW } });
  return { name: userName, token: r.json.token, id: r.json.results && r.json.results[0].id };
}
const dbs = require('../db/db');
const q = async (pool, sql, params) => (await pool.promise().query(sql, params))[0];
const root = path.resolve(__dirname, '..');
const makeAdmin = (...args) => execFileSync('node', [path.resolve(root, 'db/makeAdmin.js'), ...args], { encoding: 'utf8', cwd: root });

const places = (d) => api('GET', '/doctor/my-clinics', { token: d.token }).then((r) => r.json.results);
const primaryOf = (list) => list.filter((c) => c.isPrimary).map((c) => c.name);

async function cleanup(clinicIds) {
  section('Cleanup');
  try {
    for (const id of clinicIds) await q(dbs.owenenterprises, 'DELETE FROM clinics WHERE id=?', [id]);
    const deleteUser = require('../db/maintenance/deleteUser');
    try { makeAdmin(names.admin, 'revoke'); } catch { /* not promoted */ }
    for (const n of Object.values(names)) {
      try { await deleteUser(n, true, () => {}); console.log(`  cleanup: removed ${n}`); }
      catch (e) { if (!/no user named/.test(e.message)) console.log(`  cleanup: could not remove ${n}: ${e.message}`); }
    }
  } catch (e) { console.log(`  cleanup problem: ${e.message}`); }
}

async function main() {
  console.log(`Clinics and hospitals check against ${BASE}`);
  const clinicIds = [];
  try {
    const A0 = await makeUser(names.admin);
    makeAdmin(names.admin);
    const A = await signIn(names.admin);
    const D = await makeUser(names.doc, { role: 'doctor', licenseNumber: 'TEST-CLH-1', specialty: 'test' });
    const D2 = await makeUser(names.doc2, { role: 'doctor', licenseNumber: 'TEST-CLH-2', specialty: 'test' });
    const P = await makeUser(names.pat);
    await q(dbs.owenenterprises, "UPDATE users SET doctorStatus='approved' WHERE id IN (?,?)", [D.id, D2.id]);
    await q(dbs.owenenterprises, "INSERT INTO doctor_patients (doctor_id, patient_id, status) VALUES (?,?, 'active')", [D.id, P.id]);
    const linkStatus = async () => (await q(dbs.owenenterprises, 'SELECT status FROM doctor_patients WHERE doctor_id=? AND patient_id=?', [D.id, P.id]))[0];

    section('Admin adds clinics and hospitals');
    const mk = async (body) => {
      const r = await api('POST', '/admin/clinics', { token: A.token, body });
      if (r.json.id) clinicIds.push(r.json.id);
      return r;
    };
    const cA = await mk({ name: `TESTCLH ${stamp} North Clinic`, address: '1 N St' });
    const hB = await mk({ name: `TESTCLH ${stamp} General Hospital`, address: '2 H Ave', type: 'hospital' });
    const cC = await mk({ name: `TESTCLH ${stamp} South Clinic`, type: 'clinic' });
    check('clinic with no type is created (default clinic)', cA.status === 201 && cA.json.id);
    check('hospital is created', hB.status === 201 && /Hospital/.test(hB.json.message || ''));
    const bad = await api('POST', '/admin/clinics', { token: A.token, body: { name: 'x', type: 'spaceship' } });
    check('unknown type is refused (400)', bad.status === 400, JSON.stringify(bad));
    const list = await api('GET', '/admin/clinics', { token: A.token });
    const byId = (id) => (list.json.results || []).find((c) => c.id === id);
    check('list returns the type of each place', byId(cA.json.id)?.type === 'clinic' && byId(hB.json.id)?.type === 'hospital', JSON.stringify(list.json).slice(0, 200));
    const up = await api('PUT', `/admin/clinics/${cC.json.id}`, { token: A.token, body: { name: `TESTCLH ${stamp} South Clinic`, address: '3 S St', type: 'hospital' } });
    check('PUT can change the type', up.status === 200, JSON.stringify(up));
    await api('PUT', `/admin/clinics/${cC.json.id}`, { token: A.token, body: { name: `TESTCLH ${stamp} South Clinic`, address: '3 S St', type: 'clinic' } });

    section('Permissions');
    const pb = await api('GET', '/doctor/clinics', { token: P.token });
    check('a patient cannot browse as a doctor (403)', pb.status === 403, `status ${pb.status}`);
    const pa = await api('POST', '/admin/clinics', { token: D.token, body: { name: 'nope' } });
    check('a doctor cannot add a place (403)', pa.status === 403, `status ${pa.status}`);
    const f = await api('GET', `/doctor/clinics?type=hospital&q=${encodeURIComponent('TESTCLH ' + stamp)}`, { token: D.token });
    check('doctor can browse and filter by type', f.status === 200 && f.json.results.length === 1 && f.json.results[0].type === 'hospital', JSON.stringify(f.json));

    section('Doctor requests a hospital, then a clinic');
    let r = await api('POST', '/doctor/clinic-requests', { token: D.token, body: { clinic_id: hB.json.id, action: 'add' } });
    check('request to add the hospital is accepted', r.status === 200, JSON.stringify(r));
    let mine = await places(D);
    check('the request is pending and nothing is attached yet', mine.clinics.length === 0 && mine.requests.length === 1 && mine.requests[0].action === 'add');
    r = await api('POST', '/doctor/clinic-requests', { token: D.token, body: { clinic_id: 999999999, action: 'add' } });
    check('request for a place that does not exist is refused (400)', r.status === 400);
    r = await api('POST', '/doctor/clinic-requests', { token: D.token, body: { clinic_id: hB.json.id, action: 'dance' } });
    check('unknown action is refused (400)', r.status === 400);
    r = await api('POST', '/doctor/clinic-requests', { token: D.token, body: { clinic_id: cA.json.id, action: 'remove' } });
    check('request to leave a place you are not at is refused (400)', r.status === 400);
    const queue = await api('GET', '/admin/clinic-requests', { token: A.token });
    check('admin queue lists it with the action and place type', queue.json.results.some((x) => x.doctorId === D.id && x.clinicId === hB.json.id && x.action === 'add' && x.clinicType === 'hospital'));
    r = await api('POST', `/admin/clinic-requests/${D.id}/${hB.json.id}/approve`, { token: A.token });
    check('admin approves', r.status === 200, JSON.stringify(r));
    mine = await places(D);
    check('hospital is attached and is the primary (first place)', mine.clinics.length === 1 && mine.clinics[0].isPrimary && mine.clinics[0].type === 'hospital' && mine.requests.length === 0);
    r = await api('POST', `/admin/clinic-requests/${D.id}/${hB.json.id}/approve`, { token: A.token });
    check('approving the same request twice is refused (404)', r.status === 404);
    r = await api('POST', '/doctor/clinic-requests', { token: D.token, body: { clinic_id: hB.json.id, action: 'add' } });
    check('adding a place you already have is refused (400)', r.status === 400);

    section('Two places for one doctor');
    await api('POST', '/doctor/clinic-requests', { token: D.token, body: { clinic_id: cA.json.id, action: 'add' } });
    await api('POST', `/admin/clinic-requests/${D.id}/${cA.json.id}/approve`, { token: A.token });
    mine = await places(D);
    check('doctor now has two places, the hospital still primary', mine.clinics.length === 2 && primaryOf(mine.clinics).length === 1 && mine.clinics[0].type === 'hospital', JSON.stringify(mine.clinics));
    const me = await api('GET', '/doctor/me', { token: D.token });
    check('/doctor/me lists both places and names the primary', me.json.results.clinics.length === 2 && /General Hospital/.test(me.json.results.clinicName), JSON.stringify(me.json.results));
    const adm = await api('GET', '/admin/doctors', { token: A.token });
    const row = adm.json.results.find((x) => x.id === D.id);
    check('/admin/doctors shows both places', row && row.clinics.length === 2 && row.clinics[0].isPrimary);

    section('Rejecting, withdrawing, removing');
    await api('POST', '/doctor/clinic-requests', { token: D.token, body: { clinic_id: cC.json.id, action: 'add' } });
    r = await api('POST', `/admin/clinic-requests/${D.id}/${cC.json.id}/reject`, { token: A.token });
    mine = await places(D);
    check('rejecting deletes the request and attaches nothing', r.status === 200 && mine.clinics.length === 2 && mine.requests.length === 0);
    await api('POST', '/doctor/clinic-requests', { token: D.token, body: { clinic_id: cC.json.id, action: 'add' } });
    r = await api('DELETE', `/doctor/clinic-requests/${cC.json.id}`, { token: D.token });
    mine = await places(D);
    check('doctor can withdraw their own request', r.status === 200 && mine.requests.length === 0);
    await api('POST', '/doctor/clinic-requests', { token: D.token, body: { clinic_id: hB.json.id, action: 'remove' } });
    mine = await places(D);
    check('a removal request shows as pending, place still attached', mine.requests.length === 1 && mine.requests[0].action === 'remove' && mine.clinics.length === 2);
    r = await api('POST', `/admin/clinic-requests/${D.id}/${hB.json.id}/approve`, { token: A.token });
    mine = await places(D);
    check('approving removal of the PRIMARY promotes the other place', r.status === 200 && mine.clinics.length === 1 && mine.clinics[0].name.includes('North Clinic') && mine.clinics[0].isPrimary, JSON.stringify(mine.clinics));

    section('Admin edits a doctor directly');
    r = await api('POST', `/admin/doctors/${D.id}/clinics`, { token: A.token, body: { clinic_id: hB.json.id } });
    r = await api('POST', `/admin/doctors/${D.id}/clinics/${hB.json.id}/primary`, { token: A.token });
    mine = await places(D);
    check('admin can make another place primary (still exactly one)', r.status === 200 && primaryOf(mine.clinics).length === 1 && mine.clinics[0].name.includes('General Hospital'));
    r = await api('POST', `/admin/doctors/${D.id}/clinics/${cC.json.id}/primary`, { token: A.token });
    check('making primary a place the doctor is not at is refused (404)', r.status === 404);
    r = await api('POST', `/admin/doctors/${D.id}/clinics`, { token: A.token, body: { clinic_id: 999999999 } });
    check('admin adding a place that does not exist is refused (400)', r.status === 400);
    r = await api('POST', `/admin/doctors/${D.id + 999999}/clinics`, { token: A.token, body: { clinic_id: cA.json.id } });
    check('admin adding to a doctor that does not exist is refused (404)', r.status === 404);
    r = await api('POST', `/admin/doctors/${P.id}/clinics`, { token: A.token, body: { clinic_id: cA.json.id } });
    check('admin adding to a PATIENT account is refused (404)', r.status === 404);
    r = await api('DELETE', `/admin/doctors/${D.id}/clinics/${cC.json.id}`, { token: A.token });
    check('removing a place the doctor is not at is refused (404)', r.status === 404);
    // A request for a place is cleared when the admin attaches it directly.
    await api('POST', '/doctor/clinic-requests', { token: D.token, body: { clinic_id: cC.json.id, action: 'add' } });
    await api('POST', `/admin/doctors/${D.id}/clinics`, { token: A.token, body: { clinic_id: cC.json.id } });
    mine = await places(D);
    check('attaching directly clears the doctor\'s pending request for it', mine.clinics.length === 3 && mine.requests.length === 0);

    section('Two doctors at the same place; deleting a place');
    await api('POST', `/admin/doctors/${D2.id}/clinics`, { token: A.token, body: { clinic_id: hB.json.id } });
    await api('POST', '/doctor/clinic-requests', { token: D2.token, body: { clinic_id: cA.json.id, action: 'add' } });
    r = await api('DELETE', `/admin/clinics/${hB.json.id}`, { token: A.token });
    mine = await places(D);
    const mine2 = await places(D2);
    check('deleting the primary place detaches it and promotes another', r.status === 200 && mine.clinics.length === 2 && primaryOf(mine.clinics).length === 1, JSON.stringify(mine.clinics));
    check('the other doctor is left with no places and still has their own request', mine2.clinics.length === 0 && mine2.requests.length === 1);
    clinicIds.splice(clinicIds.indexOf(hB.json.id), 1);
    r = await api('DELETE', `/admin/clinics/${cA.json.id}`, { token: A.token });
    mine2.requests = (await places(D2)).requests;
    check('deleting a place withdraws pending requests for it', r.status === 200 && mine2.requests.length === 0);
    clinicIds.splice(clinicIds.indexOf(cA.json.id), 1);
    r = await api('DELETE', `/admin/clinics/${cA.json.id}`, { token: A.token });
    check('deleting a place that is gone is a 404', r.status === 404);

    section('Patients are never affected');
    check('the doctor-patient link is still active after all of the above', (await linkStatus())?.status === 'active');
    void A0;
  } catch (e) {
    failed++; console.log(`  FAIL  unexpected error: ${e.stack || e.message}`);
  } finally {
    await cleanup(clinicIds);
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
}
main();
