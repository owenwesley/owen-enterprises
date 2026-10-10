/**
 * scripts/migrateImages.js  -  ONE-TIME asset clean-up
 *
 * Scans <project root>/images, skips placeholder pictures, decides whether each
 * remaining picture is a movie poster or a book cover, and MOVES it to:
 *
 *   movies -> client/public/images/movies/<same media folder>/   (images/movies/blu-ray/x.webp -> client/public/images/movies/blu-ray/x.webp)
 *             a movie with no media folder goes straight into client/public/images/movies/
 *   books  -> client/public/images/books/
 *
 * TWO WAYS TO RUN IT (same pattern as db/maintenance/scheduleRebuild.js)
 * ----------------------------------------------------------------------
 * 1. By hand, from the project root:
 *      node scripts/migrateImages.js --dry-run        show what WOULD happen, change nothing
 *      node scripts/migrateImages.js                  do it
 *      node scripts/migrateImages.js --mirror-build   do it, and also copy the moved files into
 *                                                     client/build/images so a running server serves them now
 *
 * 2. On the live server, automatically: set IMAGE_MIGRATION_ENABLED=true in the server's .env and
 *    restart. server.js calls runMigrateOnStart() after it starts. It runs ONCE (it writes the marker
 *    file images/.migrated-to-public when done), copies the moved files into client/build/images
 *    as well (production only serves client/build), and does nothing at all when the flag is unset.
 *    Delete the marker to run it again. Remove the flag when you are done.
 *
 * Rules:
 *  - Placeholders are never touched: anything inside a "placeholders" folder, or whose
 *    name looks like one (placeholder, default, blank, no-book, no-movie, no-image, ...).
 *  - Movie or book is decided from the folder it sits in (books/, movies/, dvd/ ...), then
 *    from words in the file name. If it is unclear the file is LEFT where it is and listed.
 *  - Nothing is overwritten: if the target already has a file with that name, it is skipped.
 *  - One file failing never stops the others.
 *  - Only picture files are considered (jpg, jpeg, png, webp, gif, avif, bmp, tif, tiff, svg).
 *  - Uses only Node's built-in fs and path modules.
 */

const fs = require('fs');
const path = require('path');

// ── Locations (this file lives in <root>/scripts/) ───────────────────────────
const ROOT         = path.resolve(__dirname, '..');
const SOURCE_DIR   = path.join(ROOT, 'images');
const PUBLIC_IMAGES = path.join(ROOT, 'client', 'public', 'images');
const BUILD_IMAGES  = path.join(ROOT, 'client', 'build', 'images');
const MOVIES_DIR   = path.join(PUBLIC_IMAGES, 'movies');
const BOOKS_DIR    = path.join(PUBLIC_IMAGES, 'books');
const MARKER       = path.join(SOURCE_DIR, '.migrated-to-public');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.tif', '.tiff', '.svg']);

// ── Placeholder detection ────────────────────────────────────────────────────
const PLACEHOLDER_FOLDER = /^placeholders?$/i;
const PLACEHOLDER_NAME = new RegExp(
  [
    'placeholder', 'default', 'blank', 'dummy', 'missing', 'fallback', 'sample',
    // the app's own "no picture" files: no-book-light.webp, no-movie-dark.webp, no-image.png ...
    '(^|[-_ .])no[-_ ]?(book|movie|image|img|cover|poster|photo|picture)',
  ].join('|'),
  'i'
);

// ── Movie / book detection ───────────────────────────────────────────────────
const BOOK_FOLDER  = /^(books?|ebooks?|novels?)$/i;
const MOVIE_FOLDER = /^(movies?|films?|dvds?|blu-?rays?|hd-?dvds?|vhs|posters?|boxsets?|single|(double|triple|quadruple)-feature)$/i;

const BOOK_WORDS  = /(^|[^a-z])(books?|novels?|isbn|paperback|hardcover|ebook)([^a-z]|$)/i;
const MOVIE_WORDS = /(^|[^a-z])(movies?|films?|posters?|dvd|blu-?ray|hd-?dvd|vhs|box-?set|trailer)([^a-z]|$)/i;

