const insertMovie =
  `INSERT INTO movies (user_id,name,rated,len,year_released,media,io,who,lost,img_url)
   VALUES (?,?,?,?,?,?,?,?,?,?)`;

const selectMovies = `SELECT * FROM movies`;

const updateMovie =
  `UPDATE movies SET
    user_id=?,name=?,rated=?,len=?,year_released=?,media=?,io=?,who=?,lost=?,img_url=?
   WHERE id=?`;

// Param order matches routes/communitylibrary/movies/delete.js: [id, user_id].
// Scoped to the owner so a row id alone can never delete another user's movie.
const deleteMovieById = `DELETE FROM movies WHERE id=? AND user_id=?`;
const deleteAllMovies = `DELETE FROM movies WHERE user_id=?`;

module.exports = { insertMovie, selectMovies, updateMovie, deleteMovieById, deleteAllMovies };
