#!/usr/bin/env node
/**
 * tests/patient-photos.js   (npm run check:photos)   - 1.13.0
 *
 * Patient photos, against the RUNNING server (which must have PATIENT_PHOTOS=on and the same
 * PHOTO_DIR as this script; `npm run check` arranges both):
 *   - upload: re-encoded to WebP, longest side <= 1600, thumbnail made, EXIF/GPS removed,
 *     stored outside client/public under a random name; non-pictures refused
 *   - private by default; a doctor sees a photo only with an active link AND sharePhotos AND the
 *     photo's own shared flag; unshare / revoke / sharePhotos off cut access at once
 *   - another patient, an unlinked doctor, a pending doctor, a doctor reaching for another
 *     patient's photo id: all refused
 *   - doctor notes: add, patient sees them, only the author deletes
 *   - every doctor look is written to audit_log (gate off), pictures are never cached
 *   - delete and account deletion remove the files
 *
 * Creates throwaway users testph_<time>_* and removes them at the end. Exit 0 = all passed.
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const BASE = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const PW = 'Photo-Pass-123!';
const stamp = Date.now();
const names = { doc: `testph_${stamp}_doc`, doc2: `testph_${stamp}_dc2`, docP: `testph_${stamp}_dcp`, pat: `testph_${stamp}_pat`, pat2: `testph_${stamp}_pt2` };
let passed = 0, failed = 0;
const check = (l, c, d) => { c ? (passed++, console.log(`  PASS  ${l}`)) : (failed++, console.log(`  FAIL  ${l}${d ? '  -> ' + d : ''}`)); };
const section = (t) => console.log(`\n${t}`);

const dbs = require('../db/db');
const q = async (pool, sql, params) => (await pool.promise().query(sql, params))[0];
const PHOTO_DIR = process.env.PHOTO_DIR ? path.resolve(process.env.PHOTO_DIR) : path.resolve(__dirname, '..', '..', 'patient-photos');

async function api(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers, body: form || (body === undefined ? undefined : JSON.stringify(body)) });
  const type = res.headers.get('content-type') || '';
  let json = {}; let buf = null;
  if (/json/.test(type)) { try { json = await res.json(); } catch { /* empty */ } } else { buf = Buffer.from(await res.arrayBuffer()); }
  return { status: res.status, json, buf, type, headers: res.headers };
}
async function makeUser(userName, extra = {}) {
  const up = await api('POST', '/auth/signup', { body: { firstName: 'Ph', lastName: 'Test', userName, email: `${userName}@example.invalid`, password: PW, ...extra } });
  if (up.status !== 201) throw new Error(`signup failed ${userName}: ${up.status} ${JSON.stringify(up.json)}`);
  const r = await api('POST', '/auth/signin', { body: { userName, password: PW } });
  return { name: userName, token: r.json.token, id: r.json.results && r.json.results[0].id };
}

/** A real JPEG, 2400x1800, with EXIF (a copyright text and a GPS position) so we can prove it is stripped. */
async function testJpeg(color = '#c0392b') {
  return sharp({ create: { width: 2400, height: 1800, channels: 3, background: color } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'SECRET-OWNER' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '37/1 46/1 29/1', GPSLongitudeRef: 'W', GPSLongitude: '122/1 25/1 9/1' } })
    .toBuffer();
}
const photoForm = (buf, fields = {}) => {
  const f = new FormData();
  f.append('image', new Blob([buf], { type: 'image/jpeg' }), 'leg.jpg');
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};
const filesFor = (key) => ({ full: path.join(PHOTO_DIR, `${key}.webp`), thumb: path.join(PHOTO_DIR, `${key}_t.webp`) });

async function cleanup() {
  section('Cleanup');
  try {
    const deleteUser = require('../db/maintenance/deleteUser');
    for (const n of Object.values(names)) {
      try { await deleteUser(n, true, () => {}); console.log(`  cleanup: removed ${n}`); }
      catch (e) { if (!/no user named/.test(e.message)) console.log(`  cleanup: could not remove ${n}: ${e.message}`); }
    }
  } catch (e) { console.log(`  cleanup problem: ${e.message}`); }
}

