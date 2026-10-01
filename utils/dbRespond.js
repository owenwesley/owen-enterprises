/**
 * utils/dbRespond.js
 *
 * updateReply(res, message) builds the callback for an UPDATE query.
 * An UPDATE whose WHERE matches no row (wrong id, another user's row, a row
 * that has since been deleted) used to answer 200 "updated" — a silent no-op
 * the UI could never notice. It now answers 404 instead.
 *
 * Note: mysql2 reports affectedRows as *matched* rows by default, so saving
 * a row without changing anything is still a normal 200.
 */
function updateReply(res, message) {
  return (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'Nothing was updated — that row was not found for this user.' });
    }
    return res.json({ message });
  };
}

module.exports = { updateReply };
