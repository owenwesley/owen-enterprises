/**
 * middleware/normalizeDate.js
 *
 * Runs on every add/edit route for a table with a `date` column. If the
 * request body carries a `date`, it is converted to ISO 'YYYY-MM-DD' before
 * the route builds its SQL, so the database only ever receives ISO dates no
 * matter what the client sent (MM-DD-YY from todayFormatted(), or YYYY-MM-DD
 * from a native date input). An impossible/unparseable date is rejected with
 * a 400 instead of being stored as junk.
 */

const { toStorageDate } = require('../utils/dateFormat');

module.exports = function normalizeDate(req, res, next) {
  const body = req.body;
  if (body && typeof body === 'object' && 'date' in body) {
    const iso = toStorageDate(body.date);
    if (iso === null) {
      return res.status(400).json({
        error: `Invalid date "${String(body.date).slice(0, 30)}". Use MM-DD-YY or YYYY-MM-DD.`,
      });
    }
    body.date = iso;
  }
  next();
};
