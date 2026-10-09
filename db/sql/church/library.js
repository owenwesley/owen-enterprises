// ── Church library catalog (reads the communitylibrary database) ───────────────
// Run on the communitylibrary pool, with the user ids of members who switched
// sharing on. Only the columns listed here ever leave the server: no borrower
// names (`who`), no pictures, no contacts table at all.
const selectSharedBooks =
  `SELECT user_id, title, author, copywrite, io, lost FROM books
    WHERE user_id IN (?) ORDER BY title, id`;

const filmCols = [];
for (let i = 1; i <= 12; i++) filmCols.push(`name${i}`, `io${i}`);
const selectSharedMovies =
  `SELECT user_id, name, featureMedia, numMovie, io, lost, ${filmCols.join(', ')} FROM movies
    WHERE user_id IN (?) ORDER BY name, id`;

module.exports = { selectSharedBooks, selectSharedMovies };
