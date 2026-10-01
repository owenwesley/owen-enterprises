const express = require('express');
const { updateReply } = require('../../../utils/dbRespond');
const { mergeExisting } = require('../../../utils/mergeExisting');
const { updateContact } = require('../../../db/sql/communitylibrary/contacts');
const { communitylibrary } = require('../../../db/db');
const router = express.Router();

router.post('/:user_id', async (req, res) => {
  const reply = updateReply(res, 'Contact updated');
  try {
    const b = await mergeExisting(communitylibrary, 'contacts', req.body.id, req.params.user_id, req.body);
    if (!b) return reply(null, { affectedRows: 0 });
    const [result] = await communitylibrary.promise().query(
      updateContact,
      [b.firstName, b.lastName, b.phoneNum, b.email, b.address,
       b.id, req.params.user_id]
    );
    reply(null, result);
  } catch (err) {
    reply(err);
  }
});

module.exports = router;
