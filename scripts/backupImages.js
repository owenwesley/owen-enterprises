/**
 * scripts/backupImages.js   (run by hand)
 *
 *   npm run images:backup                       -> ~/images-backup-YYYY-MM-DD.tar.gz  (your home folder, OUTSIDE the app folder)
 *   npm run images:backup -- --out /some/dir    -> that folder instead
 *   npm run images:restore -- <file.tar.gz>     -> puts the pictures back (never overwrites a file already there)
 *
 * Why: pictures uploaded in the app are written to client/public/images/ while the site runs. A redeploy
 * that replaces the app folder (or rebuilds from git) would not contain them. Run a backup before every
 * deploy, and restore afterwards if pictures are missing. Needs the `tar` command (standard on Linux/macOS).
 * Backs up client/public/images and the older images/ folder. Reads only; never deletes anything.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const restore = path.basename(process.argv[1]) === 'restoreImages.js' || args[0] === '--restore';

function tar(argv) {
  const r = spawnSync('tar', argv, { stdio: 'inherit', cwd: ROOT });
  if (r.error) { console.error('Could not run tar:', r.error.message, '\nDownload the folders client/public/images and images by SFTP instead.'); process.exit(2); }
  if (r.status !== 0) process.exit(r.status || 1);
}

if (restore) {
  const file = args.find((a) => !a.startsWith('--'));
  if (!file || !fs.existsSync(file)) { console.error('Usage: npm run images:restore -- path/to/images-backup.tar.gz'); process.exit(1); }
  // Keep files already on disk. GNU tar: --skip-old-files (silent); bsdtar (macOS): -k.
  const gnu = spawnSync('tar', ['--version'], { encoding: 'utf8' });
  const keep = /GNU/.test(String(gnu.stdout)) ? '--skip-old-files' : '-k';
  tar(['-xzf', path.resolve(file), keep]);
  console.log('Restored (files already on disk were left alone).');
} else {
  const oi = args.indexOf('--out');
  const dir = path.resolve(oi >= 0 && args[oi + 1] ? args[oi + 1] : os.homedir());
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `images-backup-${new Date().toISOString().slice(0, 10)}.tar.gz`);
  const items = ['client/public/images', 'images'].filter((p) => fs.existsSync(path.join(ROOT, p)));
  if (!items.length) { console.error('No image folders found.'); process.exit(1); }
  tar(['-czf', out, ...items]);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`Backup written: ${out} (${kb} KB). Download it before you deploy.`);
}
