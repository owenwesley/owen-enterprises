/**
 * scripts/copyImages.js   (run by hand: npm run images:copy)
 *
 * Copies the older pictures from the project's root images/ folder into client/public/images/:
 *   images/books/**   -> client/public/images/books/**
 *   images/movies/**  -> client/public/images/movies/**   (keeps the <media> sub-folders: dvd, blu-ray, ...)
 *
 * Never overwrites a file that is already there, never deletes anything, and prints a count of
 * copied / already-there / failed files so you can compare before removing the old folders.
 * Add --dry to only list what would be copied. images/placeholders is left alone (the server
 * reads it as a fallback).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const PAIRS = ['books', 'movies'].map((n) => [path.join(ROOT, 'images', n), path.join(ROOT, 'client', 'public', 'images', n)]);

let copied = 0, there = 0, failed = 0;

function walk(src, dest) {
  if (!fs.existsSync(src)) return;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) { walk(s, d); continue; }
    if (e.name === '.gitkeep') continue;
    try {
      if (fs.existsSync(d)) { there++; continue; }
      if (!DRY) { fs.mkdirSync(dest, { recursive: true }); fs.copyFileSync(s, d); }
      copied++;
      console.log(`${DRY ? 'would copy' : 'copied'}: ${path.relative(ROOT, s)} -> ${path.relative(ROOT, d)}`);
    } catch (err) {
      failed++;
      console.error(`FAILED: ${path.relative(ROOT, s)}: ${err.message}`);
    }
  }
}

for (const [src, dest] of PAIRS) {
  if (!fs.existsSync(src)) console.log(`(no ${path.relative(ROOT, src)} folder, skipped)`);
  walk(src, dest);
}
console.log(`\n${DRY ? 'Dry run: ' : ''}${copied} ${DRY ? 'to copy' : 'copied'}, ${there} already there, ${failed} failed.`);
process.exit(failed ? 1 : 0);
