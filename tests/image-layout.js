#!/usr/bin/env node
/**
 * tests/image-layout.js   (npm run check:images)   - 1.12.3
 *
 * No server or database needed. Checks the picture-path helpers and the "two items never share a file"
 * rule of the upload controller, using a throwaway folder under the OS temp directory.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { toNewUrl, isLegacyUrl } = require('../utils/imageLayout');
const { pickTarget, safeMediaFolder } = require('../controllers/mediaUploadController');

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) pass++; else { fail++; console.log('FAIL', name, extra || ''); } };

check('book url moves', toNewUrl('/images/books/a.webp') === '/images/communitylibrary/books/a.webp');
check('movie url moves', toNewUrl('/images/movies/dvd/a b.webp') === '/images/communitylibrary/movies/dvd/a b.webp');
check('new url unchanged', toNewUrl('/images/communitylibrary/books/a.webp') === '/images/communitylibrary/books/a.webp');
check('placeholder unchanged', toNewUrl('/images/placeholders/no-book-light.webp') === '/images/placeholders/no-book-light.webp');
check('external unchanged', toNewUrl('https://x.test/images/books/a.webp') === 'https://x.test/images/books/a.webp');
check('empty / null safe', toNewUrl('') === '' && toNewUrl(null) === '' && !isLegacyUrl(undefined));
check('isLegacyUrl', isLegacyUrl('/images/books/a.webp') && !isLegacyUrl('/images/communitylibrary/books/a.webp'));
check('media folders', safeMediaFolder('Blu-ray') === 'blu-ray' && safeMediaFolder('../x') === 'other');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imglayout-'));
const web = '/images/communitylibrary/books';
try {
  const a = pickTarget(dir, web, 'dune', '');
  check('free name used', a.webPath === `${web}/dune.webp` && path.basename(a.destPath) === 'dune.webp');
  fs.writeFileSync(a.destPath, 'x');
  const b = pickTarget(dir, web, 'dune', '');
  check('taken name gets -2', b.webPath === `${web}/dune-2.webp`, b.webPath);
  fs.writeFileSync(b.destPath, 'x');
  check('then -3', pickTarget(dir, web, 'dune', '').webPath === `${web}/dune-3.webp`);
  check('own picture is replaced', pickTarget(dir, web, 'dune', `${web}/dune-2.webp`).webPath === `${web}/dune-2.webp`);
  check('own picture, pre-1.12.3 url, is replaced', pickTarget(dir, web, 'dune', '/images/books/dune.webp').webPath === `${web}/dune.webp`);
  check("someone else's picture is not replaced", pickTarget(dir, web, 'dune', `${web}/other.webp`).webPath === `${web}/dune-3.webp`);
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

console.log(`image-layout: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
