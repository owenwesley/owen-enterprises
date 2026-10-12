/**
 * routes/patientPhotos.js   (1.13.0)
 *
 * A patient's own photos (a leg, an arm, a sore, a rash), mounted at /patient-photos behind
 * auth + hipaaGate() (see server.js). Every route works on the SIGNED-IN patient's rows only
 * (patient_id = req.user.id); there is no id in the path that could name another patient.
 *
 *   GET    /patient-photos/enabled      {enabled}  (mounted separately: answers even when the feature is off)
 *   GET    /patient-photos              my photos, newest first, each with its doctor notes
 *   POST   /patient-photos              upload (multipart: field "image", plus bodyArea, note, takenOn, shared)
 *   PUT    /patient-photos/:id          change bodyArea / note / takenOn / shared
 *   DELETE /patient-photos/:id          delete the photo, its files and its notes
 *   GET    /patient-photos/:id/file     the picture (?size=thumb for the small one)
 *
 * A photo starts PRIVATE (shared = 0). Doctors reach shared photos through routes/doctor.js, which
 * also needs an active link and doctor_patients.sharePhotos = 1. Everything is off unless
 * PATIENT_PHOTOS=on. See utils/patientPhotos.js for where files are kept.
 */
const express = require('express');
const multer = require('multer');
const { owenenterprises: db } = require('../db/db');
const { toBit } = require('../utils/coerce');
const { serverError } = require('../utils/serverError');
const P = require('../utils/patientPhotos');
const { writeAudit, gateIsOn } = require('../middleware/hipaaGate');

const router = express.Router();

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff', 'image/heic', 'image/heif']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter(req, file, cb) {
    if (IMAGE_TYPES.has(String(file.mimetype).toLowerCase())) return cb(null, true);
    const err = new Error('Please upload a picture.');
    err.status = 400;
    return cb(err);
  },
}).single('image');

/** 404 (not 403) when the feature is off, so a switched-off server looks like it never had these routes. */
function requireEnabled(req, res, next) {
  if (P.enabled()) return next();
  return res.status(404).json({ error: 'Not available', code: 'PHOTOS_DISABLED' });
}

function enabledHandler(req, res) {
  return res.json({ enabled: P.enabled() });
}

/** Only patient accounts keep photos. Role is read from the database, not the token. */
async function requirePatient(req, res, next) {
  try {
    const [rows] = await db.promise().query('SELECT role FROM users WHERE id=?', [req.user.id]);
    if (!rows[0] || rows[0].role !== 'patient') return res.status(403).json({ error: 'Forbidden' });
    return next();
  } catch (e) {
    return serverError(res, e);
  }
}

/**
 * Doctor views are always written to audit_log. With HIPAA_GATE=on the gate has already written the
 * row for this request, so this adds one only when the gate is off. Throws on failure (callers
 * answer 500: no log, no picture).
 */
async function audit(req, patientId, detail) {
  if (gateIsOn()) return;
  await writeAudit({
    userId: req.user.id, patientId, action: req.method,
    resource: `${req.baseUrl}${req.path}`, outcome: 'allowed', ip: req.ip, detail,
  });
}

const PHOTO_COLS = 'id, patient_id, bodyArea, note, DATE_FORMAT(takenOn, "%Y-%m-%d") AS takenOn, shared, createdAt';

/** Adds `notes: [{id, body, createdAt, doctorName, doctor_id}]` to each photo. */
async function withNotes(photos) {
  if (!photos.length) return photos;
  const [notes] = await db.promise().query(
    `SELECT n.id, n.photo_id, n.doctor_id, n.body, n.createdAt, u.firstName, u.lastName
       FROM patient_photo_notes n JOIN users u ON u.id = n.doctor_id
      WHERE n.photo_id IN (?) ORDER BY n.createdAt, n.id`,
    [photos.map((p) => p.id)]
  );
  const by = new Map(photos.map((p) => [p.id, []]));
  for (const n of notes) {
    by.get(n.photo_id).push({
      id: n.id, doctor_id: n.doctor_id, body: n.body, createdAt: n.createdAt,
      doctorName: `Dr. ${n.firstName} ${n.lastName}`.trim(),
    });
  }
  return photos.map((p) => ({ ...p, shared: Number(p.shared), notes: by.get(p.id) }));
}

