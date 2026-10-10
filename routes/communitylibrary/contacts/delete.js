const express = require('express');
const { deleteContactById } = require('../../../db/sql/communitylibrary/contacts');
const { communitylibrary } = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  try {
    await communitylibrary.promise().query(deleteContactById, [req.body.id, req.params.user_id]);
    return res.json({ message: 'Contact deleted' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
