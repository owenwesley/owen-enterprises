const express = require('express');
const router  = express.Router();

router.use('/chairs', require('./meetings/chairs'));
router.use('/memos',  require('./meetings/memos'));
router.use('/',       require('./meetings/reports'));      // 1.13.5: saved PDF reports + meeting logo
router.use('/',       require('./meetings/meetings'));

module.exports = router;