// ── Own photos ───────────────────────────────────────────────────────────────
router.use(requireEnabled, requirePatient);

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT ${PHOTO_COLS} FROM patient_photos WHERE patient_id=? ORDER BY takenOn DESC, id DESC`,
      [req.user.id]
    );
    return res.json({ results: await withNotes(rows) });
  } catch (e) {
    return serverError(res, e);
  }
});

router.post('/', (req, res, next) => upload(req, res, (err) => (err ? next(err) : next())), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose or take a photo first.' });
  const takenOn = req.body.takenOn ? P.cleanDate(req.body.takenOn) : P.today();
  if (!takenOn) return res.status(400).json({ error: 'The date is not valid (use YYYY-MM-DD, not in the future).' });
  let fileKey = null;
  try {
    const [[c]] = await db.promise().query('SELECT COUNT(*) AS n FROM patient_photos WHERE patient_id=?', [req.user.id]);
    if (Number(c.n) >= P.maxPerPatient()) {
      return res.status(400).json({ error: `You can keep up to ${P.maxPerPatient()} photos. Delete some to add more.` });
    }
    fileKey = await P.saveImage(req.file.buffer);
    const [r] = await db.promise().query(
      'INSERT INTO patient_photos (patient_id, fileKey, bodyArea, note, takenOn, shared) VALUES (?,?,?,?,?,?)',
      [req.user.id, fileKey, P.cleanText(req.body.bodyArea, 60), P.cleanText(req.body.note, 500), takenOn,
        req.body.shared === undefined ? 0 : toBit(req.body.shared)]
    );
    const [rows] = await db.promise().query(`SELECT ${PHOTO_COLS} FROM patient_photos WHERE id=?`, [r.insertId]);
    return res.status(201).json({ message: 'Photo saved', results: (await withNotes(rows))[0] });
  } catch (e) {
    if (fileKey) await P.removeFiles(fileKey);   // do not leave a picture with no row
    if (e && e.expose && e.status) return res.status(e.status).json({ error: e.message });
    return serverError(res, e);
  }
});

router.put('/:id', async (req, res) => {
  if (!/^[0-9]+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const sets = []; const vals = [];
  if (Object.prototype.hasOwnProperty.call(req.body, 'bodyArea')) { sets.push('bodyArea=?'); vals.push(P.cleanText(req.body.bodyArea, 60)); }
  if (Object.prototype.hasOwnProperty.call(req.body, 'note')) { sets.push('note=?'); vals.push(P.cleanText(req.body.note, 500)); }
  if (Object.prototype.hasOwnProperty.call(req.body, 'shared')) { sets.push('shared=?'); vals.push(toBit(req.body.shared)); }
  if (Object.prototype.hasOwnProperty.call(req.body, 'takenOn')) {
    const d = P.cleanDate(req.body.takenOn);
    if (!d) return res.status(400).json({ error: 'The date is not valid (use YYYY-MM-DD, not in the future).' });
    sets.push('takenOn=?'); vals.push(d);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  try {
    const [r] = await db.promise().query(
      `UPDATE patient_photos SET ${sets.join(',')} WHERE id=? AND patient_id=?`,
      [...vals, req.params.id, req.user.id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ message: 'Photo updated' });
  } catch (e) {
    return serverError(res, e);
  }
});

router.delete('/:id', async (req, res) => {
  if (!/^[0-9]+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  try {
    const [rows] = await db.promise().query(
      'SELECT fileKey FROM patient_photos WHERE id=? AND patient_id=?', [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await db.promise().query('DELETE FROM patient_photos WHERE id=? AND patient_id=?', [req.params.id, req.user.id]);
    await P.removeFiles(rows[0].fileKey);
    return res.json({ message: 'Photo deleted' });
  } catch (e) {
    return serverError(res, e);
  }
});

router.get('/:id/file', async (req, res) => {
  if (!/^[0-9]+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
  try {
    const [rows] = await db.promise().query(
      'SELECT fileKey FROM patient_photos WHERE id=? AND patient_id=?', [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    return await P.sendPhoto(res, rows[0].fileKey, req.query.size === 'thumb' ? 'thumb' : 'full');
  } catch (e) {
    return serverError(res, e);
  }
});

module.exports = { router, enabledHandler, requireEnabled, withNotes, audit, PHOTO_COLS };
