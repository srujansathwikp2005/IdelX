const express = require('express');
const controller = require('./legal.controller');

const router = express.Router();

// Public: someone deciding whether to sign up is exactly who reads these.
router.get('/help', controller.getHelp);
router.get('/legal', controller.listDocs);
router.get('/legal/:slug', controller.getDoc);

module.exports = router;
