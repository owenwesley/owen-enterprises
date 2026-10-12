/**
 * utils/imageLayout.js
 *
 * One place that knows where Community Library pictures live (since 1.12.3):
 *
 *   client/public/images/communitylibrary/books/<name>.webp              URL /images/communitylibrary/books/<name>.webp
 *   client/public/images/communitylibrary/movies/<media>/<name>.webp     URL /images/communitylibrary/movies/<media>/<name>.webp
 *   client/public/images/bgtracker/                                      reserved for BG Tracker pictures (none yet)
 *   client/public/images/placeholders/                                   shared "no picture" images
 *
 * Before 1.12.3 the folders were images/books and images/movies/<media>; those URLs are still stored in
 * older database rows until `npm run images:migrate -- --apply` rewrites them, and server.js keeps
 * answering them (see legacyAlias there).
 */
const LIB_FOLDER = 'communitylibrary';
const LEGACY_RE = /^\/images\/(books|movies)\//;

/** '/images/books/x.webp' -> '/images/communitylibrary/books/x.webp'. Anything else is returned unchanged. */
function toNewUrl(url) {
  const u = String(url == null ? '' : url);
  return LEGACY_RE.test(u) ? u.replace(LEGACY_RE, `/images/${LIB_FOLDER}/$1/`) : u;
}

function isLegacyUrl(url) {
  return LEGACY_RE.test(String(url == null ? '' : url));
}

module.exports = { LIB_FOLDER, toNewUrl, isLegacyUrl };
