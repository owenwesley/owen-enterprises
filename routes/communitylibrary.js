const express = require('express');
const router  = express.Router();

router.use('/books',    require('./communitylibrary/books'));
router.use('/movies',   require('./communitylibrary/movies'));
router.use('/contacts', require('./communitylibrary/contacts'));
router.use('/upload',   require('./communitylibrary/upload'));

module.exports = router;
