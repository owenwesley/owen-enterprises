const express = require('express');
const { church: db, communitylibrary: library } = require('../../db/db');
const { selectLibrarySharers } = require('../../db/sql/church/members');
const { selectSharedBooks, selectSharedMovies } = require('../../db/sql/church/library');
const { serverError } = require('../../utils/serverError');
const { displayNames, filmsOf } = require('./_helpers');
const router = express.Router();

// GET /church/shared-library/:user_id
// Live, read-only list for the Books and Movies pages: other members' shared titles, so a search there
// can say "Russ has it". Nothing is copied into anyone's tables and there is no edit or delete route
// for these rows: the Community Library routes only ever touch the signed-in user's own rows
// (WHERE id=? AND user_id=?). Same whitelist as the church catalog: no borrower names, owner user
// ids or emails. Since 1.11.27 it also carries the cover picture path and `ref` (the item's own row id,
// used only to ask to borrow it). Only people from a church where the viewer has also switched sharing on.
router.get('/:user_id', async (req, res) => {
  try {
    const [rows] = await db.promise().query(selectLibrarySharers, [req.user.id, req.user.id]);
    if (!rows.length) return res.json({ books: [], movies: [] });
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const names = await displayNames(ids);
    const churchOf = new Map();
    for (const r of rows) churchOf.set(r.user_id, [...(churchOf.get(r.user_id) || []), r.churchName].filter((x, i, a) => a.indexOf(x) === i));
    const owner = (id) => ({ sharedBy: names.get(id), church: churchOf.get(id).join(', ') });
    const [books] = await library.promise().query(selectSharedBooks, [ids]);
    const [movies] = await library.promise().query(selectSharedMovies, [ids]);
    return res.json({
      books: books.filter((b) => names.has(b.user_id)).map((b) => ({
        ...owner(b.user_id), ref: b.id, title: b.title, author: b.author, year: b.copywrite || undefined, img: b.img_url || undefined, available: b.io === 1 && !b.lost,
      })),
      movies: movies.filter((m) => names.has(m.user_id)).map((m) => ({
        ...owner(m.user_id), ref: m.id, name: m.name, media: m.featureMedia || undefined, img: m.img_url || undefined, available: m.io === 1 && !m.lost, films: filmsOf(m),
      })),
    });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
