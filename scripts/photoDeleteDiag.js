#!/usr/bin/env node
/**
 * scripts/photoDeleteDiag.js   (node scripts/photoDeleteDiag.js)   - 1.13.11
 * Shows why a photo file might not be deletable. Uses the SAME folder rules as the app (PHOTO_DIR from the
 * environment / settings file, else the default), writes a tiny test file there, tries to delete it the way
 * utils/patientPhotos.js does, and prints the result, the folder's owner and permissions, and who you are.
 * Run it as the SAME user that runs the app, with the same PHOTO_DIR (e.g. PHOTO_DIR=/path node scripts/photoDeleteDiag.js; only the app-folder .env is read, not the private one). It leaves nothing behind. Touches no database and no real photo.
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const P = require('../utils/patientPhotos');

(async () => {
  const dir = P.photoDir();
  console.log(`platform ${process.platform}, node ${process.version}, user uid ${process.getuid ? process.getuid() : 'n/a'}`);
  console.log(`photo folder: ${dir}`);
  try { const st = fs.statSync(dir); console.log(`folder owner uid ${st.uid}, mode ${(st.mode & 0o777).toString(8)}`); }
  catch (e) { console.log(`folder does not exist yet (${e.code}); it is created on the first upload`); }
  const key = 'f'.repeat(32);
  const f = P.filePath(key, 'full'), t = P.filePath(key, 'thumb');
  try {
    await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(f, 'x', { mode: 0o600 });
    await fs.promises.writeFile(t, 'x', { mode: 0o600 });
    console.log('wrote two test files');
  } catch (e) { console.log(`CANNOT WRITE: ${e.code} ${e.message}`); process.exit(1); }
  await P.removeFiles(key);
  const left = [f, t].filter((x) => fs.existsSync(x));
  if (left.length === 0) console.log('RESULT: delete works here. The failure is probably a different folder/user than the app uses, or a timing or file-locking issue; compare this output with the test server log.');
  else {
    console.log(`RESULT: could NOT delete ${left.map((x) => path.basename(x)).join(', ')}`);
    for (const x of left) { try { fs.unlinkSync(x); } catch (e) { console.log(`  direct unlink error: ${e.code} ${e.message}`); } }
    for (const x of left) { try { fs.unlinkSync(x); } catch { /* still stuck */ } }
  }
})();
