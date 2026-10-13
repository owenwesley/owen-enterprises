// routes/meetings/sendReport.js
//
// POST /meetings/send-to-drive/:user_id   multipart: email (text) + report (PDF file)
// Mounted under /meetings, so it is already behind `auth` + `ownerOnly()` (the user id must be
// the LAST URL segment, which is why :user_id is last).
//
// What it does: uploads the PDF into the app's Google Drive (optionally into one folder), then
// shares the file with the email typed in the prompt (Google also emails them a link).
//
// Plesk "Custom environment variables" (never in the zip, never in /httpdocs):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN   (one-time setup, see the reply)
//   GOOGLE_DRIVE_FOLDER      optional: folder name (default "Richfield NA Reports"); the app creates it
//                            itself the first time. (With the safe drive.file permission the app can
//                            only use folders it made, so it cannot pick one of your existing folders.)
//   GOOGLE_DRIVE_ACCOUNT     optional: the Gmail address that owns the Drive; if the typed email is
//                            the same address, the share step is skipped (it already owns the file)
const express = require('express');
const multer = require('multer');
const { Readable } = require('stream');
const { drive: driveApi, auth: googleAuth } = require('@googleapis/drive');
const { serverError } = require('../../utils/serverError');

const router = express.Router();
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 },   // a 40-row report is ~250 KB
}).single('report');

let drive;
function getDrive() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;
  if (!drive) {
    const oauth = new googleAuth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    oauth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });   // access tokens are fetched/renewed automatically
    drive = driveApi({ version: 'v3', auth: oauth });
  }
  return drive;
}

// Find (or create once) the folder the reports go into.
let folderId;
async function getFolderId(gd) {
  if (folderId) return folderId;
  const name = process.env.GOOGLE_DRIVE_FOLDER || 'Richfield NA Reports';
  const FOLDER = 'application/vnd.google-apps.folder';
  const found = await gd.files.list({
    q: `name = '${name.replace(/['\\]/g, '')}' and mimeType = '${FOLDER}' and trashed = false`,
    fields: 'files(id)', pageSize: 1,
  });
  folderId = found.data.files && found.data.files[0] && found.data.files[0].id;
  if (!folderId) {
    const made = await gd.files.create({ requestBody: { name, mimeType: FOLDER }, fields: 'id' });
    folderId = made.data.id;
  }
  return folderId;
}

router.post('/send-to-drive/:user_id', (req, res) => {
  upload(req, res, async (uploadErr) => {
    let fileId = null;
    try {
      if (uploadErr) {
        const tooBig = uploadErr.code === 'LIMIT_FILE_SIZE';
        return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'The report is too large.' : 'Could not read the upload.' });
      }
      const email = String((req.body && req.body.email) || '').trim();
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

      const file = req.file;
      // A real PDF starts with "%PDF"; do not trust the browser's mimetype alone.
      if (!file || file.buffer.length < 5 || file.buffer.subarray(0, 4).toString('latin1') !== '%PDF') {
        return res.status(400).json({ error: 'The report must be a PDF file.' });
      }

      const gd = getDrive();
      if (!gd) return res.status(503).json({ error: 'Google Drive is not set up on the server yet (Google settings missing).' });

      const stamp = new Date().toISOString().slice(0, 10);
      const name = `Richfield-NA-Report-${stamp}.pdf`;

      // 1. Upload the PDF into the reports folder.
      const created = await gd.files.create({
        requestBody: {
          name, mimeType: 'application/pdf',
          parents: [await getFolderId(gd)],
        },
        media: { mimeType: 'application/pdf', body: Readable.from([file.buffer]) },
        fields: 'id',
      });
      fileId = created.data.id;
      if (!fileId) throw new Error('Drive returned no file id');

      // 2. Share it with the address that was typed (skip if that address owns the Drive).
      const owner = (process.env.GOOGLE_DRIVE_ACCOUNT || '').trim().toLowerCase();
      if (email.toLowerCase() !== owner) {
        await gd.permissions.create({
          fileId,
          requestBody: { type: 'user', role: 'reader', emailAddress: email },
          sendNotificationEmail: true,
        });
      }

      // Only now does the browser go on to reset the table.
      return res.json({ ok: true, fileId });
    } catch (err) {
      // If the upload worked but the share failed, remove the half-finished file so a retry
      // does not leave duplicates. Best effort; the reset has NOT happened either way.
      if (fileId && drive) { try { await drive.files.delete({ fileId }); } catch (_) { /* ignore */ } }
      // Google's own error (bad address, revoked token, quota...) is logged server-side only.
      return serverError(res, err, 'send-to-drive');
    }
  });
});

module.exports = router;
