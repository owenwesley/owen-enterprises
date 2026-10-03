const insertBook =
  `INSERT INTO books (user_id,title,author,publisher,copywrite,isbn,io,who,lost,img_url)
   VALUES (?,?,?,?,?,?,?,?,?,?)`;

const selectBooks = `SELECT * FROM books`;

// Param order (routes/communitylibrary/books/edit.js): title, author, publisher,
// copywrite, isbn, io, who, lost, img_url, id, user_id. Scoped by id AND
// user_id like every other edit statement. (It used to start with user_id=?
// and end WHERE id=?, which shifted every value one column and never matched.)
const updateBook =
  `UPDATE books SET
    title=?,author=?,publisher=?,copywrite=?,isbn=?,io=?,who=?,lost=?,img_url=?
   WHERE id=? AND user_id=?`;

// Param order matches routes/communitylibrary/books/delete.js: [id, user_id].
// Scoped to the owner so a row id alone can never delete another user's book.
const deleteBookById = `DELETE FROM books WHERE id=? AND user_id=?`;
const deleteAllBooks = `DELETE FROM books WHERE user_id=?`;

module.exports = { insertBook, selectBooks, updateBook, deleteBookById, deleteAllBooks };
