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
const selectMovieForBorrow = `SELECT id, user_id, name AS title, io, lost FROM movies WHERE id=? AND user_id IN (?)`;
module.exports.selectBookForBorrow = selectBookForBorrow;
module.exports.selectMovieForBorrow = selectMovieForBorrow;
