/**
 * utils/patientPhotos.js   (1.13.0)
 *
 * Storage and small helpers for patient photos (a picture of a leg, arm, sore or rash).
 *
 * WHERE FILES LIVE: PHOTO_DIR, default = a folder named "patient-photos" in the folder ABOVE the
 * app folder (on IONOS: /var/www/vhosts/owen-enterprises.net/patient-photos, next to the .env).
 * That is outside client/public and outside the document root, and nothing in server.js serves it
 * statically: the only way to a picture is an authenticated route that checks who is asking.
 *
 * FILES: <fileKey>.webp (full, longest side 1600 px) and <fileKey>_t.webp (thumbnail, 320 px).
 * fileKey is 32 random hex characters, never derived from the patient or the person's name.
 * Every upload is re-encoded by sharp, so whatever the phone sent (JPEG, HEIC converted by the
 * browser, PNG...) comes out as a clean WebP with ALL metadata removed (sharp drops EXIF by
 * default, which includes GPS position and the phone model). The picture is rotated upright first.
 *
 * Switch: PATIENT_PHOTOS=on in the environment turns the feature on; anything else = off.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const FULL_SIDE = 1600;
const THUMB_SIDE = 320;
const KEY_RE = /^[a-f0-9]{32}$/;

// Keep libvips small: one worker thread, no operation cache (global for this process).
sharp.cache(false);
sharp.concurrency(1);

const enabled = () => String(process.env.PATIENT_PHOTOS || '').trim().toLowerCase() === 'on';

/** Max photos one patient may keep (disk protection). PHOTO_MAX_PER_PATIENT in the environment changes it. */
const maxPerPatient = () => {
  const n = parseInt(process.env.PHOTO_MAX_PER_PATIENT, 10);
  return Number.isFinite(n) && n > 0 ? n : 200;
};

const photoDir = () => (process.env.PHOTO_DIR
  ? path.resolve(process.env.PHOTO_DIR)
  : path.resolve(__dirname, '..', '..', 'patient-photos'));

const validKey = (k) => typeof k === 'string' && KEY_RE.test(k);

/** Absolute path of a stored file. Throws for anything that is not a key this module made. */
function filePath(fileKey, size = 'full') {
  if (!validKey(fileKey)) throw new Error('bad photo key');
  return path.join(photoDir(), size === 'thumb' ? `${fileKey}_t.webp` : `${fileKey}.webp`);
}

/**
 * Re-encode an uploaded picture and store it. Returns the new fileKey.
 * Throws an Error with .status = 400 and .expose = true when the bytes are not a readable picture.
 */
async function saveImage(buffer) {
  let full; let thumb;
  try {
    // Memory-light on purpose (shared hosting has little RAM): the big picture is decoded ONCE,
    // the thumbnail is made from the already-small result, and sharp works with one thread and no cache.
    full = await sharp(buffer, { failOn: 'error', limitInputPixels: 60e6, sequentialRead: true }).rotate()
      .resize(FULL_SIDE, FULL_SIDE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer();
    thumb = await sharp(full)
      .resize(THUMB_SIDE, THUMB_SIDE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 }).toBuffer();
  } catch (e) {
    const tooBig = /pixel limit|memory|alloc/i.test(String(e && e.message));
    const err = new Error(tooBig
      ? 'That picture is too large for the server to handle. Choose a smaller one or lower the camera resolution.'
      : 'That file could not be read as a picture. Please take or choose a photo.');
    err.status = tooBig ? 413 : 400; err.expose = true;
    throw err;
  }
  await fs.promises.mkdir(photoDir(), { recursive: true, mode: 0o700 });
  const fileKey = crypto.randomBytes(16).toString('hex');
  await fs.promises.writeFile(filePath(fileKey, 'full'), full, { mode: 0o600 });
  await fs.promises.writeFile(filePath(fileKey, 'thumb'), thumb, { mode: 0o600 });
  return fileKey;
}

/** Delete both files of a photo. Missing files are fine; never throws. */
async function removeFiles(fileKey) {
  if (!validKey(fileKey)) return;
  for (const size of ['full', 'thumb']) {
    try { await fs.promises.unlink(filePath(fileKey, size)); } catch { /* already gone */ }
  }
}

/** YYYY-MM-DD for today in the server's local time. */
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** A real calendar date in YYYY-MM-DD, not more than one day ahead; otherwise null. */
function cleanDate(v) {
  const s = String(v || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  if (d.getTime() > Date.now() + 36 * 3600 * 1000) return null;
  if (s < '1990-01-01') return null;
  return s;
}

/** Trimmed text with control characters removed, cut to `max`. */
const cleanText = (v, max) => String(v === undefined || v === null ? '' : v)
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim().slice(0, max);

/** Send a stored picture. Private and never cached, so it cannot be read back from a shared device's cache. */
function sendPhoto(res, fileKey, size) {
  const file = filePath(fileKey, size);
  res.set({
    'Content-Type': 'image/webp',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  });
  return new Promise((resolve) => {
    res.sendFile(file, { dotfiles: 'deny', cacheControl: false, lastModified: false, etag: false }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Not found' });
      resolve();
    });
  });
}

module.exports = {
  enabled, maxPerPatient, photoDir, validKey, filePath, saveImage, removeFiles,
  today, cleanDate, cleanText, sendPhoto,
};
