const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const User = require('../../models/User');
const Booking = require('../../models/Booking');
const Listing = require('../../models/Listing');
const Review = require('../../models/Review');
const Kyc = require('../../models/Kyc');

// What one person may see about another.
//
// Deliberately narrow. An owner deciding whether to hand over a camera needs
// to know who they are dealing with and how it has gone for other people —
// not an email address or a phone number. Those are exchanged once there is
// a booking, not while someone is being considered for one.
const getPublicProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('name avatarUrl createdAt ratingAvg ratingCount isOwner deletedAt')
    .lean();
  if (!user || user.deletedAt) throw ApiError.notFound('User not found');

  const [rentalsTaken, listingIds, kyc, reviews] = await Promise.all([
    Booking.countDocuments({ renter: user._id, status: 'completed' }),
    Listing.find({ owner: user._id }).distinct('_id'),
    Kyc.findOne({ user: user._id }).select('status').lean(),
    Review.find({ reviewee: user._id, kind: 'renter' })
      .sort('-createdAt')
      .limit(5)
      .populate('reviewer', 'name avatarUrl')
      .lean(),
  ]);

  const rentalsGiven = listingIds.length
    ? await Booking.countDocuments({ listing: { $in: listingIds }, status: 'completed' })
    : 0;

  return new ApiResponse(200, {
    id: user._id,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    memberSince: user.createdAt,
    // Identity is verified or it is not; the documents themselves are never
    // exposed here, only the fact that an admin has seen them.
    identityVerified: kyc?.status === 'approved',
    rating: user.ratingAvg || 0,
    ratingCount: user.ratingCount || 0,
    rentalsTaken,
    rentalsGiven,
    listings: listingIds.length,
    reviews: reviews.map((r) => ({
      id: r._id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      by: r.reviewer ? { name: r.reviewer.name, avatarUrl: r.reviewer.avatarUrl ?? null } : null,
    })),
  }, 'Public profile').send(res);
});

module.exports = { getPublicProfile };
