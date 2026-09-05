const Listing = require('../../models/Listing');
const ApiError = require('../../utils/ApiError');
const { issueEmailOtp, verifyEmailOtpRecord } = require('../../utils/otp');

// Doubles as the "search" layer: the Django doc keeps search as a thin
// query layer over Listing rather than a separate resource — this
// service is that layer, built out with query params instead of
// django-filter + OrderingFilter + PageNumberPagination.
async function queryListings(query) {
  const {
    category,
    city,
    minPrice,
    maxPrice,
    q,
    ordering = '-createdAt',
    page = 1,
    limit = 20,
    status = 'published',
  } = query;

  const filter = { status };
  if (category) filter.category = category;
  if (city) filter['location.city'] = new RegExp(`^${city}$`, 'i');
  if (minPrice || maxPrice) {
    filter.pricePerDay = {};
    if (minPrice) filter.pricePerDay.$gte = Number(minPrice);
    if (maxPrice) filter.pricePerDay.$lte = Number(maxPrice);
  }
  // Substring, not $text. A text index matches whole words: "Car" finds
  // "Car" and "Washing" finds "Washing Machine", but "Ca" and "Washi" are
  // not words and match nothing — which is exactly what people type while
  // they are still typing. A case-insensitive regex matches wherever the
  // fragment falls, which is what a search box is expected to do.
  if (q) {
    const needle = String(q).trim();
    if (needle) {
      // Escaped: a stray "(" or "*" from a real search term would otherwise
      // be read as part of the pattern and throw.
      const rx = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { description: rx }];
    }
  }

  const sortField = ordering.replace(/^-/, '');
  const sortDir = ordering.startsWith('-') ? -1 : 1;
  const allowedSort = ['createdAt', 'pricePerDay', 'ratingAvg'];
  const sort = { [allowedSort.includes(sortField) ? sortField : 'createdAt']: sortDir };

  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    Listing.find(filter).sort(sort).skip(skip).limit(Number(limit)).populate('owner', 'name avatarUrl'),
    Listing.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
  };
}

async function getOwnedListingOr404(id, ownerId) {
  const listing = await Listing.findById(id);
  if (!listing) throw ApiError.notFound('Listing not found');
  if (listing.owner.toString() !== ownerId.toString()) {
    throw ApiError.forbidden('You do not own this listing');
  }
  return listing;
}

// Sends a per-listing verification OTP to the owner's email. Every
// single listing the user creates must be confirmed with one of these
// before the Listing document is written.
async function createListingOtp(user) {
  await issueEmailOtp(user._id, user.email, 'listing');
}

// For POST /api/listings — the submitted code must match the stored
// 'listing'-purpose OTP or the creation is rejected. Consumes the OTP on
// success so a code can't be reused for a second listing.
async function assertValidListingOtp(userId, otpCode) {
  const result = await verifyEmailOtpRecord(userId, otpCode, 'listing');
  if (!result.ok) {
    if (result.reason === 'no_request') {
      throw ApiError.badRequest('Request an OTP for this listing before creating it');
    }
    throw ApiError.badRequest('OTP is invalid or expired');
  }
}

module.exports = { queryListings, getOwnedListingOr404, createListingOtp, assertValidListingOtp };
