/**
 * db/migrateMovieSlots.js
 *
 * Runs at every start-up, after init() has added the per-film columns
 * (io1..io12, who1..who12, img1..img12) to `movies` (db/schemaSync.js adds
 * missing columns with their defaults: In, "In Library", no picture).
 *
 * Before per-film status existed, a disc was Out as a whole (movies.io /
 * movies.who). Such a row now has disc-level io = 0 while every film still
 * reads In, which is a combination the app never writes. This copies the
 * disc's borrower onto each of its films (1..numMovie) so a set that was Out
 * stays Out. Rows already carrying per-film status are left alone, so it is
 * safe to run on every start. Never throws -- a failure is logged.
 */
const { communitylibrary } = require('./db');

async function migrateMovieSlots() {
  try {
    const sets = [];
    const allIn = [];
    for (let i = 1; i <= 12; i++) {
      sets.push(`io${i}=IF(numMovie>=${i}, io, io${i})`, `who${i}=IF(numMovie>=${i}, who, who${i})`);
      allIn.push(`io${i}=1`);
    }
    const [res] = await communitylibrary.promise().query(
      `UPDATE movies SET ${sets.join(', ')} WHERE io=0 AND ${allIn.join(' AND ')}`
    );
    if (res.affectedRows) console.log(`  →  movies: copied the borrower onto the films of ${res.affectedRows} Out movie(s)`);
  } catch (e) {
    console.error('  ✗  migrateMovieSlots failed:', e.message);
  }
}

module.exports = migrateMovieSlots;
