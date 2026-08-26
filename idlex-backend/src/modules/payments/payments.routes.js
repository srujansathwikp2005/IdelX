const express = require('express');
const controller = require('./payments.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { requireApprovedKyc } = require('../../middlewares/kyc.middleware');

const router = express.Router();

router.post('/checkout', protect, requireApprovedKyc('pay for a rental'), controller.checkout);
router.post('/verify', protect, controller.verify);
router.get('/payouts', protect, controller.listPayoutHistory);
router.get('/payout-settings', protect, controller.getPayoutSettings);
router.put('/payout-settings', protect, controller.updatePayoutSettings);

// NOTE: /api/webhooks/payments (no `protect`) is mounted separately in app.js
// so it can use express.raw() body parsing for signature verification.
module.exports = router;