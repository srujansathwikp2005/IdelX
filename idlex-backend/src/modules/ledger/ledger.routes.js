const express = require('express');
const controller = require('./ledger.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const router = express.Router();

// Either party to a booking, or an admin.
router.get('/booking/:id', protect, controller.bookingLedger);

// Admin only: what the platform still owes, and recording that it was paid.
router.get('/outstanding', protect, authorize('admin'), controller.outstanding);
router.post('/entries/:entryId/settle', protect, authorize('admin'), controller.settle);

module.exports = router;
