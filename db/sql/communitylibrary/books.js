const insertBook =
  `INSERT INTO books (user_id,title,author,publisher,copywrite,isbn,io,who,lost,img_url)
   VALUES (?,?,?,?,?,?,?,?,?,?)`;

const selectBooks = `SELECT * FROM books`;

const updateBook =
  `UPDATE books SET
    user_id=?,title=?,author=?,publisher=?,copywrite=?,isbn=?,io=?,who=?,lost=?,img_url=?
   WHERE id=?`;

// Param order matches routes/communitylibrary/books/delete.js: [id, user_id].
// Scoped to the owner so a row id alone can never delete another user's book.
const deleteBookById = `DELETE FROM books WHERE id=? AND user_id=?`;
const deleteAllBooks = `DELETE FROM books WHERE user_id=?`;

module.exports = { insertBook, selectBooks, updateBook, deleteBookById, deleteAllBooks };
