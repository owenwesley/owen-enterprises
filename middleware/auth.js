const jwt = require('jsonwebtoken');
const { owenenterprises: db } = require('../db/db');
const SECRET = process.env.JWT_SECRET || 'owenenterprises_secret_change_in_prod';

/**
 * Validates the Bearer token on every protected route.
 * Public routes (/users/login, /users/register) bypass this.
 *
 * After the signature check it also confirms the token's id + userName still
 * match a row in `users`. A token carries the user's numeric id, and
 * db/maintenance/rebuildTable.js renumbers ids (1..N, no gaps). Without this
 * check a token issued before a renumber would silently act as whichever user
 * now owns that number. Profile edits re-issue the token with the new
 * userName (routes/auth.js PUT /profile), so a rename doesn't trip it.
 */
module.exports = function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No token — please log in' });
  }

  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token invalid or expired' });
  }

  db.query(
    'SELECT 1 FROM users WHERE id = ? AND userName = ? LIMIT 1',
    [payload.id, payload.userName],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Could not verify session' });
      if (!rows || rows.length === 0) {
        return res.status(401).json({ error: 'Session is no longer valid — please log in again' });
      }
      req.user = payload;
      next();
    }
  );
};
