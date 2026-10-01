const express = require('express');
const { selectContacts } = require('../../db/sql/communitylibrary/contacts');
const { communitylibrary } = require('../../db/db');
const router = express.Router();

router.use('/add',    require('./contacts/add'));
router.use('/edit',   require('./contacts/edit'));
router.use('/delete', require('./contacts/delete'));

router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await communitylibrary.promise().query(
      selectContacts + ' WHERE user_id=? ORDER BY lastName, firstName, id',
      [req.params.user_id]
    );
    return res.json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
