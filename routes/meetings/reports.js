// routes/meetings/reports.js   (1.13.5, replaces the 1.13.4 Google Drive route)
//
// Mounted under /meetings, so every route is already behind `auth` + `ownerOnly()`: the user id MUST be
// the LAST URL segment, and it must be the signed-in user's own id.
//
//   POST   /meetings/reports/:user_id          multipart: report (PDF) + period ("2026-10", optional)
//                                              -> saved as pdf/<user_id>/reports/Richfield NA Report-Oct-26.pdf
//   GET    /meetings/reports/:user_id          -> { reports: [{ name, size, savedAt }] }   (the badge count)
//   GET    /meetings/reports/:name/:user_id    -> the PDF (kept on the server; downloading does NOT delete it)
//   DELETE /meetings/reports/:name/:user_id    -> "I saved it": removes that report (the user confirmed)
//   GET    /meetings/logo/:user_id             -> the user's logo (WebP) or 404 (the page shows the default)
//   POST   /meetings/logo/:user_id             multipart: logo (PNG/JPG/WebP, max 3 MB) -> replaces the old one
//   DELETE /meetings/logo/:user_id             -> removes the user's logo
//
// Where the files live and how they are named: utils/meetingReports.js.
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { serverError } = require('../../utils/serverError');
const files = require('../../utils/meetingReports');

const router = express.Router();

const memory = (field, maxBytes) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes, files: 1, fields: 5 },
}).single(field);

// multer errors -> a plain 4xx instead of a 500
const accept = (field, maxBytes, handler) => (req, res) => {
  memory(field, maxBytes)(req, res, (uploadErr) => {
    if (uploadErr) {
      const tooBig = uploadErr.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'That file is too large.' : 'Could not read the upload.' });
    }
    return handler(req, res).catch((err) => {
      if (err && err.status && err.expose) return res.status(err.status).json({ error: err.message });
      return serverError(res, err, 'meeting-files');
    });
  });
};

const noStore = (res) => res.set('Cache-Control', 'private, no-store');

// ---- reports ---------------------------------------------------------------------------------------
router.post('/reports/:user_id', accept('report', 10 * 1024 * 1024, async (req, res) => {
  const file = req.file;
  // A real PDF starts with "%PDF"; do not trust the browser's mimetype alone.
  if (!file || file.buffer.length < 5 || file.buffer.subarray(0, 4).toString('latin1') !== '%PDF') {
    return res.status(400).json({ error: 'The report must be a PDF file.' });
  }
  const name = await files.saveReport(req.params.user_id, file.buffer, req.body && req.body.period);
  return res.json({ ok: true, name });
}));

router.get('/reports/:user_id', async (req, res) => {
  try {
    noStore(res);
    return res.json({ reports: await files.listReports(req.params.user_id) });
  } catch (err) { return serverError(res, err, 'meeting-reports-list'); }
});

router.get('/reports/:name/:user_id', async (req, res) => {
  try {
    const { name, user_id: userId } = req.params;
    if (!files.validName(name)) return res.status(404).json({ error: 'Report not found.' });
    const full = files.reportPath(userId, name);
    let size;
    try { size = (await fs.promises.stat(full)).size; }
    catch (e) { if (e.code === 'ENOENT') return res.status(404).json({ error: 'Report not found.' }); throw e; }

    noStore(res);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    const stream = fs.createReadStream(full);
    // 1.13.5: NOT deleted here. The server cannot know the browser saved the file or that it was printed, so the
    // report stays (and the badge stays) until the user taps "I saved it" (DELETE below).
    stream.on('error', (e) => serverError(res, e, 'meeting-report-send'));
    return stream.pipe(res);
  } catch (err) { return serverError(res, err, 'meeting-report-get'); }
});

router.delete('/reports/:name/:user_id', async (req, res) => {
  try {
    const { name, user_id: userId } = req.params;
    if (!files.validName(name)) return res.status(404).json({ error: 'Report not found.' });
    try { await fs.promises.access(files.reportPath(userId, name)); }
    catch (_) { return res.status(404).json({ error: 'Report not found.' }); }
    await files.removeReport(userId, name);
    return res.json({ ok: true });
  } catch (err) { return serverError(res, err, 'meeting-report-delete'); }
});

// ---- logo ------------------------------------------------------------------------------------------
router.get('/logo/:user_id', async (req, res) => {
  try {
    const full = files.logoPath(req.params.user_id);
    try { await fs.promises.access(full); }
    catch (_) { return res.status(404).json({ error: 'No logo.' }); }
    noStore(res);
    res.type('image/webp');
    return fs.createReadStream(full).on('error', (e) => serverError(res, e, 'meeting-logo-send')).pipe(res);
  } catch (err) { return serverError(res, err, 'meeting-logo-get'); }
});

router.post('/logo/:user_id', accept('logo', 3 * 1024 * 1024, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a picture first.' });
  await files.saveLogo(req.params.user_id, req.file.buffer);
  return res.json({ ok: true });
}));

router.delete('/logo/:user_id', async (req, res) => {
  try {
    await files.removeLogo(req.params.user_id);
    return res.json({ ok: true });
  } catch (err) { return serverError(res, err, 'meeting-logo-delete'); }
});

module.exports = router;
