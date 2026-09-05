const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const Booking = require('../../models/Booking');
const Dispute = require('../../models/Dispute');
const paymentsService = require('../payments/payments.service');
const Listing = require('../../models/Listing');
const bookingsService = require('./bookings.service');
const settingsService = require('../settings/settings.service');
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
  const existing = await Booking.findById(req.params.id);
  if (!existing) throw ApiError.notFound('Booking not found');
  if (existing.owner.toString() !== req.user._id.toString()) throw ApiError.forbidden('Only the owner can confirm');
  if (existing.status !== 'requested') {
    throw ApiError.badRequest(`Cannot confirm a booking in '${existing.status}' state`);
  }

  // Nothing else may already be committed to these dates. Several people can
  // ask for the same window, but only one of those requests can be accepted.
  const committed = await Booking.findOne({
    ...bookingsService.overlapQuery(existing.listing, existing.startDate, existing.endDate, [
      'awaiting_payment',
      'confirmed',
      'active',
      'return_requested',
    ]),
    _id: { $ne: existing._id },
  });
  if (committed) {
    throw ApiError.conflict('Another booking for these dates has already been accepted');
  }

  const windowHours = await settingsService.getPaymentWindowHours();
  const approvedAt = new Date();
  const paymentDueAt = new Date(approvedAt.getTime() + windowHours * 3600 * 1000);

  // Claimed with the status in the filter, so two approvals arriving together
  // cannot both succeed — the second matches nothing and is told why.
  const booking = await Booking.findOneAndUpdate(
    { _id: existing._id, status: 'requested' },
    { $set: { status: 'awaiting_payment', approvedAt, paymentDueAt } },
    { new: true }
  );
  if (!booking) throw ApiError.conflict('That request was already handled');

  // Everyone else who asked for an overlapping window is now out. Left as
  // 'requested' they would sit in the renter's list looking live, and the
  // owner would be able to accept a second one for dates that are taken.
  const losers = await Booking.find({
    ...bookingsService.overlapQuery(booking.listing, booking.startDate, booking.endDate, ['requested']),
    _id: { $ne: booking._id },
  });
  if (losers.length) {
    await Booking.updateMany(
      { _id: { $in: losers.map((b) => b._id) } },
      {
        $set: {
          status: 'cancelled',
          cancelledBy: req.user._id,
          cancellationReason: 'The owner accepted another request for these dates',
        },
      }
    );
  }
  logAudit({
    actor: req.user._id,
    action: 'booking.approved',
    category: 'booking',
    resourceType: 'booking',
    resourceId: booking._id.toString(),
    summary: 'Approved a booking; awaiting renter payment',
    req,
  });

  // Tell the renter their request was approved.
  const listing = await Listing.findById(booking.listing).select('title');
  const dueLabel = paymentDueAt.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
  await notify(booking.renter, {
    type: 'booking_confirmed',
    title: 'Booking approved — payment needed',
    body: `The owner approved your booking for "${listing ? listing.title : 'your rental'}". `
      + `Pay by ${dueLabel} to secure it, or the dates go back on sale.`,
    link: `/checkout/booking/${booking._id}`,
  });

  // The people who did not get it are told now, rather than being left with a
  // request that quietly never moves.
  for (const lost of losers) {
    await notify(lost.renter, {
      type: 'booking_cancelled',
      title: 'Request not accepted',
      body: `The owner accepted another request for "${listing ? listing.title : 'that item'}" `
        + 'on those dates. Nothing was charged.',
      link: '/my-rentals',
    }).catch(() => {});
  }

  return new ApiResponse(200, booking, 'Booking approved; awaiting payment').send(res);
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
  let extensionFee = 0;
  if (req.body.approve) {
    const previousDays = booking.totalDays;
    booking.endDate = extension.requestedNewEndDate;
    booking.totalDays = require('./bookings.service').daysBetween(booking.startDate, booking.endDate);

    // Extra days cost money, and until now approving an extension silently
    // gave them away. The fee is recorded as owed rather than charged: the
    // renter has already paid and there is no card on file to bill again,
    // so it comes out of the deposit at settlement — which is what the
    // client's instruction describes for an unpaid extension.
    const extraDays = Math.max(0, booking.totalDays - previousDays);
    extensionFee = extraDays * booking.pricePerDay;
    if (extensionFee > 0) {
      await require('../ledger/ledger.service').record({
        booking,
        component: 'extension_fee',
        action: 'charge',
        amount: extensionFee,
        from: 'renter',
        to: 'owner',
        counterparty: booking.owner,
        actor: req.user._id,
        note: `${extraDays} extra day(s) approved — deducted from the deposit if unpaid`,
      });
    }
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

  const isOwner = booking.owner.toString() === req.user._id.toString();
  const isRenter = booking.renter.toString() === req.user._id.toString();
  if (!isOwner && !isRenter) {
    throw ApiError.forbidden('Only the people on this booking can raise a dispute');
  }

  // The two sides can go wrong at different moments, so they are allowed to
  // raise a dispute at different points.
  //
  // An owner claims against a return, which only exists once the item is out.
  // A renter's complaint usually starts earlier -- an item that never
  // arrived, or is not what was described -- and telling them to wait until
  // the rental is over before they can say so is how a complaint becomes a
  // chargeback instead.
  // Status names taken from the Booking enum, not guessed: 'paid' was in
  // this list and is not a status the model has, so it was a branch that
  // could never be reached.
  //
  // A renter can dispute from 'confirmed' -- the point at which they have
  // paid and are owed an item -- through to 'completed'. Before that,
  // nothing has been exchanged to dispute.
  const allowed = isOwner
    ? ['active', 'return_requested']
    : ['confirmed', 'active', 'return_requested', 'completed'];
  if (!allowed.includes(booking.status)) {
    throw ApiError.badRequest(`Cannot raise a dispute on a booking in '${booking.status}' state`);
  }

  // One open dispute per booking. A second is a second claim over the same
  // deposit, and an admin resolving one would not know the other existed.
  const existing = await Dispute.findOne({
    booking: booking._id,
    status: { $in: ['open', 'under_review'] },
  });
  if (existing) {
    throw ApiError.conflict('A dispute is already open on this booking');
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
    // Only an owner claims against the deposit. A renter's dispute is a
    // complaint to be judged, not a bid for someone else's money.
    claimedAmount: isOwner
      ? Math.min(Number(req.body.claimedAmount || 0), booking.securityDeposit || 0)
      : 0,
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
    summary: isOwner
      ? 'Owner reported an issue with a returned item'
      : 'Renter raised a dispute on their rental',
    details: {
      dispute: dispute._id,
      category: dispute.category,
      claimedAmount: dispute.claimedAmount,
      depositHeld: booking.securityDeposit,
    },
    req,
  });

  // Whoever did not raise it needs to hear about it. Notifying the renter
  // unconditionally told the wrong person when the renter was the one
  // complaining -- and left the owner unaware of a claim against them.
  await notify(isOwner ? booking.renter : booking.owner, {
    type: 'dispute',
    title: isOwner
      ? 'An issue was reported with your rental'
      : 'A renter raised a dispute on your item',
    body: isOwner
      ? `The owner reported: ${reason}. Your security deposit is held until this is reviewed.`
      : `The renter reported: ${reason}. An admin will review it.`,
    link: `/bookings/${booking._id}`,
  }).catch(() => {});

  return new ApiResponse(201, dispute, 'Raised — an admin will review it').send(res);
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
