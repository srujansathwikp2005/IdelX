const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const Booking = require('../../models/Booking');
const Dispute = require('../../models/Dispute');
const paymentsService = require('../payments/payments.service');
const Listing = require('../../models/Listing');
const bookingsService = require('./bookings.service');
const { notify } = require('../notifications/notifications.service');
const { logAudit } = require('../../utils/audit');

const createBooking = asyncHandler(async (req, res) => {
  const booking = await bookingsService.createBooking(req.user._id, req.body);
  logAudit({
    actor: req.user._id,
    action: 'booking.created',
    category: 'booking',
    resourceType: 'booking',
    resourceId: booking._id.toString(),
    summary: 'Requested a booking',
    details: { listing: booking.listing, startDate: booking.startDate, endDate: booking.endDate, totalAmount: booking.totalAmount },
    req,
  });
  return new ApiResponse(201, booking, 'Booking requested').send(res);
});

// Renter's own bookings — powers the renter-facing booking list.
const myBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ renter: req.user._id })
    .sort('-createdAt')
    .populate('listing', 'title photos pricePerDay');
  return new ApiResponse(200, bookings, "Renter's bookings").send(res);
});

// Owner-facing list — 'my-rentals' counterpart from the owner side.
const ownerBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ owner: req.user._id })
    .sort('-createdAt')
    .populate('listing', 'title photos pricePerDay')
    .populate('renter', 'name avatarUrl');
  return new ApiResponse(200, bookings, "Owner's bookings").send(res);
});

const getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('listing')
    .populate('renter', 'name avatarUrl')
    .populate('owner', 'name avatarUrl');
  if (!booking) throw ApiError.notFound('Booking not found');

  const isParty = [booking.renter._id, booking.owner._id].some(
    (id) => id.toString() === req.user._id.toString()
  );
  if (!isParty && req.user.role !== 'admin') throw ApiError.forbidden('Not a party to this booking');

  return new ApiResponse(200, booking, 'Booking detail — StatusTimeline data').send(res);
});


// ESCROW step 7: the renter confirms they have the item. This is what
// releases the rent to the owner — not payment, and not the owner's own
// say-so. The renter attesting to receipt is the event the money waits for.
const startRental = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.renter.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('Only the renter can confirm they received the item');
  }
  if (booking.status !== 'confirmed') {
    throw ApiError.badRequest(`Cannot start a rental in '${booking.status}' state`);
  }

  booking.status = 'active';
  await booking.save();

  // The payout must never block the state change: an owner with no payout
  // details configured should not stop the renter using the item.
  let released = null;
  try {
    released = await paymentsService.releaseRentToOwner(booking);
  } catch (err) {
    console.error(`[escrow] rent release failed for booking ${booking._id}:`, err.message);
  }

  logAudit({
    actor: req.user._id,
    action: 'booking.started',
    category: 'booking',
    resourceType: 'booking',
    resourceId: booking._id.toString(),
    summary: 'Renter confirmed receipt; rental started',
    details: { rentReleased: booking.escrow?.rentStatus, amount: released?.amount },
    req,
  });

  return new ApiResponse(200, booking, 'Rental started').send(res);
});

const confirmBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.owner.toString() !== req.user._id.toString()) throw ApiError.forbidden('Only the owner can confirm');
  if (booking.status !== 'requested') throw ApiError.badRequest(`Cannot confirm a booking in '${booking.status}' state`);

  booking.status = 'confirmed';
  await booking.save();
  logAudit({
    actor: req.user._id,
    action: 'booking.confirmed',
    category: 'booking',
    resourceType: 'booking',
    resourceId: booking._id.toString(),
    summary: 'Confirmed a booking',
    req,
  });

  // Tell the renter their request was approved.
  const listing = await Listing.findById(booking.listing).select('title');
  await notify(booking.renter, {
    type: 'booking_confirmed',
    title: 'Booking approved',
    body: `The owner approved your booking for "${listing ? listing.title : 'your rental'}"`,
    link: `/my-rentals/${booking._id}`,
  });

  return new ApiResponse(200, booking, 'Booking confirmed').send(res);
});

