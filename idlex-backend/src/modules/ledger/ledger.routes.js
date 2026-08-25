const express = require('express');
const controller = require('./ledger.controller');
const earnings = require('./earnings.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const router = express.Router();

// Either party to a booking, or an admin.
router.get('/booking/:id', protect, controller.bookingLedger);

// An owner's own earnings, derived from the ledger.
router.get('/earnings', protect, earnings.getEarnings);
router.get('/earnings/history', protect, earnings.getEarningsHistory);

// Admin only: what the platform still owes, and recording that it was paid.
router.get('/outstanding', protect, authorize('admin'), controller.outstanding);
router.post('/entries/:entryId/settle', protect, authorize('admin'), controller.settle);

module.exports = router;
