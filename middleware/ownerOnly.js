/**
 * middleware/ownerOnly.js
 *
 * Per-user authorisation for the feature routes. Runs AFTER middleware/auth.js
 * (needs req.user.id).
 *
 * Every data route in this app carries the owner's id as the LAST segment of
 * the path: GET /bgtracker/weights/7, POST /meetings/edit/7, ... The token
 * proves who is signed in, but the routes used to trust that URL id, so any
 * signed-in user could read or change anyone's rows by editing the number.
 * This makes the URL id and the token agree, or the request is refused.
 *
 * It is default-deny on purpose:
 *   - the last segment must be digits AND equal the signed-in user's id;
 *   - anything else is 403 — including paths with no id (which used to be
 *     "list everyone's rows" endpoints) and ids like "7abc". That last case
 *     matters: MySQL reads 'user_id = "7abc"' as user_id = 7, so letting a
 *     non-numeric segment through would let it match another user's rows.
 *
 * Routes that legitimately have no user id in the path are listed per mount
 * with `exempt` (regexes tested against the mount-relative path). Each one
 * must be safe on its own.
 */
module.exports = function ownerOnly({ exempt = [] } = {}) {
  return function ownerOnlyMiddleware(req, res, next) {
    if (exempt.some((re) => re.test(req.path))) return next();

    const segments = req.path.split('/').filter(Boolean);
    const last = segments[segments.length - 1];

    if (last !== undefined && /^[0-9]+$/.test(last) && last === String(req.user.id)) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden' });
  };
};
