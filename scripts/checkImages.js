/**
 * scripts/checkImages.js   (run by hand: npm run images:check)
 *
 * Read-only. Looks at every picture path stored in the database (books.img_url, movies.img_url and
 * movies.img1..img12) and checks that the file really exists on disk, in client/public/images/ or in
 * the older root images/ folder (the two places server.js serves from). Prints every row whose
 * picture is missing, empty, or not a /images/... path, so "no movie pics" can be traced to a
 * concrete row and file name. It changes nothing.
 *
 *   npm run images:check              both books and movies
 *   npm run images:check -- movies    movies only
 *   npm run images:check -- --all     also list rows that are fine
 */
const fs = require('fs');
const path = require('path');
// Settings: a .env in the app folder, else one in the folder ABOVE the app folder (outside the web root;
// handy on IONOS/Plesk, where the panel's variables are not passed to scripts). Values already set win.
const ENV_FILES = [path.resolve(__dirname, '../.env'), path.resolve(__dirname, '../../.env')];
for (const f of ENV_FILES) require('dotenv').config({ path: f, quiet: true });
const mysql = require('mysql2/promise');

const ROOT = path.join(__dirname, '..');
const DIRS = [path.join(ROOT, 'client', 'public', 'images'), path.join(ROOT, 'images')];
const args = process.argv.slice(2);
const ALL = args.includes('--all');
const only = args.find((a) => a === 'books' || a === 'movies');

function locate(url) {
  const u = String(url || '').trim();
  if (!u) return { state: 'empty' };
  if (/^(https?:)?\/\//i.test(u) || u.startsWith('data:')) return { state: 'external' };
  if (!u.startsWith('/images/')) return { state: 'badpath' };
  let rel;
  try { rel = decodeURI(u.slice('/images/'.length)); } catch { return { state: 'badpath' }; }
  const rels = [rel];
  if (/^(books|movies)\//.test(rel)) rels.unshift('communitylibrary/' + rel);   // pre-1.12.3 path: server.js answers it from communitylibrary/ first
  for (const d of DIRS) for (const r of rels) {
    const p = path.join(d, r);
    if (p.startsWith(d + path.sep) && fs.existsSync(p)) return { state: 'ok', where: path.relative(ROOT, p) };
  }
  return { state: 'missing' };
}

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASS,
    database: process.env.DB_COMMUNITYLIBRARY || 'communitylibrary',
  });
  const counts = { ok: 0, empty: 0, external: 0, badpath: 0, missing: 0, old: 0 };
  const note = (kind, id, label, field, url) => {
    const r = locate(url);
    counts[r.state]++;
    if (/^\/images\/(books|movies)\//.test(String(url || ''))) counts.old++;
    if (r.state === 'ok' && !ALL) return;
    if (r.state === 'external' && !ALL) return;
    console.log(`${r.state.toUpperCase().padEnd(8)} ${kind} #${id} "${label}" ${field}: ${url || '(empty)'}`);
  };

  if (!only || only === 'books') {
    const [rows] = await db.query('SELECT id, title, img_url FROM books');
    for (const b of rows) note('book', b.id, b.title, 'img_url', b.img_url);
  }
  if (!only || only === 'movies') {
    const cols = ['id', 'name', 'numMovie', 'img_url'];
    for (let i = 1; i <= 12; i++) cols.push(`name${i}`, `img${i}`);
    const [rows] = await db.query(`SELECT ${cols.join(', ')} FROM movies`);
    for (const m of rows) {
      note('movie', m.id, m.name, 'img_url', m.img_url);
      // Films of a set (single movies keep their picture in img_url only).
      if (Number(m.numMovie) > 1) {
        for (let i = 1; i <= Math.min(12, Number(m.numMovie)); i++) note('movie', m.id, `${m.name} / ${m[`name${i}`] || 'film ' + i}`, `img${i}`, m[`img${i}`]);
      }
    }
  }
  await db.end();
  console.log(`\nok ${counts.ok}, empty ${counts.empty}, missing ${counts.missing}, not a /images path ${counts.badpath}, external ${counts.external}`);
  if (counts.old) console.log(`${counts.old} picture path(s) still use the pre-1.12.3 /images/books|movies/ form: run npm run images:migrate (report), then -- --apply.`);
  if (counts.missing || counts.badpath) {
    console.log('MISSING = the database points at a file that is not in client/public/images or images (copy it there, or run npm run images:copy).');
  }
  process.exit(counts.missing || counts.badpath ? 1 : 0);
})().catch((e) => { const why = e.message || (e.errors && e.errors.map((x) => x.message || x.code).join('; ')) || e.code || String(e);
  console.error('images:check failed:', why);
  console.error('  (database host: ' + (process.env.DB_HOST || 'localhost') + ', user: ' + (process.env.DB_USER || '(none)') + ', .env found: ' + (ENV_FILES.filter((f) => fs.existsSync(f)).join(', ') || 'none') + ')'); process.exit(2); });
