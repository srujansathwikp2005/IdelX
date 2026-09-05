const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const Review = require('../../models/Review');
const Booking = require('../../models/Booking');
const Listing = require('../../models/Listing');
const { logAudit } = require('../../utils/audit');

const User = require('../../models/User');

/** Recomputes and stores the denormalised average for a listing or a user. */
async function recomputeRating(model, field, id) {
  const match = field === 'listing' ? { listing: id, kind: 'listing' } : { reviewee: id, kind: 'renter' };
  const [stats] = await Review.aggregate([
    { $match: match },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await model.findByIdAndUpdate(id, {
    ratingAvg: stats ? Math.round(stats.avg * 10) / 10 : 0,
    ratingCount: stats ? stats.count : 0,
  });
}

// Both directions land here. Which one it is follows from who is asking:
// the renter on the booking is reviewing the item, the owner is reviewing
// the person who hired it. Nobody else on either side may write anything.
const createReview = asyncHandler(async (req, res) => {
  const { bookingId, rating, comment } = req.body;

  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found');

  const me = req.user._id.toString();
  const isRenter = booking.renter.toString() === me;
  const isOwner = booking.owner.toString() === me;
  if (!isRenter && !isOwner) {
    throw ApiError.forbidden('Only the two people on this booking can review it');
  }

  if (booking.status !== 'completed' && booking.status !== 'return_requested') {
    throw ApiError.badRequest('You can review once the rental is finished');
  }

  const kind = isRenter ? 'listing' : 'renter';
  const reviewee = isRenter ? booking.owner : booking.renter;

  const review = await Review.create({
    booking: booking._id,
    kind,
    listing: isRenter ? booking.listing : null,
    reviewer: req.user._id,
    reviewee,
    rating,
    comment,
  }).catch((err) => {
    if (err.code === 11000) throw ApiError.conflict('You already reviewed this booking');
    throw err;
  });

  // A listing review moves the listing's score; a review of a person moves
  // theirs. Denormalised because both are read far more often than written.
  if (kind === 'listing') {
    await recomputeRating(Listing, 'listing', booking.listing);
  } else {
    await recomputeRating(User, 'reviewee', reviewee);
  }

  logAudit({
    actor: req.user._id,
    action: 'review.created',
    category: 'review',
    resourceType: 'review',
    resourceId: review._id.toString(),
    summary: `Left a ${rating}-star review`,
    details: { booking: booking._id, kind, reviewee },
    req,
  });
  return new ApiResponse(201, review, 'Review created').send(res);
});

// ReviewList for a product page.
const listListingReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ listing: req.params.id, kind: 'listing' })
    .sort('-createdAt')
    .populate('reviewer', 'name avatarUrl');
  return new ApiResponse(200, reviews, 'Listing reviews').send(res);
});

// Reviews created by the signed-in user — lets the app mark which
// bookings have already been reviewed.
const myReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ reviewer: req.user._id })
    .sort('-createdAt')
    .populate('listing', 'title _id');
  return new ApiResponse(200, reviews, 'My reviews').send(res);
});

// What has been written about one person, for their profile.
const listUserReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ reviewee: req.params.id, kind: 'renter' })
    .sort('-createdAt')
    .limit(20)
    .populate('reviewer', 'name avatarUrl')
    .lean();
  return new ApiResponse(200, reviews, 'Reviews of this person').send(res);
});

module.exports = { createReview, listListingReviews, myReviews, listUserReviews };
