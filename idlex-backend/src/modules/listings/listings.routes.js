const express = require('express');
const controller = require('./listings.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');
const { requireApprovedKyc } = require('../../middlewares/kyc.middleware');
const validate = require('../../middlewares/validate.middleware');
const upload = require('../../middlewares/upload.middleware');
const { createListingSchema, updateListingSchema, availabilitySchema } = require('./listings.validation');

const router = express.Router();

// Public
router.get('/', controller.listListings);
router.get('/:id', controller.getListing);
router.get('/:id/availability', controller.getAvailability);
// Public: reviews inform a rental decision, so they must be readable before
// signing up. Placed above `router.use(protect)` deliberately — below it,
// this path 401s instead of 404ing, which is how the missing route hid.
router.get('/:id/reviews', controller.listListingReviews);

// Owner-only. Every write route requires an admin-approved KYC — until
// then the user's account is view-only and listing is disabled.
router.use(protect);
router.get('/mine/all', controller.myListings); // -> maps to my-listings page
// Sends the per-listing OTP. Authenticated users only (a renter creating
// their first listing gets upgraded to owner right after this step).
router.post('/otp/request', controller.requestListingOtp);
router.post('/', authorize('owner', 'admin'), requireApprovedKyc('add listings'), validate(createListingSchema), controller.createListing);
router.put('/:id', authorize('owner', 'admin'), requireApprovedKyc('add listings'), validate(updateListingSchema), controller.updateListing);
router.patch('/:id', authorize('owner', 'admin'), requireApprovedKyc('add listings'), validate(updateListingSchema), controller.updateListing);
router.delete('/:id', authorize('owner', 'admin'), controller.deleteListing);

router.post('/:id/photos', authorize('owner', 'admin'), requireApprovedKyc('add listings'), upload.array('photos', 10), controller.addPhotos);
router.delete('/:id/photos/:photoId', authorize('owner', 'admin'), controller.deletePhoto);

router.post(
  '/:id/availability',
  authorize('owner', 'admin'),
  requireApprovedKyc('add listings'),
  validate(availabilitySchema),
  controller.addAvailabilityBlock
);

module.exports = router;
