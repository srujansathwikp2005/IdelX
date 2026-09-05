const express = require('express');
const controller = require('./reviews.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get('/mine', protect, controller.myReviews);
router.post('/', protect, controller.createReview);
router.get('/user/:id', protect, controller.listUserReviews);

module.exports = router;
