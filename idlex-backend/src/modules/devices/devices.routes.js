const express = require('express');
const controller = require('./devices.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);
router.post('/', controller.registerDevice);
router.delete('/:token', controller.unregisterDevice);

module.exports = router;