const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound('Booking not found');

  const isParty = [booking.renter, booking.owner].some((id) => id.toString() === req.user._id.toString());
  if (!isParty) throw ApiError.forbidden('Not a party to this booking');
  if (['completed', 'cancelled'].includes(booking.status)) {
    throw ApiError.badRequest(`Booking already ${booking.status}`);
  }

  booking.status = 'cancelled';
  booking.cancelledBy = req.user._id;
  booking.cancellationReason = req.body.reason;
  await booking.save();
  logAudit({
    actor: req.user._id,
    action: 'booking.cancelled',
    category: 'booking',
    resourceType: 'booking',
    resourceId: booking._id.toString(),
    summary: 'Cancelled a booking',
    details: { reason: req.body.reason },
    req,
  });
  return new ApiResponse(200, booking, 'Booking cancelled').send(res);
});

// Renter requests an extension.
const requestExtension = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.renter.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('Only the renter can request an extension');
  }
  if (!['confirmed', 'active'].includes(booking.status)) {
    throw ApiError.badRequest('Can only extend a confirmed or active booking');
  }

  await bookingsService.assertDatesAvailable(booking.listing, booking.startDate, req.body.requestedNewEndDate, booking._id);

  booking.extensionRequests.push(req.body);
  await booking.save();
  logAudit({
    actor: req.user._id,
    action: 'booking.extension_requested',
    category: 'booking',
    resourceType: 'booking',
    resourceId: booking._id.toString(),
    summary: 'Requested a rental extension',
    details: { requestedNewEndDate: req.body.requestedNewEndDate },
    req,
  });
  return new ApiResponse(201, booking, 'Extension requested').send(res);
});

// Owner approves/rejects.
const respondExtension = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.owner.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('Only the owner can respond to an extension request');
  }

  const extension = booking.extensionRequests.id(req.params.reqId);
  if (!extension) throw ApiError.notFound('Extension request not found');
  if (extension.status !== 'pending') throw ApiError.badRequest('This request has already been responded to');

  extension.status = req.body.approve ? 'approved' : 'rejected';
  extension.respondedAt = new Date();
  if (req.body.approve) {
    booking.endDate = extension.requestedNewEndDate;
    booking.totalDays = require('./bookings.service').daysBetween(booking.startDate, booking.endDate);
  }

  await booking.save();
  logAudit({
    actor: req.user._id,
    action: 'booking.extension_responded',
    category: 'booking',
    resourceType: 'booking',
    resourceId: booking._id.toString(),
    summary: `${extension.status === 'approved' ? 'Approved' : 'Rejected'} an extension request`,
    req,
  });
  return new ApiResponse(200, booking, `Extension request ${extension.status}`).send(res);
});

// Renter marks the item as ready to return — owner is notified to confirm.
const requestReturn = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.renter.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('Only the renter can request a return');
  }
  if (!['confirmed', 'active'].includes(booking.status)) {
    throw ApiError.badRequest(`Cannot request a return on a booking in '${booking.status}' state`);
  }

  booking.status = 'return_requested';
  await booking.save();
  logAudit({
    actor: req.user._id,
    action: 'booking.return_requested',
    category: 'booking',
    resourceType: 'booking',
    resourceId: booking._id.toString(),
    summary: 'Requested to return an item',
    req,
  });

  // The owner must acknowledge the received item.
  const listing = await Listing.findById(booking.listing).select('title');
  await notify(booking.owner, {
    type: 'return_requested',
    title: 'Return requested',
    body: `Your renter has requested to return "${listing ? listing.title : 'the item'}" — please confirm the pickup.`,
    link: '/dashboard?view=bookings',
  });

  return new ApiResponse(200, booking, 'Return requested').send(res);
});


