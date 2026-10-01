const express = require('express');
const { deleteContactById } = require('../../../db/sql/communitylibrary/contacts');
const { communitylibrary } = require('../../../db/db');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  try {
    await communitylibrary.promise().query(deleteContactById, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Contact deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
