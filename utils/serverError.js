/**
 * utils/serverError.js
 *
 * serverError(res, err) answers a failed request with a 500 that says nothing about
 * the server's insides. The real error (which can name tables, columns or SQL) is
 * logged on the server only. Before 1.11.29 every route returned err.message, which
 * showed database errors to the browser.
 *
 * An error you THREW on purpose with a person-readable message can opt in:
 *     const e = new Error('Could not create a join code, please try again');
 *     e.expose = true; throw e;
 * (its message is then returned as-is).
 */
const GENERIC = 'Something went wrong on the server. Please try again.';

function serverError(res, err, where) {
  console.error(`500${where ? ' ' + where : ''}${res && res.req ? ` ${res.req.method} ${res.req.originalUrl.split('?')[0]}` : ''}:`,
    err && err.stack ? err.stack : err);
  if (res.headersSent) return undefined;
  const msg = err && err.expose && err.message ? err.message : GENERIC;
  return res.status(500).json({ error: msg });
}

module.exports = { serverError, GENERIC };
