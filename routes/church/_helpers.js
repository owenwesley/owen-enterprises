/**
 * routes/church/_helpers.js
 *
 * Small helpers shared by the Church routes (they used to be copied inside routes/church.js).
 */
const { owenenterprises: gateway } = require('../../db/db');
const { toStr } = require('../../utils/coerce');

const clean = (v) => toStr(v).trim();
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const notFound = (res) => res.status(404).json({ error: 'Nothing was updated — that row was not found.' });
const waitText = (m) => `${m} minute${m === 1 ? '' : 's'}`;
// true / 1 / '1' / 'true' -> 1, anything else -> 0
const asFlag = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);

// user ids -> Map(id -> "First Last"). Display names only: never an email or any other column.
async function displayNames(ids) {
  if (!ids.length) return new Map();
  const [users] = await gateway.promise().query('SELECT id, firstName, lastName FROM users WHERE id IN (?)', [ids]);
  return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
}

// The films inside one movie row (numMovie slots: name1/img1/io1 ... name12/img12/io12).
function filmsOf(m) {
  const count = Math.min(Math.max(Number(m.numMovie) || 1, 1), 12);
  const films = [];
  for (let i = 1; i <= count; i++) {
    if (m[`name${i}`]) films.push({ name: m[`name${i}`], img: m[`img${i}`] || undefined, available: m[`io${i}`] === 1 && !m.lost });
  }
  return films;
}

module.exports = { clean, bad, notFound, waitText, asFlag, displayNames, filmsOf };
