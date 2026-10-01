/**
 * utils/mergeExisting.js
 *
 * Makes the edit routes safe against "sparse" bodies. Every edit route writes
 * ALL of a row's columns in one UPDATE, so a body that carried only `id` (or
 * only the fields that changed) used to overwrite every omitted text column
 * with '' and every omitted number with 0. The React UI always sends full
 * rows, but nothing on the server required that.
 *
 * mergeExisting() loads the stored row (by id AND user_id, so another user's
 * row is never read) and lays the fields the client actually SENT over it.
 * The route then coerces the merged object exactly as before, so omitted
 * fields keep their stored value. A field sent as '' or null is still an
 * explicit clear and is written as such.
 *
 * Returns null when no such row exists for this user; callers treat that the
 * same as an UPDATE that matched nothing (404 via updateReply).
 *
 * `table` is only ever a hard-coded literal from a route file, never client
 * input, so it is safe to interpolate.
 */
async function mergeExisting(pool, table, id, userId, body) {
  if (id === undefined || id === null || id === '') return null;
  const [rows] = await pool.promise().query(
    `SELECT * FROM \`${table}\` WHERE id=? AND user_id=? LIMIT 1`,
    [id, userId]
  );
  if (rows.length === 0) return null;
  const sent = {};
  Object.keys(body || {}).forEach((k) => { if (body[k] !== undefined) sent[k] = body[k]; });
  return { ...rows[0], ...sent, id: rows[0].id };
}

module.exports = { mergeExisting };
