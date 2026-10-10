// POST /communitylibrary/returned/:user_id   { kind: 'book' | 'movie', id }
// "Returned": the owner marks a book / whole movie set back In with one tap. One guarded UPDATE
// (only a row of this user's that is currently Out and not Lost), so it cannot touch anyone
// else's row, a Lost item, or an item that is already In. A movie set returns every film at once
// (per-film changes stay in the edit dialog). The borrower is reset to "In Library".
const express = require('express');
const { communitylibrary } = require('../../db/db');
const { IN_LIBRARY } = require('../../utils/borrower');
const { serverError } = require('../../utils/serverError');
const router = express.Router();

const returnBook = `UPDATE books SET io=1, who=? WHERE id=? AND user_id=? AND io=0 AND lost=0`;
const sets = ['io=1', 'who=?'];
for (let i = 1; i <= 12; i++) sets.push(`io${i}=1`, `who${i}=?`);
const returnMovie = `UPDATE movies SET ${sets.join(', ')} WHERE id=? AND user_id=? AND io=0 AND lost=0`;

router.post('/:user_id', async (req, res) => {
  try {
    const { kind, id } = req.body || {};
    if (!['book', 'movie'].includes(kind) || !Number.isInteger(id)) return res.status(400).json({ error: 'Choose a book or movie.' });
    const [r] = kind === 'book'
      ? await communitylibrary.promise().query(returnBook, [IN_LIBRARY, id, req.user.id])
      : await communitylibrary.promise().query(returnMovie, [...Array(13).fill(IN_LIBRARY), id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Nothing to return: it is already In, marked Lost, or was not found.' });
    return res.json({ message: 'Marked In.' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
