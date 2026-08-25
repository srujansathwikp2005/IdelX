const express = require('express');
const controller = require('./categories.controller');

const router = express.Router();

// Public: the filter bar renders before anyone signs in.
router.get('/', controller.listCategories);

module.exports = router;