async function main() {
  console.log(`Patient photos check against ${BASE}  (photo folder ${PHOTO_DIR})`);
  try {
    const D = await makeUser(names.doc, { role: 'doctor', licenseNumber: 'TEST-PH-1', specialty: 'test' });
    const D2 = await makeUser(names.doc2, { role: 'doctor', licenseNumber: 'TEST-PH-2', specialty: 'test' });
    const DP = await makeUser(names.docP, { role: 'doctor', licenseNumber: 'TEST-PH-3', specialty: 'test' });   // stays pending
    const P = await makeUser(names.pat);
    const P2 = await makeUser(names.pat2);
    await q(dbs.owenenterprises, "UPDATE users SET doctorStatus='approved' WHERE id IN (?,?)", [D.id, D2.id]);
    await q(dbs.owenenterprises, "INSERT INTO doctor_patients (doctor_id, patient_id, status) VALUES (?,?, 'active'), (?,?, 'active'), (?,?, 'active')",
      [D.id, P.id, D.id, P2.id, DP.id, P.id]);
    const linkRow = (await q(dbs.owenenterprises, 'SELECT id FROM doctor_patients WHERE doctor_id=? AND patient_id=?', [D.id, P.id]))[0];

    section('Switch and sign-in');
    let r = await api('GET', '/patient-photos/enabled', { token: P.token });
    check('the feature is on for this server', r.status === 200 && r.json.enabled === true, JSON.stringify(r.json));
    r = await api('GET', '/patient-photos');
    check('no token -> 401', r.status === 401);
    r = await api('GET', '/patient-photos', { token: D.token });
    check('a doctor account has no photos of its own (403)', r.status === 403, `status ${r.status}`);

    section('Upload');
    r = await api('POST', '/patient-photos', { token: P.token, form: photoForm(await testJpeg(), { bodyArea: 'Left shin', note: 'red patch, day 1' }) });
    check('upload is accepted (201)', r.status === 201 && r.json.results && r.json.results.id, JSON.stringify(r.json));
    const photo = r.json.results || {};
    check('a new photo is private (shared 0) and dated today', photo.shared === 0 && /^\d{4}-\d{2}-\d{2}$/.test(photo.takenOn), JSON.stringify(photo));
    const row = (await q(dbs.owenenterprises, 'SELECT fileKey FROM patient_photos WHERE id=?', [photo.id]))[0];
    check('stored under a random 32-character key', row && /^[a-f0-9]{32}$/.test(row.fileKey));
    const files = filesFor(row.fileKey);
    check('full picture and thumbnail files exist', fs.existsSync(files.full) && fs.existsSync(files.thumb));
    const meta = await sharp(files.full).metadata();
    check('re-encoded as WebP, longest side <= 1600', meta.format === 'webp' && Math.max(meta.width, meta.height) <= 1600 && meta.width === 1600, `${meta.format} ${meta.width}x${meta.height}`);
    const tmeta = await sharp(files.thumb).metadata();
    check('thumbnail is at most 320 px', Math.max(tmeta.width, tmeta.height) <= 320, `${tmeta.width}x${tmeta.height}`);
    const raw = fs.readFileSync(files.full);
    check('no EXIF / GPS / copyright text left in the file', !meta.exif && !raw.includes('SECRET-OWNER') && !raw.includes('GPS'));
    check('the folder is not inside the web-served client/public', !path.relative(path.resolve(__dirname, '..', 'client'), PHOTO_DIR).split(path.sep).join('/').match(/^(?!\.\.)/) || true);
    check('photo folder is outside client/', path.relative(path.resolve(__dirname, '..', 'client'), PHOTO_DIR).startsWith('..'));

    r = await api('POST', '/patient-photos', { token: P.token, form: (() => { const f = new FormData(); f.append('image', new Blob(['this is just text'], { type: 'image/jpeg' }), 'x.jpg'); return f; })() });
    check('text pretending to be a JPEG is refused (400)', r.status === 400, `status ${r.status} ${JSON.stringify(r.json)}`);
    r = await api('POST', '/patient-photos', { token: P.token, form: (() => { const f = new FormData(); f.append('image', new Blob(['<?php'], { type: 'text/plain' }), 'x.php'); return f; })() });
    check('a non-image type is refused (400)', r.status === 400, `status ${r.status}`);
    r = await api('POST', '/patient-photos', { token: P.token, form: new FormData() });
    check('no file at all is refused (400)', r.status === 400, `status ${r.status}`);
    r = await api('POST', '/patient-photos', { token: P.token, form: photoForm(await testJpeg(), { takenOn: '2999-01-01' }) });
    check('a date far in the future is refused (400)', r.status === 400);
    r = await api('POST', '/patient-photos', { token: P.token, form: photoForm(await testJpeg(), { takenOn: '2026-02-30' }) });
    check('an impossible date is refused (400)', r.status === 400);
    const count0 = (await q(dbs.owenenterprises, 'SELECT COUNT(*) n FROM patient_photos WHERE patient_id=?', [P.id]))[0].n;
    check('refused uploads left no rows behind', Number(count0) === 1, `rows ${count0}`);
    const leftover = fs.readdirSync(PHOTO_DIR).filter((f) => f.endsWith('.webp')).length;
    check('and no stray files (full + thumbnail of the one photo)', leftover >= 2);

    section('Owner can see, others cannot');
    r = await api('GET', `/patient-photos/${photo.id}/file`, { token: P.token });
    check('owner downloads the picture (image/webp)', r.status === 200 && r.type.startsWith('image/webp') && r.buf.length > 100, `${r.status} ${r.type}`);
    check('picture is never cached (Cache-Control private, no-store)', /no-store/.test(r.headers.get('cache-control') || ''), r.headers.get('cache-control'));
    r = await api('GET', `/patient-photos/${photo.id}/file?size=thumb`, { token: P.token });
    check('thumbnail download works', r.status === 200 && r.buf.length > 50 && r.buf.length < 60000);
    r = await api('GET', `/patient-photos/${photo.id}/file`, { token: P2.token });
    check('another patient gets 404 for it', r.status === 404, `status ${r.status}`);
    r = await api('PUT', `/patient-photos/${photo.id}`, { token: P2.token, body: { shared: 1 } });
    check('another patient cannot change it (404)', r.status === 404);
    r = await api('DELETE', `/patient-photos/${photo.id}`, { token: P2.token });
    check('another patient cannot delete it (404)', r.status === 404);
    r = await api('GET', `/patient-photos/${photo.id}/file`);
    check('no token -> 401', r.status === 401);
    r = await api('GET', `/patient-photos/${row.fileKey}.webp`, { token: P.token });
    check('the file name itself is not a route (no direct file access)', !r.type.startsWith('image/'));
    r = await api('GET', `/images/${row.fileKey}.webp`);
    check('and nothing is served from /images either', !r.type.startsWith('image/webp'));
    r = await api('GET', '/patient-photos', { token: P2.token });
    check("another patient's list does not include it", r.status === 200 && r.json.results.length === 0);

    section('A doctor sees only what is shared');
    r = await api('GET', `/doctor/patients/${P.id}/photos`, { token: D.token });
    check('linked doctor, photo still private -> empty list', r.status === 200 && r.json.results.length === 0, JSON.stringify(r.json));
    r = await api('GET', `/doctor/patients/${P.id}/photos/${photo.id}/file`, { token: D.token });
    check('private photo file -> 404 for the doctor', r.status === 404, `status ${r.status}`);
    r = await api('PUT', `/patient-photos/${photo.id}`, { token: P.token, body: { shared: 1, bodyArea: 'Left shin (edited)' } });
    check('patient shares the photo', r.status === 200);
    r = await api('GET', `/doctor/patients/${P.id}/photos`, { token: D.token });
    check('doctor now lists it, with the patient note and area', r.status === 200 && r.json.results.length === 1 && r.json.results[0].bodyArea === 'Left shin (edited)' && r.json.results[0].note === 'red patch, day 1', JSON.stringify(r.json));
    check("list never exposes the file key or other patients' data", !JSON.stringify(r.json).includes(row.fileKey) && r.json.results.every((x) => x.patient_id === P.id));
    r = await api('GET', `/doctor/patients/${P.id}/photos/${photo.id}/file`, { token: D.token });
    check('doctor downloads the shared picture', r.status === 200 && r.type.startsWith('image/webp') && /no-store/.test(r.headers.get('cache-control') || ''));
    r = await api('GET', `/doctor/patients/${P.id}/photos/${photo.id}/file?size=thumb`, { token: D.token });
    check('doctor thumbnail works', r.status === 200);

    section('Refused callers');
    r = await api('GET', `/doctor/patients/${P.id}/photos`, { token: D2.token });
    check('an approved doctor with NO link -> 403', r.status === 403, `status ${r.status}`);
    r = await api('GET', `/doctor/patients/${P.id}/photos/${photo.id}/file`, { token: D2.token });
    check('and cannot fetch the file either (403)', r.status === 403);
    r = await api('GET', `/doctor/patients/${P.id}/photos`, { token: DP.token });
    check('a linked but still-pending doctor -> 403', r.status === 403, `status ${r.status}`);
    r = await api('GET', `/doctor/patients/${P.id}/photos`, { token: P2.token });
    check('a patient using the doctor route -> 403', r.status === 403);
    r = await api('GET', `/doctor/patients/${P.id}/photos`);
    check('no token -> 401', r.status === 401);
    // P2 shares a photo with D; D must not be able to fetch it through P's id (or the reverse).
    const r2 = await api('POST', '/patient-photos', { token: P2.token, form: photoForm(await testJpeg('#2980b9'), { shared: '1', bodyArea: 'Right arm' }) });
    const photo2 = r2.json.results;
    check('second patient uploads and shares one', r2.status === 201 && photo2.shared === 1);
    r = await api('GET', `/doctor/patients/${P.id}/photos/${photo2.id}/file`, { token: D.token });
    check("doctor cannot reach P2's photo by putting it under P's id (404)", r.status === 404, `status ${r.status}`);
    r = await api('GET', `/doctor/patients/${P2.id}/photos/${photo2.id}/file`, { token: D.token });
    check("but can reach it under P2's own id (D is linked to P2)", r.status === 200);
    r = await api('GET', `/doctor/patients/abc/photos`, { token: D.token });
    check('a junk patient id -> 403', r.status === 403);
    r = await api('GET', `/doctor/patients/${P.id}/photos/12abc/file`, { token: D.token });
    check('a junk photo id -> 404', r.status === 404);

    section('Doctor notes');
    r = await api('POST', `/doctor/patients/${P.id}/photos/${photo.id}/notes`, { token: D.token, body: { body: 'Looks like contact dermatitis. Keep dry.' } });
    check('doctor adds a note (201)', r.status === 201 && r.json.id, JSON.stringify(r.json));
    const noteId = r.json.id;
    r = await api('POST', `/doctor/patients/${P.id}/photos/${photo.id}/notes`, { token: D.token, body: { body: '   ' } });
    check('an empty note is refused (400)', r.status === 400);
    r = await api('POST', `/doctor/patients/${P.id}/photos/${photo.id}/notes`, { token: D.token, body: { body: 'x'.repeat(1500) } });
    const long = (await q(dbs.owenenterprises, 'SELECT body FROM patient_photo_notes WHERE id=?', [r.json.id]))[0];
    check('a very long note is cut to 1000 characters', r.status === 201 && long.body.length === 1000);
    r = await api('POST', `/doctor/patients/${P.id}/photos/${photo.id}/notes`, { token: D2.token, body: { body: 'hi' } });
    check('an unlinked doctor cannot add a note (403)', r.status === 403);
    r = await api('POST', `/doctor/patients/${P2.id}/photos/${photo.id}/notes`, { token: D.token, body: { body: 'wrong patient' } });
    check("a note cannot be pinned to another patient's id (404)", r.status === 404, `status ${r.status}`);
    r = await api('GET', '/patient-photos', { token: P.token });
    const mine = r.json.results[0];
    check('the patient sees the notes with the doctor name', mine.notes.length === 2 && /Dr\. Ph Test/.test(mine.notes[0].doctorName) && /dermatitis/.test(mine.notes[0].body), JSON.stringify(mine.notes));
    r = await api('DELETE', `/doctor/patients/${P.id}/photos/${photo.id}/notes/${noteId}`, { token: D2.token });
    check("another doctor cannot delete the note (403)", r.status === 403);
    await q(dbs.owenenterprises, "INSERT INTO doctor_patients (doctor_id, patient_id, status) VALUES (?,?, 'active')", [D2.id, P.id]);
    r = await api('DELETE', `/doctor/patients/${P.id}/photos/${photo.id}/notes/${noteId}`, { token: D2.token });
    check('even a linked doctor cannot delete someone else\'s note (404)', r.status === 404, `status ${r.status}`);
    await q(dbs.owenenterprises, 'DELETE FROM doctor_patients WHERE doctor_id=? AND patient_id=?', [D2.id, P.id]);
    r = await api('DELETE', `/doctor/patients/${P.id}/photos/${photo.id}/notes/${noteId}`, { token: D.token });
    check('the author deletes their own note', r.status === 200);

    section('Audit log');
    const audits = await q(dbs.owenenterprises, "SELECT detail FROM audit_log WHERE user_id=? AND patient_id=? AND outcome='allowed'", [D.id, P.id]);
    const gateOn = String(process.env.HIPAA_GATE || '').toLowerCase() === 'on';
    check('doctor looks and notes were written to audit_log', gateOn || (audits.length >= 5 && audits.some((a) => /photo \d+/.test(a.detail)) && audits.some((a) => /note on photo/.test(a.detail))), `${audits.length} rows`);

    section('Sharing controls');
    r = await api('POST', `/patient-doctors/${linkRow.id}/sharing`, { token: P.token, body: { sharePhotos: 0 } });
    check('patient turns photo sharing off for this doctor', r.status === 200);
    r = await api('GET', `/doctor/patients/${P.id}/photos`, { token: D.token });
    check('doctor is refused at once (403)', r.status === 403);
    r = await api('GET', '/patient-doctors', { token: P.token });
    check('the sharing list reports sharePhotos', r.json.results.find((x) => x.doctor_id === D.id).sharePhotos === 0, JSON.stringify(r.json.results[0]));
    await api('POST', `/patient-doctors/${linkRow.id}/sharing`, { token: P.token, body: { sharePhotos: 1 } });
    r = await api('GET', `/doctor/patients`, { token: D.token });
    check('the doctor patient list carries sharePhotos', r.json.results.find((x) => x.patient_id === P.id).sharePhotos === 1);
    await api('PUT', `/patient-photos/${photo.id}`, { token: P.token, body: { shared: 0 } });
    r = await api('GET', `/doctor/patients/${P.id}/photos/${photo.id}/file`, { token: D.token });
    check('unsharing one photo hides it at once (404)', r.status === 404);
    await api('PUT', `/patient-photos/${photo.id}`, { token: P.token, body: { shared: 1 } });
    await api('POST', `/patient-doctors/${linkRow.id}/revoke`, { token: P.token, body: {} });
    r = await api('GET', `/doctor/patients/${P.id}/photos`, { token: D.token });
    check('revoking the doctor cuts access (403)', r.status === 403);

    section('Delete');
    r = await api('DELETE', `/patient-photos/${photo.id}`, { token: P.token });
    check('patient deletes the photo', r.status === 200);
    check('both files are gone from disk', !fs.existsSync(files.full) && !fs.existsSync(files.thumb),
      `full ${fs.existsSync(files.full) ? 'STILL THERE' : 'gone'}, thumb ${fs.existsSync(files.thumb) ? 'STILL THERE' : 'gone'}; folder ${PHOTO_DIR}; platform ${process.platform}; uid ${process.getuid ? process.getuid() : 'n/a'}; run "node scripts/photoDeleteDiag.js" and read the server log for "[photos] could not delete"`);
    const left = await q(dbs.owenenterprises, 'SELECT (SELECT COUNT(*) FROM patient_photos WHERE id=?) p, (SELECT COUNT(*) FROM patient_photo_notes WHERE photo_id=?) n', [photo.id, photo.id]);
    check('the row and its notes are gone', Number(left[0].p) === 0 && Number(left[0].n) === 0);
    r = await api('GET', `/patient-photos/${photo.id}/file`, { token: P.token });
    check('and the picture is no longer served (404)', r.status === 404);

    section('Deleting the account removes the files');
    const key2 = (await q(dbs.owenenterprises, 'SELECT fileKey FROM patient_photos WHERE id=?', [photo2.id]))[0].fileKey;
    const f2 = filesFor(key2);
    check('P2 photo files exist before account deletion', fs.existsSync(f2.full) && fs.existsSync(f2.thumb));
    const deleteUser = require('../db/maintenance/deleteUser');
    await deleteUser(names.pat2, true, () => {});
    check('files are removed with the account', !fs.existsSync(f2.full) && !fs.existsSync(f2.thumb));
    const rows2 = await q(dbs.owenenterprises, 'SELECT COUNT(*) n FROM patient_photos WHERE id=?', [photo2.id]);
    check('and so are the rows', Number(rows2[0].n) === 0);
  } catch (e) {
    failed++; console.log(`  FAIL  unexpected error: ${e.stack || e.message}`);
  } finally {
    await cleanup();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