function isPlaceholder(relPath) {
  const parts = relPath.split(path.sep);
  const fileName = parts[parts.length - 1];
  if (parts.slice(0, -1).some((p) => PLACEHOLDER_FOLDER.test(p))) return true;
  return PLACEHOLDER_NAME.test(path.parse(fileName).name);
}

/** Returns 'movie', 'book', or null when it cannot tell. */
function classify(relPath) {
  const parts = relPath.split(path.sep);
  const folders = parts.slice(0, -1);
  const name = path.parse(parts[parts.length - 1]).name;

  // 1. Folder names are the strongest hint (nearest folder first).
  for (let i = folders.length - 1; i >= 0; i--) {
    if (BOOK_FOLDER.test(folders[i]))  return 'book';
    if (MOVIE_FOLDER.test(folders[i])) return 'movie';
  }
  // 2. Words in the file name.
  const book  = BOOK_WORDS.test(name);
  const movie = MOVIE_WORDS.test(name);
  if (book && !movie) return 'book';
  if (movie && !book) return 'movie';
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function moveFile(from, to) {
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;     // different disk: copy, then remove the original
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    fs.unlinkSync(from);
  }
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/**
 * Does the whole job. Returns a summary object and prints the log.
 *   dryRun       - change nothing, only report
 *   mirrorBuild  - also copy each moved file into client/build/images (when client/build exists)
 */
function migrateImages({ dryRun = false, mirrorBuild = false } = {}) {
  const log = (...a) => console.log(...a);
  const createdFolders = [];

  /** Creates the folder (and any missing parents) with mkdirSync recursive, and records EVERY level it creates. */
  function ensureFolder(dir) {
    const missing = [];
    for (let d = dir; !fs.existsSync(d); d = path.dirname(d)) missing.unshift(d);   // outermost first
    if (!missing.length) return;
    if (!dryRun) fs.mkdirSync(dir, { recursive: true });
    missing.forEach((d) => { if (!createdFolders.includes(d)) createdFolders.push(d); });
  }

  const summary = { moved: [], placeholders: [], unclear: [], clashes: [], ignored: [], failed: [], mirrored: [], ok: true };
  const mirror = mirrorBuild && fs.existsSync(path.join(ROOT, 'client', 'build'));

  log(`Image migration${dryRun ? '  (DRY RUN - nothing will be changed)' : ''}`);
  log(`Project root : ${ROOT}`);
  log(`Source       : ${rel(SOURCE_DIR)}/\n`);

  if (!fs.existsSync(SOURCE_DIR) || !fs.statSync(SOURCE_DIR).isDirectory()) {
    log(`ERROR: source folder not found: ${SOURCE_DIR}`);
    log('Run this from a project that has an "images" folder at its root.');
    summary.ok = false;
    return summary;
  }

  for (const file of walk(SOURCE_DIR)) {
    const relToSource = path.relative(SOURCE_DIR, file);
    const ext = path.extname(file).toLowerCase();

    if (!IMAGE_EXT.has(ext)) { summary.ignored.push(file); continue; }          // .gitkeep, marker, .txt ...

    if (isPlaceholder(relToSource)) { summary.placeholders.push(file); continue; }

    const kind = classify(relToSource);
    if (!kind) { summary.unclear.push(file); continue; }

    // Movies keep their media-type folder from images/movies/<type>/ (dvd, blu-ray, vhs, ...);
    // anything else goes straight into movies/. Books go to books/.
    const parts = relToSource.split(path.sep);
    const mediaFolders = parts[0].toLowerCase() === 'movies' ? parts.slice(1, -1) : [];
    const targetDir = kind === 'movie' ? path.join(MOVIES_DIR, ...mediaFolders) : BOOKS_DIR;
    const target = path.join(targetDir, path.basename(file));

    if (fs.existsSync(target)) { summary.clashes.push({ file, target }); continue; }

    try {
      ensureFolder(targetDir);
      if (!dryRun) moveFile(file, target);
      summary.moved.push({ file, target, kind });
      log(`${dryRun ? 'WOULD MOVE' : 'MOVED'}  [${kind}]  ${rel(file)}  ->  ${rel(target)}`);

      // The live server only serves client/build, so put a copy there too.
      if (mirror) {
        const inBuild = path.join(BUILD_IMAGES, path.relative(PUBLIC_IMAGES, target));
        if (!fs.existsSync(inBuild)) {
          ensureFolder(path.dirname(inBuild));
          if (!dryRun) fs.copyFileSync(target, inBuild, fs.constants.COPYFILE_EXCL);
          summary.mirrored.push(inBuild);
          log(`${dryRun ? 'WOULD COPY' : 'COPIED'} to build  ->  ${rel(inBuild)}`);
        }
      }
    } catch (err) {
      summary.failed.push({ file, message: err.message });
      summary.ok = false;
      log(`FAILED  ${rel(file)}: ${err.message}`);
    }
  }

  // Make sure both target folders exist even when nothing was moved into them.
  ensureFolder(MOVIES_DIR);
  ensureFolder(BOOKS_DIR);

  // ── Summary ────────────────────────────────────────────────────────────────
  log('\n──────── Summary ────────');

  log(`\nFolders ${dryRun ? 'that would be ' : ''}generated (${createdFolders.length}):`);
  if (createdFolders.length) createdFolders.forEach((d) => log(`  + ${rel(d)}/`));
  else log('  (none - all target folders already existed)');

  log(`\nFiles ${dryRun ? 'that would be ' : ''}moved (${summary.moved.length}):`);
  if (summary.moved.length) summary.moved.forEach((m) => log(`  [${m.kind}] ${rel(m.file)}  ->  ${rel(m.target)}`));
  else log('  (none)');

  if (mirror) log(`\nCopies ${dryRun ? 'that would be ' : ''}placed in client/build/images: ${summary.mirrored.length}`);

  log(`\nPlaceholders safely left out, not touched (${summary.placeholders.length}):`);
  if (summary.placeholders.length) summary.placeholders.forEach((f) => log(`  - ${rel(f)}`));
  else log('  (none found)');

  if (summary.unclear.length) {
    log(`\nLeft in place - could not tell movie from book (${summary.unclear.length}). Move these by hand:`);
    summary.unclear.forEach((f) => log(`  ? ${rel(f)}`));
  }
  if (summary.clashes.length) {
    log(`\nSkipped - a file with that name already exists at the target (${summary.clashes.length}):`);
    summary.clashes.forEach((c) => log(`  ! ${rel(c.file)}  (target: ${rel(c.target)})`));
  }
  if (summary.failed.length) {
    log(`\nFAILED (${summary.failed.length}):`);
    summary.failed.forEach((f) => log(`  x ${rel(f.file)}: ${f.message}`));
  }
  if (summary.ignored.length) {
    log(`\nIgnored - not a picture file (${summary.ignored.length}): ${summary.ignored.map(rel).join(', ')}`);
  }

  log(dryRun
    ? '\nDry run finished. Run again without --dry-run to apply.'
    : '\nDone.' + (mirror ? '' : ' Rebuild the client (cd client && npm run build) so the moved files are in client/build.'));
  return summary;
}

/**
 * Called from server.js after start-up. Does NOTHING unless IMAGE_MIGRATION_ENABLED=true.
 * Runs once: writes images/.migrated-to-public when it finishes without a failure.
 */
function runMigrateOnStart() {
  if (String(process.env.IMAGE_MIGRATION_ENABLED).toLowerCase() !== 'true') return null;
  if (fs.existsSync(MARKER)) {
    console.log('  image migration: already done (delete images/.migrated-to-public to run it again)');
    return null;
  }
  console.log('  image migration: IMAGE_MIGRATION_ENABLED=true - running once');
  try {
    const summary = migrateImages({ mirrorBuild: true });
    if (summary.ok) fs.writeFileSync(MARKER, `migrated ${new Date().toISOString()}\n`);
    else console.error('  image migration finished with problems - not marked as done, it will try again on the next start');
    return summary;
  } catch (e) {
    console.error('  x image migration failed:', e.message);
    return null;
  }
}

module.exports = { migrateImages, runMigrateOnStart };

if (require.main === module) {
  const s = migrateImages({
    dryRun: process.argv.includes('--dry-run'),
    mirrorBuild: process.argv.includes('--mirror-build'),
  });
  process.exit(s.ok ? 0 : 1);
}
