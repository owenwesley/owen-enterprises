/**
 * controllers/mediaUploadController.js
 *
 * Handles processing and storage of CommunityLibrary media (book covers,
 * movie posters). Runs after middleware/upload.js has already populated
 * req.file (if an image was sent).
 *
 * Storage layout:
 *   books:  client/public/images/communitylibrary/books/<sanitized-title>.webp
 *   movies: client/public/images/communitylibrary/movies/<media_type>/<sanitized-name>.webp   (media_type e.g. dvd, blu-ray)
 *
 * Paths start from the project root. Both are served at /images/... (server.js serves
 * client/public/images first, then the older root images/ folder as a fallback).
 * The saved web paths are /images/communitylibrary/books/<name>.webp and
 * /images/communitylibrary/movies/<media_type>/<name>.webp.
 *
 * Two different items never share a file: if <name>.webp already exists, the new one is saved as
 * <name>-2.webp, <name>-3.webp, ... unless the client says (current_img_url) that the existing file is
 * the item's own picture, in which case it is replaced.
 *
 * If no file was uploaded, a themed placeholder is copied into the same
 * target path instead, so every book/movie always has an image on disk.
 */

const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');
const { sanitizeFilename } = require('../utils/sanitize');
const { classifyCollection } = require('../utils/collectionFormat');
const { serverError } = require('../utils/serverError');
const { LIB_FOLDER, toNewUrl } = require('../utils/imageLayout');

const PROJECT_ROOT     = path.join(__dirname, '..');
const OLD_IMAGES_ROOT  = path.join(PROJECT_ROOT, 'images');                       // older location, still read as a fallback
const IMAGES_ROOT      = path.join(PROJECT_ROOT, 'client', 'public', 'images');   // where everything new is written
const LIB_ROOT         = path.join(IMAGES_ROOT, LIB_FOLDER);                      // client/public/images/communitylibrary
const BOOKS_ROOT       = path.join(LIB_ROOT, 'books');                            // .../communitylibrary/books
const MOVIES_ROOT      = path.join(LIB_ROOT, 'movies');                           // .../communitylibrary/movies/<media>/
// Placeholders: client/public/images/placeholders first, then the original images/placeholders.
const PLACEHOLDER_DIRS = [path.join(IMAGES_ROOT, 'placeholders'), path.join(OLD_IMAGES_ROOT, 'placeholders')];

// Standard cover/poster dimensions — even sizing for consistent grid display
const TARGET_WIDTH  = 400;
const TARGET_HEIGHT = 600;
const WEBP_QUALITY   = 82;

// Only these folders are created under movies/<media>/. Anything else (a typo, "books", "../x")
// goes to 'other', so a free-text media type can never create stray folders.
const MEDIA_FOLDERS = new Set(['dvd', 'blu-ray', 'vhs', 'hd-dvd', 'other']);
function safeMediaFolder(mediaType) {
  const slug = sanitizeFilename(mediaType);
  if (slug === 'bluray') return 'blu-ray';
  if (slug === 'hddvd') return 'hd-dvd';
  return MEDIA_FOLDERS.has(slug) ? slug : 'other';
}

/**
 * Chooses the file for a new picture inside destDir (web folder webDir, e.g. '/images/communitylibrary/books').
 * <slug>.webp if it is free, or if currentUrl (the item's own existing picture) points at it; otherwise
 * <slug>-2.webp, <slug>-3.webp, ... so one item can never overwrite another item's picture.
 */
function pickTarget(destDir, webDir, slug, currentUrl) {
  const own = toNewUrl(String(currentUrl || '').trim());
  for (let n = 1; n < 1000; n++) {
    const name = n === 1 ? `${slug}.webp` : `${slug}-${n}.webp`;
    const web = `${webDir}/${name}`;
    if (!fs.existsSync(path.join(destDir, name)) || own === web) {
      return { destPath: path.join(destDir, name), webPath: web };
    }
  }
  const name = `${slug}-${Date.now()}.webp`;
  return { destPath: path.join(destDir, name), webPath: `${webDir}/${name}` };
}

/**
 * Ensures a directory exists, creating it (and any missing parents)
 * synchronously if it does not.
 */
function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Resizes/converts an uploaded image buffer to a WebP file at destPath.
 * Uses `fit: cover` so every cover/poster ends up exactly TARGET_WIDTH x
 * TARGET_HEIGHT regardless of the source image's aspect ratio.
 */
async function processAndSaveImage(buffer, destPath) {
  await sharp(buffer)
    .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'cover', position: 'centre' })
    .webp({ quality: WEBP_QUALITY })
    .toFile(destPath);
}

/**
 * Copies the correct "no image" placeholder to destPath.
 * theme: 'light' | 'dark' (defaults to 'light')
 * kind:  'book' | 'movie'
 */
