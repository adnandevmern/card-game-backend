const express = require('express');
const router = express.Router();
const tableController = require('../controllers/tableController');

router.post('/create', tableController.createTable);
router.get('/list', tableController.listTables);
router.post('/join', tableController.joinTable);

module.exports = router;