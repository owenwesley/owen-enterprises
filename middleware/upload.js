/**
 * middleware/upload.js
 *
 * Multer configuration for CommunityLibrary media uploads.
 * Uses memoryStorage — the raw file buffer is held in memory and handed off
 * to Sharp in the controller for resizing/conversion, never written to disk
 * in its original format.
 */
const multer = require('multer');

const storage = multer.memoryStorage();

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff',
]);

function fileFilter(req, file, cb) {
  if (IMAGE_MIME_TYPES.has(file.mimetype)) {
    return cb(null, true);
  }
  cb(new Error(`Unsupported file type: ${file.mimetype}. Please upload an image.`));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cap
});

// Single-file upload, field name "image" — used by both book and movie routes
module.exports = upload.single('image');
