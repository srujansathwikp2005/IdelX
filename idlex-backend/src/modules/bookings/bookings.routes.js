const express = require('express');
const controller = require('./bookings.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { requireApprovedKyc } = require('../../middlewares/kyc.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  createBookingSchema,
  cancelBookingSchema,
  extensionRequestSchema,
  extensionRespondSchema,
} = require('./bookings.validation');

const router = express.Router();

router.use(protect);

router.get('/', controller.myBookings); // renter view
// Creating a booking requires an admin-approved KYC — same restriction as
// adding listings. Until approved the account is view-only.
router.post('/', requireApprovedKyc, validate(createBookingSchema), controller.createBooking);
router.get('/owner', controller.ownerBookings);
router.get('/:id', controller.getBooking);
router.post('/:id/confirm', controller.confirmBooking);
router.post('/:id/cancel', validate(cancelBookingSchema), controller.cancelBooking);
// Renter confirms receipt — releases the rent from escrow to the owner.
router.post('/:id/start', controller.startRental);
router.post('/:id/request-return', controller.requestReturn);
router.post('/:id/confirm-return', controller.confirmReturn);
router.post('/:id/extension-request', validate(extensionRequestSchema), controller.requestExtension);
router.post('/:id/extension-request/:reqId/respond', validate(extensionRespondSchema), controller.respondExtension);

module.exports = router;
