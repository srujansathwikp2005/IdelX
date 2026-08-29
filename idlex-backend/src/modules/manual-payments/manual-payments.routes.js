const express = require('express');
const controller = require('./manual-payments.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');
const { requireApprovedKyc } = require('../../middlewares/kyc.middleware');

const router = express.Router();
router.use(protect);

// What to pay and where to send it.
router.get('/instructions/:bookingId', controller.getPaymentInstructions);

// Submitting a reference is part of paying for a rental, so it sits behind
// the same verification gate as the gateway checkout it replaces.
router.post('/', requireApprovedKyc('pay for a rental'), controller.submitPayment);

// Admin only. A renter marking their own payment verified is the single
// thing this whole flow exists to prevent.
router.get('/review', authorize('admin'), controller.listForReview);
router.patch('/review/:id', authorize('admin'), controller.reviewPayment);

module.exports = router;
