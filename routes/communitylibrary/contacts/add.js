const express = require('express');
const { insertContact } = require('../../../db/sql/communitylibrary/contacts');
const { communitylibrary } = require('../../../db/db');
const { serverError } = require('../../../utils/serverError');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  const b = req.body;
  try {
    await communitylibrary.promise().query(
      insertContact,
      [req.params.user_id, b.firstName || '', b.lastName || '',
       b.phoneNum || '', b.email || '', b.address || '']
    );
    return res.json({ message: 'Contact added' });
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
