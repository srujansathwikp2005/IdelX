const express = require('express');
const controller = require('./users.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Signed in only: this is for people transacting with each other, not a
// directory anyone can crawl.
router.get('/:id', protect, controller.getPublicProfile);

module.exports = router;
