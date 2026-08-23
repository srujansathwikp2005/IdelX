const Listing = require('../../models/Listing');
const Booking = require('../../models/Booking');
const ApiError = require('../../utils/ApiError');
const { notify } = require('../notifications/notifications.service');

const SERVICE_FEE_RATE = 0.1; // 10% platform fee — same "plain business logic" note as the Django doc

function daysBetween(start, end) {
  return Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
}

// Single source of truth for the price breakdown — used both when a
// booking is created directly and when a Razorpay checkout order is
// created for the same listing + dates.
function computeCost(listing, startDate, endDate) {
  const totalDays = daysBetween(startDate, endDate);
  if (totalDays < 1) throw ApiError.badRequest('endDate must be after startDate');

  const subtotal = totalDays * listing.pricePerDay;
  const serviceFee = Math.round(subtotal * SERVICE_FEE_RATE);
  const securityDeposit = listing.securityDeposit || 0;

  return {
    totalDays,
    subtotal,
    serviceFee,
    securityDeposit,
    totalAmount: subtotal + serviceFee + securityDeposit,
  };
}

// Preventing double-booking on overlapping dates: checked against both
// the listing's blocked availability and existing active bookings —
// same overlap-check pattern used for listing availability itself.
// Addresses arrive from a form, so every field is trimmed and length-capped
// and coordinates are range-checked. A bad coordinate is dropped rather than
// stored, so a map pin never silently records a point in the sea.
function sanitizeAddress(input) {
  if (!input || typeof input !== 'object') return undefined;
  const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

  const lat = Number(input.lat);
  const lng = Number(input.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  const address = {
    label: text(input.label, 40),
    line1: text(input.line1, 200),
    line2: text(input.line2, 200),
    city: text(input.city, 80),
    state: text(input.state, 80),
    pincode: text(input.pincode, 12),
    instructions: text(input.instructions, 300),
    lat: hasCoords ? lat : undefined,
    lng: hasCoords ? lng : undefined,
  };

  // An object of nothing but undefined is not an address.
  return Object.values(address).some((v) => v !== undefined) ? address : undefined;
}

async function assertDatesAvailable(listingId, startDate, endDate, excludeBookingId = null) {
  const listing = await Listing.findById(listingId);
  if (!listing) throw ApiError.notFound('Listing not found');
  if (listing.status !== 'published') throw ApiError.badRequest('Listing is not available for booking');

  const blockOverlap = listing.availability.some(
    (b) => new Date(startDate) <= new Date(b.endDate) && new Date(endDate) >= new Date(b.startDate)
  );
  if (blockOverlap) throw ApiError.conflict('Selected dates are blocked by the owner');

  const bookingQuery = {
    listing: listingId,
    status: { $in: ['requested', 'awaiting_payment', 'confirmed', 'active'] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };
  if (excludeBookingId) bookingQuery._id = { $ne: excludeBookingId };

  const conflict = await Booking.findOne(bookingQuery);
  if (conflict) throw ApiError.conflict('Selected dates overlap an existing booking');

  return listing;
}

async function createBooking(renterId, { listingId, startDate, endDate, deliveryAddress }) {
  const listing = await assertDatesAvailable(listingId, startDate, endDate);

  // Owners cannot rent out their own items to themselves — a booking must
  // be between two distinct users.
  if (listing.owner.toString() === renterId.toString()) {
    throw ApiError.forbidden('You cannot book your own listing');
  }

  const cost = computeCost(listing, startDate, endDate);

  const booking = await Booking.create({
    listing: listing._id,
    renter: renterId,
    owner: listing.owner,
    startDate,
    endDate,
    pricePerDay: listing.pricePerDay,
    totalDays: cost.totalDays,
    subtotal: cost.subtotal,
    serviceFee: cost.serviceFee,
    securityDeposit: cost.securityDeposit,
    totalAmount: cost.totalAmount,
    deliveryAddress: sanitizeAddress(deliveryAddress),
  });

  // The owner who posted the item gets notified that a renter wants it.
  const renter = await loadRenterName(renterId);
  await notify(listing.owner, {
    type: 'booking_request',
    title: 'New booking request',
    body: `${renter} wants to rent "${listing.title}" from ${formatDate(startDate)} to ${formatDate(endDate)}`,
    link: '/dashboard?view=bookings',
  });

  return booking;
}

async function loadRenterName(renterId) {
  try {
    const User = require('../../models/User');
    const user = await User.findById(renterId).select('name');
    return user ? user.name : 'A renter';
  } catch {
    return 'A renter';
  }
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

module.exports = { assertDatesAvailable, createBooking, daysBetween, computeCost };