// ESCROW step 10B: the owner reports a problem instead of confirming a clean
// return. This is the branch that was missing — without it a damaged item
// still auto-refunded the deposit, because confirm-return was the only exit
// from 'return_requested'.
//
// Raising an issue HOLDS the deposit; it does not deduct from it. The owner
// states a claim, an admin decides (step 12B). Letting the owner both accuse
// and collect would make the deposit theirs on assertion alone.
const reportIssue = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.owner.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('Only the owner can report an issue with a return');
  }
  if (!['active', 'return_requested'].includes(booking.status)) {
    throw ApiError.badRequest(`Cannot report an issue on a booking in '${booking.status}' state`);
  }

  const reason = String(req.body.reason || '').trim();
  if (!reason) throw ApiError.badRequest('Describe the issue so it can be reviewed');

  const dispute = await Dispute.create({
    booking: booking._id,
    raisedBy: req.user._id,
    reason,
    category: req.body.category || 'other',
    // Cannot exceed the deposit: claiming more than was held is meaningless,
    // and an inflated number anchors the admin's decision unfairly.
    claimedAmount: Math.min(Number(req.body.claimedAmount || 0), booking.securityDeposit || 0),
    evidence: Array.isArray(req.body.evidence) ? req.body.evidence : [],
  });

  booking.status = 'disputed';
  await booking.save();

  logAudit({
    actor: req.user._id,
    action: 'dispute.raised',
    // 'booking', not 'dispute': the AuditLog category enum is a fixed set of
    // coarse buckets, and an unknown value fails validation silently inside
    // logAudit's catch — the entry simply never appears.
    category: 'booking',
    resourceType: 'booking',
    resourceId: booking._id.toString(),
    summary: 'Owner reported an issue with a returned item',
    details: {
      dispute: dispute._id,
      category: dispute.category,
      claimedAmount: dispute.claimedAmount,
      depositHeld: booking.securityDeposit,
    },
    req,
  });

  // The renter must know their deposit is held and why — this is the point
  // where they would otherwise expect a refund.
  await notify(booking.renter, {
    type: 'dispute',
    title: 'An issue was reported with your rental',
    body: `The owner reported: ${reason}. Your security deposit is held until this is reviewed.`,
    link: `/my-rentals/${booking._id}`,
  }).catch(() => {});

  return new ApiResponse(201, dispute, 'Issue reported — an admin will review it').send(res);
});

// Owner confirms they received the item back — booking is completed.
const confirmReturn = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.owner.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('Only the owner can confirm the return');
  }
  if (booking.status !== 'return_requested') {
    throw ApiError.badRequest(`Cannot confirm the return on a booking in '${booking.status}' state`);
  }

  booking.status = 'completed';
  await booking.save();

  // ESCROW step 11A: no issue reported, so the deposit goes back to the
  // renter's original payment method. A deduction only happens through the
  // dispute path, where an admin decides — never here, on the owner's word.
  let refund = null;
  try {
    refund = await paymentsService.refundDepositToRenter(booking);
  } catch (err) {
    console.error(`[escrow] deposit refund failed for booking ${booking._id}:`, err.message);
  }

  logAudit({
    actor: req.user._id,
    action: 'booking.completed',
    category: 'booking',
    resourceType: 'booking',
    resourceId: booking._id.toString(),
    summary: 'Completed a booking',
    details: { depositStatus: booking.escrow?.depositStatus, refunded: refund?.refunded },
    req,
  });

  // Tell the renter the item was received back — review step is next.
  const listing = await Listing.findById(booking.listing).select('title');
  await notify(booking.renter, {
    type: 'return_confirmed',
    title: 'Return confirmed',
    body: `The owner confirmed the return of "${listing ? listing.title : 'the item'}" — you can now leave a review.`,
    link: `/my-rentals/${booking._id}`,
  });

  return new ApiResponse(200, booking, 'Return confirmed').send(res);
});

module.exports = {
  reportIssue,
  startRental,
  createBooking,
  myBookings,
  ownerBookings,
  getBooking,
  confirmBooking,
  cancelBooking,
  requestReturn,
  confirmReturn,
  requestExtension,
  respondExtension,
};
