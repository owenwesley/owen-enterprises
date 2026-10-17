const express = require('express');
const { church: db, communitylibrary: library } = require('../../db/db');
const { requireChurch } = require('../../middleware/church');
const { selectSharingMembers } = require('../../db/sql/church/members');
const { selectSharedBooks, selectSharedMovies } = require('../../db/sql/church/library');
const { serverError } = require('../../utils/serverError');
const { displayNames, filmsOf } = require('./_helpers');
const router = express.Router({ mergeParams: true });

router.use('/share', require('./library/share'));

// GET /church/:church_id/library/:user_id
// One entry per member who switched sharing on: display name, books and movies.
// Only whitelisted columns are read (db/sql/church/library.js): no borrower names,
// no pictures, no contacts, no ids, no emails. (Contact sharing is a separate opt-in.)
router.get('/:user_id', requireChurch('library.view'), async (req, res) => {
  try {
    const [sharers] = await db.promise().query(selectSharingMembers, [req.church.id]);
    const ids = sharers.map((r) => r.user_id);
    if (!ids.length) return res.json({ results: [] });

    const names = await displayNames(ids);
    const [books] = await library.promise().query(selectSharedBooks, [ids]);
    const [movies] = await library.promise().query(selectSharedMovies, [ids]);

    const results = ids.filter((id) => names.has(id)).map((id) => ({
      name: names.get(id),
      isYou: id === req.user.id,
      books: books.filter((b) => b.user_id === id).map((b) => ({
        ref: b.id,
        img: b.img_url || undefined,
        title: b.title,
        author: b.author,
        year: b.copywrite || undefined,
        available: b.io === 1 && !b.lost,
      })),
      movies: movies.filter((m) => m.user_id === id).map((m) => ({
        ref: m.id,
        img: m.img_url || undefined,
        name: m.name,
        media: m.featureMedia || undefined,
        available: m.io === 1 && !m.lost,
        films: filmsOf(m),
      })),
    }));
    return res.json({ results });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
