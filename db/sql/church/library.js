// ── Church library catalog (reads the communitylibrary database) ───────────────
// Run on the communitylibrary pool, with the user ids of members who switched
// sharing on. Only the columns listed here ever leave the server: no borrower
// names (`who`) and no contacts table at all. Since 1.11.27 the cover picture path (img_url / img1..12)
// and the item's own row id (needed to ask to borrow it) are included.
const selectSharedBooks =
  `SELECT id, user_id, title, author, copywrite, io, lost, img_url FROM books
    WHERE user_id IN (?) ORDER BY title, id`;

const filmCols = [];
for (let i = 1; i <= 12; i++) filmCols.push(`name${i}`, `io${i}`, `img${i}`);
const selectSharedMovies =
  `SELECT id, user_id, name, featureMedia, numMovie, io, lost, img_url, ${filmCols.join(', ')} FROM movies
    WHERE user_id IN (?) ORDER BY name, id`;

module.exports = { selectSharedBooks, selectSharedMovies };

// Ask-to-borrow: the one row a request points at. Read only after the owner is checked against the
// viewer's sharers list, so a row id alone never reveals anything.
const selectBookForBorrow = `SELECT id, user_id, title, io, lost FROM books WHERE id=? AND user_id IN (?)`;
const selectMovieForBorrow = `SELECT id, user_id, name AS title, numMovie, io, lost FROM movies WHERE id=? AND user_id IN (?)`;
module.exports.selectBookForBorrow = selectBookForBorrow;
module.exports.selectMovieForBorrow = selectMovieForBorrow;

// Accepting a request marks the item Out to the borrower, in one guarded statement: it only changes
// a row that is still In and not lost, so two accepts can never both succeed. A movie set is lent
// whole: the disc-level io / who and every film slot (1..numMovie) are set, the same shape the
// movie edit route stores (routes/communitylibrary/movies/_fields.js).
const reserveBook = `UPDATE books SET io=0, who=? WHERE id=? AND user_id=? AND io=1 AND lost=0`;
const reserveMovieSql = (numMovie) => {
  const n = Math.min(12, Math.max(1, Math.trunc(Number(numMovie)) || 1));
  const sets = ['io=0', 'who=?'];
  for (let i = 1; i <= n; i++) sets.push(`io${i}=0`, `who${i}=?`);
  return { sql: `UPDATE movies SET ${sets.join(', ')} WHERE id=? AND user_id=? AND io=1 AND lost=0`, slots: n };
};
module.exports.reserveBook = reserveBook;
module.exports.reserveMovieSql = reserveMovieSql;
