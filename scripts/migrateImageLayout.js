/**
 * scripts/migrateImageLayout.js   (run by hand: npm run images:migrate)
 *
 * Moves Community Library pictures to the 1.12.3 layout and rewrites the paths stored in the database:
 *
 *   client/public/images/books/**    -> client/public/images/communitylibrary/books/**
 *   client/public/images/movies/**   -> client/public/images/communitylibrary/movies/**   (keeps dvd, blu-ray, ...)
 *   books.img_url, movies.img_url, movies.img1..img12:
 *       /images/books/...  -> /images/communitylibrary/books/...
 *       /images/movies/... -> /images/communitylibrary/movies/...
 *
 *   npm run images:migrate             REPORT only: lists what would move and which rows would change
 *   npm run images:migrate -- --apply  does it
 *
 * Safe to run twice (a second run finds nothing to do). Never overwrites a file that is already at the
 * destination (it is reported as a CONFLICT and left where it is), never deletes a picture. Rows are
 * rewritten in one transaction per table. The older root images/ folder is not touched: copy it across
 * with npm run images:copy. Back up the DATABASE and the pictures first (npm run images:backup).
 * Run it when the app is idle.
 */
const fs = require('fs');
const path = require('path');
// Settings: a .env in the app folder, else one in the folder ABOVE the app folder (outside the web root;
// handy on IONOS/Plesk, where the panel's variables are not passed to scripts). Values already set win.
const ENV_FILES = [path.resolve(__dirname, '../.env'), path.resolve(__dirname, '../../.env')];
for (const f of ENV_FILES) require('dotenv').config({ path: f, quiet: true });
const mysql = require('mysql2/promise');
const { toNewUrl, isLegacyUrl, LIB_FOLDER } = require('../utils/imageLayout');

const ROOT = path.join(__dirname, '..');
const IMAGES = path.join(ROOT, 'client', 'public', 'images');
const APPLY = process.argv.includes('--apply');

let moved = 0, conflicts = 0, failed = 0;

function moveTree(src, dest) {
  if (!fs.existsSync(src)) return;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) { moveTree(s, d); continue; }
    if (e.name === '.gitkeep') continue;
    try {
      if (fs.existsSync(d)) { conflicts++; console.log(`CONFLICT (already there, left alone): ${path.relative(ROOT, s)}`); continue; }
      if (APPLY) { fs.mkdirSync(dest, { recursive: true }); fs.renameSync(s, d); }
      moved++;
      console.log(`${APPLY ? 'moved' : 'would move'}: ${path.relative(ROOT, s)} -> ${path.relative(ROOT, d)}`);
    } catch (err) {
      failed++;
      console.error(`FAILED: ${path.relative(ROOT, s)}: ${err.message}`);
    }
  }
}

// Removes now-empty old folders (only empty ones; fs.rmdirSync refuses otherwise).
function pruneEmpty(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) pruneEmpty(path.join(dir, e.name));
  const left = fs.readdirSync(dir).filter((n) => n !== '.gitkeep');
  if (!left.length) { try { fs.rmSync(path.join(dir, '.gitkeep'), { force: true }); fs.rmdirSync(dir); } catch { /* leave it */ } }
}

async function migrateRows(db, table, cols) {
  const [rows] = await db.query(`SELECT id, ${cols.join(', ')} FROM ${table}`);
  const changes = [];
  for (const r of rows) {
    const set = {};
    for (const c of cols) if (isLegacyUrl(r[c])) set[c] = toNewUrl(r[c]);
    if (Object.keys(set).length) changes.push({ id: r.id, set });
  }
  if (APPLY && changes.length) {
    await db.beginTransaction();
    try {
      for (const ch of changes) {
        const keys = Object.keys(ch.set);
        await db.query(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => ch.set[k]), ch.id]);
      }
      await db.commit();
    } catch (e) { await db.rollback(); throw e; }
  }
  console.log(`${table}: ${changes.length} row(s) ${APPLY ? 'rewritten' : 'would be rewritten'}`);
  return changes.length;
}

(async () => {
  console.log(APPLY ? 'APPLY mode.\n' : 'REPORT only (nothing is changed). Add --apply to do it.\n');
  for (const n of ['books', 'movies']) moveTree(path.join(IMAGES, n), path.join(IMAGES, LIB_FOLDER, n));
  if (APPLY) for (const n of ['books', 'movies']) pruneEmpty(path.join(IMAGES, n));
  console.log(`files: ${moved} ${APPLY ? 'moved' : 'to move'}, ${conflicts} conflict(s), ${failed} failed\n`);
  if (APPLY) {
    // Keep the folder the app expects, and the reserved BG Tracker one.
    for (const d of [path.join(IMAGES, LIB_FOLDER, 'books'), path.join(IMAGES, LIB_FOLDER, 'movies'), path.join(IMAGES, 'bgtracker')]) fs.mkdirSync(d, { recursive: true });
  }

  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASS,
    database: process.env.DB_COMMUNITYLIBRARY || 'communitylibrary',
  });
  try {
    const movieCols = ['img_url'];
    for (let i = 1; i <= 12; i++) movieCols.push(`img${i}`);
    await migrateRows(db, 'books', ['img_url']);
    await migrateRows(db, 'movies', movieCols);
  } finally { await db.end(); }
  console.log(APPLY ? '\nDone. Run npm run images:check to confirm every picture is found.' : '\nNothing changed. If this looks right, run it again with --apply (after a database + pictures backup).');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  const why = e.message || (e.errors && e.errors.map((x) => x.message || x.code).join('; ')) || e.code || String(e);
  console.error('images:migrate failed:', why);
  console.error('  (database host: ' + (process.env.DB_HOST || 'localhost') + ', user: ' + (process.env.DB_USER || '(none)') + ', .env found: ' + (ENV_FILES.filter((f) => fs.existsSync(f)).join(', ') || 'none') + ')');
  process.exit(2);
});
