const express = require('express');
const uploadMiddleware = require('../../middleware/upload');
const { uploadBookImage, uploadMovieImage, uploadCollectionImage } = require('../../controllers/mediaUploadController');
const router = express.Router();

// POST /communitylibrary/upload/book
// multipart/form-data: title, theme? ; file field "image"?
router.post('/book', uploadMiddleware, uploadBookImage);

// POST /communitylibrary/upload/movie
// multipart/form-data: name, media_type, theme? ; file field "image"?
router.post('/movie', uploadMiddleware, uploadMovieImage);

// POST /communitylibrary/upload/collection
// multipart/form-data: collectionTitle, mediaType, movies (JSON array), theme? ; file field "image"?
router.post('/collection', uploadMiddleware, uploadCollectionImage);

module.exports = router;
