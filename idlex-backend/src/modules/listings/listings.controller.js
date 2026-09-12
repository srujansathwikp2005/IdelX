const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const Listing = require('../../models/Listing');
const Review = require('../../models/Review');
const listingsService = require('./listings.service');
const { logAudit } = require('../../utils/audit');

// GET /api/listings  — public, filtered. Query params double as the
// "search" module from the Django doc (category, minPrice, ordering...).
const listListings = asyncHandler(async (req, res) => {
  const result = await listingsService.queryListings(req.query);
  return new ApiResponse(200, result, 'Listings fetched').send(res);
});

const getListing = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id).populate('owner', 'name avatarUrl');
  if (!listing) throw ApiError.notFound('Listing not found');
  return new ApiResponse(200, listing, 'Listing fetched').send(res);
});

const myListings = asyncHandler(async (req, res) => {
  const listings = await Listing.find({ owner: req.user._id }).sort('-createdAt');
  return new ApiResponse(200, listings, "Owner's listings").send(res);
});

const requestListingOtp = asyncHandler(async (req, res) => {
  await listingsService.createListingOtp(req.user);
  return new ApiResponse(200, null, 'OTP sent to your email').send(res);
});

const createListing = asyncHandler(async (req, res) => {
  // Every listing is gated by an emailed OTP — verify before writing.
  await listingsService.assertValidListingOtp(req.user._id, req.body.otpCode);

  const { otpCode, ...listingData } = req.body;
  const listing = await Listing.create({
    ...listingData,
    owner: req.user._id,
    status: listingData.status ?? 'draft',
  });
  logAudit({
    actor: req.user._id,
    action: 'listing.created',
    category: 'listing',
    resourceType: 'listing',
    resourceId: listing._id.toString(),
    summary: `Created listing "${listing.title}"`,
    details: { category: listing.category, pricePerDay: listing.pricePerDay, status: listing.status },
    req,
  });
  return new ApiResponse(201, listing, 'Listing created').send(res);
});

const updateListing = asyncHandler(async (req, res) => {
  const listing = await listingsService.getOwnedListingOr404(req.params.id, req.user._id);

  // An admin suspension cannot be overridden by the owner.
  if (listing.status === 'suspended' && req.body.status && req.body.status !== 'suspended') {
    throw ApiError.forbidden('This listing has been suspended by IdelX and cannot be made live');
  }

  const changed = Object.keys(req.body);
  Object.assign(listing, req.body);
  await listing.save();
  logAudit({
    actor: req.user._id,
    action: 'listing.updated',
    category: 'listing',
    resourceType: 'listing',
    resourceId: listing._id.toString(),
    summary: `Updated listing "${listing.title}"`,
    details: { changed },
    req,
  });
  return new ApiResponse(200, listing, 'Listing updated').send(res);
});

const deleteListing = asyncHandler(async (req, res) => {
  const listing = await listingsService.getOwnedListingOr404(req.params.id, req.user._id);
  await listing.deleteOne();
  logAudit({
    actor: req.user._id,
    action: 'listing.deleted',
    category: 'listing',
    resourceType: 'listing',
    resourceId: listing._id.toString(),
    summary: `Deleted listing "${listing.title}"`,
    req,
  });
  return new ApiResponse(200, null, 'Listing deleted').send(res);
});

const addPhotos = asyncHandler(async (req, res) => {
  const listing = await listingsService.getOwnedListingOr404(req.params.id, req.user._id);
  const files = req.files || [];
  if (!files.length) throw ApiError.badRequest('At least one photo is required');

  const newPhotos = files.map((f, i) => ({
    url: `/uploads/${f.filename}`,
    order: listing.photos.length + i,
  }));
  listing.photos.push(...newPhotos);
  await listing.save();
  return new ApiResponse(201, listing.photos, 'Photos added').send(res);
});

const deletePhoto = asyncHandler(async (req, res) => {
  const listing = await listingsService.getOwnedListingOr404(req.params.id, req.user._id);
  listing.photos = listing.photos.filter((p) => p._id.toString() !== req.params.photoId);
  await listing.save();
  return new ApiResponse(200, listing.photos, 'Photo removed').send(res);
});

const getAvailability = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id).select('availability');
  if (!listing) throw ApiError.notFound('Listing not found');
  return new ApiResponse(200, listing.availability, 'Availability calendar').send(res);
});

const addAvailabilityBlock = asyncHandler(async (req, res) => {
  const listing = await listingsService.getOwnedListingOr404(req.params.id, req.user._id);
  const { startDate, endDate } = req.body;

  // Same overlap-check pattern the Django doc calls for.
  const overlaps = listing.availability.some(
    (b) => new Date(startDate) <= new Date(b.endDate) && new Date(endDate) >= new Date(b.startDate)
  );
  if (overlaps) throw ApiError.conflict('This date range overlaps an existing block');

  listing.availability.push(req.body);
  await listing.save();
  return new ApiResponse(201, listing.availability, 'Availability block added').send(res);
});

// Removes a block an owner set. Adding one was possible and removing one was
// not, so a range entered by mistake -- or dates that freed up again -- stayed
// closed for good and the owner had no way to reopen them.
//
// Only blocks the owner created can go. A 'booked' entry is the record of a
// real booking, and deleting it would let the same dates be sold twice.
const removeAvailabilityBlock = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw ApiError.notFound('Listing not found');
  if (listing.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw ApiError.forbidden('This listing is not yours');
  }

  const block = listing.availability.id(req.params.blockId);
  if (!block) throw ApiError.notFound('That date range is not blocked');
  if (block.reason === 'booked') {
    throw ApiError.badRequest('These dates are held by a booking and cannot be reopened here');
  }

  block.deleteOne();
  await listing.save();

  logAudit({
    actor: req.user._id,
    action: 'listing.availability_unblocked',
    category: 'listing',
    resourceType: 'listing',
    resourceId: listing._id.toString(),
    summary: 'Owner reopened blocked dates',
    details: { startDate: block.startDate, endDate: block.endDate },
    req,
  });

  return new ApiResponse(200, listing.availability, 'Dates reopened').send(res);
});

// Public: every review left on a listing, newest first. Reviews are part of
// how a stranger decides whether to rent, so this is deliberately readable
// without a session — the same reason the listing itself is public.
const listListingReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ listing: req.params.id })
    .sort('-createdAt')
    // Only what the UI renders. Selecting explicitly keeps the reviewer's
    // email, phone and everything else off a public endpoint.
    .populate('reviewer', 'name avatarUrl');
  return new ApiResponse(200, reviews, 'Listing reviews').send(res);
});

module.exports = {
  listListingReviews,
  listListings,
  getListing,
  myListings,
  requestListingOtp,
  createListing,
  updateListing,
  deleteListing,
  addPhotos,
  deletePhoto,
  getAvailability,
  addAvailabilityBlock,
  removeAvailabilityBlock,
};