function copyPlaceholder(kind, theme, destPath) {
  const safeTheme = theme === 'dark' ? 'dark' : 'light';
  const placeholderName = `no-${kind}-${safeTheme}.webp`;
  const placeholderPath = PLACEHOLDER_DIRS.map((d) => path.join(d, placeholderName)).find((p) => fs.existsSync(p));

  if (!placeholderPath) {
    throw new Error(`Missing placeholder asset: ${placeholderName}`);
  }
  fs.copyFileSync(placeholderPath, destPath);
}

/**
 * POST /communitylibrary/upload/book
 * Body (multipart/form-data): title, theme? ; file field "image"?
 */
async function uploadBookImage(req, res) {
  try {
    const { title, theme, current_img_url } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const slug    = sanitizeFilename(title);
    const destDir = BOOKS_ROOT;
    ensureDirSync(destDir);

    const { destPath, webPath } = pickTarget(destDir, `/images/${LIB_FOLDER}/books`, slug, current_img_url);

    if (req.file && req.file.buffer) {
      await processAndSaveImage(req.file.buffer, destPath);
    } else {
      copyPlaceholder('book', theme, destPath);
    }

    return res.json({ message: 'Book image saved', img_url: webPath });
  } catch (err) {
    return serverError(res, err);
  }
}

/**
 * POST /communitylibrary/upload/movie
 * Body (multipart/form-data): name, media_type, theme? ; file field "image"?
 */
async function uploadMovieImage(req, res) {
  try {
    const { name, media_type, theme, current_img_url } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!media_type) {
      return res.status(400).json({ error: 'media_type is required' });
    }

    const nameSlug  = sanitizeFilename(name);
    const mediaSlug = safeMediaFolder(media_type); // dvd, blu-ray, vhs, hd-dvd, else 'other'
    const destDir   = path.join(MOVIES_ROOT, mediaSlug);
    ensureDirSync(destDir);

    const { destPath, webPath } = pickTarget(destDir, `/images/${LIB_FOLDER}/movies/${mediaSlug}`, nameSlug, current_img_url);

    if (req.file && req.file.buffer) {
      await processAndSaveImage(req.file.buffer, destPath);
    } else {
      copyPlaceholder('movie', theme, destPath);
    }

    return res.json({ message: 'Movie image saved', img_url: webPath });
  } catch (err) {
    return serverError(res, err);
  }
}

/**
 * POST /communitylibrary/upload/collection
 * Body (multipart/form-data):
 *   collectionTitle  — required, name of the box set / multi-feature
 *   mediaType        — required, e.g. 'dvd', 'blu-ray'
 *   movies           — required, JSON-encoded array of movie objects
 *   theme            — optional, 'light' | 'dark'
 *   file field "image" — optional cover artwork
 *
 * The backend recomputes collectionFormat from movies.length every time —
 * client-submitted format labels are never trusted.
 */
async function uploadCollectionImage(req, res) {
  try {
    const { collectionTitle, mediaType, theme, current_img_url } = req.body;

    if (!collectionTitle) {
      return res.status(400).json({ error: 'collectionTitle is required' });
    }
    if (!mediaType) {
      return res.status(400).json({ error: 'mediaType is required' });
    }

    let movies;
    try {
      movies = typeof req.body.movies === 'string'
        ? JSON.parse(req.body.movies)
        : req.body.movies;
    } catch {
      return res.status(400).json({ error: 'movies must be a valid JSON array' });
    }
    if (!Array.isArray(movies) || movies.length === 0) {
      return res.status(400).json({ error: 'movies must be a non-empty array' });
    }

    let format;
    try {
      format = classifyCollection(movies.length);
    } catch (classifyErr) {
      return res.status(400).json({ error: classifyErr.message });
    }

    const nameSlug = sanitizeFilename(collectionTitle);
    const destDir  = path.join(MOVIES_ROOT, format.slug);
    ensureDirSync(destDir);

    const { destPath, webPath } = pickTarget(destDir, `/images/${LIB_FOLDER}/movies/${format.slug}`, nameSlug, current_img_url);

    if (req.file && req.file.buffer) {
      await processAndSaveImage(req.file.buffer, destPath);
    } else {
      copyPlaceholder('movie', theme, destPath);
    }

    return res.json({
      message: 'Collection image saved',
      img_url: webPath,
      collectionFormat: format.label,
      movieCount: format.count,
    });
  } catch (err) {
    return serverError(res, err);
  }
}

module.exports = {
  uploadBookImage, uploadMovieImage, uploadCollectionImage,
  ensureDirSync, copyPlaceholder, processAndSaveImage, safeMediaFolder, pickTarget,
};
