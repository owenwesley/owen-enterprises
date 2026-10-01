const express = require('express');
const router  = express.Router();

router.use('/chairs', require('./meetings/chairs'));
router.use('/memos',  require('./meetings/memos'));
router.use('/',       require('./meetings/meetings'));

module.exports = router;
