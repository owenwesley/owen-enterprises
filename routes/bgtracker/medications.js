const express = require('express');
const router = express.Router();
const { bgtracker } = require('../../db/db');
const { selectMedications } = require('../../db/sql/bgtracker/medications');
const { serverError } = require('../../utils/serverError');

// Middleware
router.use('/add', require('./medications/add'));
router.use('/delete', require('./medications/delete'));
router.use('/deleteAll', require('./medications/deleteAll'));
router.use('/edit', require('./medications/edit'));

router.get('/:user_id', async (req, res) => {
  try {
    const [results] = await bgtracker.promise().query(
      selectMedications + ' WHERE user_id=? ORDER BY name, id',
      [req.params.user_id]
    );
    return res.json({ results });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
