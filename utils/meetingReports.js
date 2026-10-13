/**
 * utils/meetingReports.js   (1.13.5)
 *
 * Where a user's Meetings files live. NOT in client/public (nothing here is served statically):
 *
 *   <PDF_DIR>/<user_id>/logo.webp                           the user's own meeting logo (optional, one)
 *   <PDF_DIR>/<user_id>/reports/<name>-<Mon>-<YY>.pdf       reports waiting to be printed / saved
 *
 * PDF_DIR defaults to a folder named "pdf" in the folder ABOVE the app (IONOS:
 * /var/www/vhosts/owen-enterprises.net/pdf, next to patient-photos and the .env). Every file is
 * handed out only by routes/meetings/reports.js, behind sign-in and ownerOnly().
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const BASE_NAME = 'Richfield NA Report';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// The only names this module ever writes or serves. Anything else (../, other extensions...) is refused.
const NAME_RE = /^Richfield NA Report-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2}(-[2-9]|-[1-9]\d)?\.pdf$/;
const MAX_WAITING = 24;           // reports one user may leave undownloaded (disk protection)

const rootDir = () => (process.env.PDF_DIR
  ? path.resolve(process.env.PDF_DIR)
  : path.resolve(__dirname, '..', '..', 'pdf'));

const validUserId = (id) => /^[0-9]{1,12}$/.test(String(id));
const userDir = (id) => {
  if (!validUserId(id)) throw new Error('bad user id');
  return path.join(rootDir(), String(Number(id)));
};
const reportsDir = (id) => path.join(userDir(id), 'reports');
const logoPath = (id) => path.join(userDir(id), 'logo.webp');
const validName = (n) => typeof n === 'string' && NAME_RE.test(n);

/** "2026-10" -> "Oct-26". Without a valid period: the month BEFORE today (a reset on 11-01 reports October). */
function periodLabel(period, now = new Date()) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(period || ''));
  let year; let month;
  if (m) { year = Number(m[1]); month = Number(m[2]) - 1; }
  else {
    month = now.getMonth() - 1; year = now.getFullYear();
    if (month < 0) { month = 11; year -= 1; }
  }
  return `${MONTHS[month]}-${String(year).slice(-2)}`;
}

/** Save a PDF (Buffer) as "Richfield NA Report-Oct-26.pdf"; a taken name gets -2, -3 ... Returns the file name. */
async function saveReport(userId, buffer, period) {
  const dir = reportsDir(userId);
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await listReports(userId)).length >= MAX_WAITING) {
    const err = new Error('Too many reports are waiting. Download or print the old ones first.');
    err.status = 409; err.expose = true; throw err;
  }
  const label = periodLabel(period);
  for (let n = 1; n < 100; n += 1) {
    const name = `${BASE_NAME}-${label}${n === 1 ? '' : `-${n}`}.pdf`;
    try {
      // 'wx' = fail if it already exists, so two requests can never overwrite each other.
      await fs.promises.writeFile(path.join(dir, name), buffer, { flag: 'wx', mode: 0o600 });
      return name;
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  throw new Error('could not find a free report name');
}

/** [{ name, size, savedAt }] oldest first. A missing folder is simply "none waiting". */
async function listReports(userId) {
  let names;
  try { names = await fs.promises.readdir(reportsDir(userId)); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const out = [];
  for (const name of names.filter(validName)) {
    try {
      const st = await fs.promises.stat(path.join(reportsDir(userId), name));
      if (st.isFile()) out.push({ name, size: st.size, savedAt: st.mtime.toISOString() });
    } catch (_) { /* vanished between readdir and stat */ }
  }
  return out.sort((a, b) => a.savedAt.localeCompare(b.savedAt) || a.name.localeCompare(b.name));
}

const reportPath = (userId, name) => {
  if (!validName(name)) throw new Error('bad report name');
  return path.join(reportsDir(userId), name);
};

async function removeReport(userId, name) {
  try { await fs.promises.unlink(reportPath(userId, name)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}

/** Re-encode an uploaded picture as a small WebP logo (max 256 px, EXIF dropped, transparency kept). */
async function saveLogo(userId, buffer) {
  let out;
  try {
    out = await sharp(buffer, { limitInputPixels: 40e6, failOn: 'error' })
      .rotate()
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch (_) {
    const err = new Error('That file is not a picture we can read. Use a PNG, JPG or WebP.');
    err.status = 400; err.expose = true; throw err;
  }
  await fs.promises.mkdir(userDir(userId), { recursive: true, mode: 0o700 });
  const tmp = `${logoPath(userId)}.tmp`;
  await fs.promises.writeFile(tmp, out, { mode: 0o600 });
  await fs.promises.rename(tmp, logoPath(userId));     // replaces the old logo in one step
}

async function removeLogo(userId) {
  try { await fs.promises.unlink(logoPath(userId)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}

/** Everything of one user (account deletion). */
async function removeAllForUser(userId) {
  await fs.promises.rm(userDir(userId), { recursive: true, force: true });
}

module.exports = {
  BASE_NAME, MAX_WAITING, rootDir, userDir, logoPath, validName, validUserId, periodLabel,
  saveReport, listReports, reportPath, removeReport, saveLogo, removeLogo, removeAllForUser,
};
