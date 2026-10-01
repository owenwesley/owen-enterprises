const express = require('express');
const router  = express.Router();

router.use('/bloodpressures', require('./bgtracker/bloodpressures'));
router.use('/medications',    require('./bgtracker/medications'));
router.use('/nutritions',     require('./bgtracker/nutritions'));
router.use('/preferences',    require('./bgtracker/preferences'));
router.use('/readings',       require('./bgtracker/readings'));
router.use('/weights',        require('./bgtracker/weights'));

module.exports = router;
