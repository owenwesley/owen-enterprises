// Image paths for book covers, movie posters and the "no picture" placeholders.
//
// Static files live in client/public/images/... Vite copies that folder to the
// root of the build, so the word "public" is NOT part of the URL. Every path
// here therefore starts with "/images/..." (leading slash, never relative):
//
//   client/public/images/books/<file>               ->  /images/books/<file>
//   client/public/images/movies/dvd/<file>          ->  /images/movies/dvd/<file>
//   client/public/images/placeholders/<file>        ->  /images/placeholders/<file>
//
// Pictures that people upload in the app are written by the server into the
// server's own images/ folder and are served from the same /images/... URLs.

export const MOVIE_MEDIA_FOLDERS = ['vhs', 'dvd', 'hd-dvd', 'blu-ray'];

// Same rule as the server's sanitizeFilename for media types: 'Blu-Ray' -> 'blu-ray', 'HD-DVD' -> 'hd-dvd'.
export const mediaFolder = (mediaType) =>
  String(mediaType || 'dvd').toLowerCase().trim().replace(/[^a-z0-9\s-]/g, ' ').replace(/[\s-]+/g, '-').replace(/^-+|-+$/g, '') || 'dvd';

const enc = (name) => encodeURIComponent(String(name || '').replace(/^\/+/, ''));

/** /images/books/<file> */
export const bookImage = (filename) => `/images/books/${enc(filename)}`;

/** /images/movies/<media>/<file>, e.g. movieImage('dvd', 'alien.webp') or movieImage('Blu-Ray', 'alien.webp') */
export const movieImage = (mediaType, filename) => `/images/movies/${mediaFolder(mediaType)}/${enc(filename)}`;

/** Shortcut for the DVD folder: /images/movies/dvd/<file> */
export const dvdImage = (filename) => movieImage('dvd', filename);

/** Shortcut for the Blu-ray folder: /images/movies/blu-ray/<file> */
export const bluRayImage = (filename) => movieImage('blu-ray', filename);

/** Placeholder: placeholderImage('movie') / placeholderImage('book', 'dark') */
// kind: 'book' / 'books' or 'movie' / 'movies'
export const placeholderImage = (kind, theme = 'light') =>
  `/images/placeholders/no-${String(kind).startsWith('book') ? 'book' : 'movie'}-${theme === 'dark' ? 'dark' : 'light'}.webp`;
