// Column lists are built from the same 12-slot layout as the `movies` table in
// db/init.js (and db/db.js) and the params built by routes/communitylibrary/
// movies/_fields.js, so the three cannot drift apart again. (This file used to
// hold a 10-column INSERT/UPDATE from the pre-12-slot design -- rated, len,
// year_released, media -- which no longer exist, so every movie add/edit
// failed with "Unknown column".)
//
// Param order, add:  user_id, name, featureMedia, numMovie, 12 x (name, rated,
//                    length, yearR, media, io, who, img), io, who, lost,
//                    img_url                                         = 104
// Param order, edit: the same without user_id, then id, user_id      = 105
//
// Per film (slot) io / who / img: whether THAT film is out and with whom, and
// its own picture. The disc-level io / who are a summary the server derives
// from the films (see _fields.js buildMovie); img_url is the set's cover.
const slotCols = [];
for (let i = 1; i <= 12; i++) {
  slotCols.push(`name${i}`, `rated${i}`, `length${i}`, `yearR${i}`, `media${i}`, `io${i}`, `who${i}`, `img${i}`);
}

// Every column except id and user_id, in route order.
const dataCols = ['name', 'featureMedia', 'numMovie', ...slotCols, 'io', 'who', 'lost', 'img_url'];

const insertMovie =
  `INSERT INTO movies (user_id,${dataCols.join(',')})
   VALUES (${['user_id', ...dataCols].map(() => '?').join(',')})`;

const selectMovies = `SELECT * FROM movies`;

// Scoped by id AND user_id, like every other edit statement.
const updateMovie =
  `UPDATE movies SET ${dataCols.map((c) => `${c}=?`).join(',')}
   WHERE id=? AND user_id=?`;

// Param order matches routes/communitylibrary/movies/delete.js: [id, user_id].
// Scoped to the owner so a row id alone can never delete another user's movie.
const deleteMovieById = `DELETE FROM movies WHERE id=? AND user_id=?`;
const deleteAllMovies = `DELETE FROM movies WHERE user_id=?`;

module.exports = { insertMovie, selectMovies, updateMovie, deleteMovieById, deleteAllMovies };
