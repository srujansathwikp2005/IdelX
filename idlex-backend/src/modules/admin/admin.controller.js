const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const User = require('../../models/User');
const Conversation = require('../../models/Conversation');
const Listing = require('../../models/Listing');
const Booking = require('../../models/Booking');
const paymentsService = require('../payments/payments.service');
const Payment = require('../../models/Payment');
const Dispute = require('../../models/Dispute');
const Kyc = require('../../models/Kyc');
const AuditLog = require('../../models/AuditLog');
const { logAudit } = require('../../utils/audit');

// Dashboard numbers — Django's aggregation API equivalent via Mongo's
// countDocuments / aggregate.
const getStats = asyncHandler(async (req, res) => {
  const [users, listings, activeBookings, revenue] = await Promise.all([
    User.countDocuments(),
    Listing.countDocuments(),
    Booking.countDocuments({ status: { $in: ['confirmed', 'active'] } }),
    Payment.aggregate([{ $match: { status: 'captured' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);

  return new ApiResponse(200, {
    totalUsers: users,
    totalListings: listings,
    activeBookings,
    totalRevenue: revenue[0]?.total || 0,
  }, 'Dashboard stats').send(res);
});

// ---------------------------------------------------------------------------
// Analytics — powers the graphical metrics on the admin dashboard
// ---------------------------------------------------------------------------

// Full list of ISO dates for the last `days` days, oldest first.
function dayWindow(days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Merge aggregation rows [{_id: 'YYYY-MM-DD', ...}] into a zero-filled series.
function fillSeries(days, rows, field) {
  const byDate = Object.fromEntries(rows.map((r) => [r._id, r[field]]));
  return days.map((date) => ({ date, value: byDate[date] || 0 }));
}

const getAnalytics = asyncHandler(async (req, res) => {
  const windowDays = Math.min(90, Math.max(7, Number(req.query.days) || 30));
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (windowDays - 1));

  const dateKey = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };

  const [signupRows, revenueRows, bookingRows, bookingStatusRows, categoryRows, actionRows, topActorRows, recentLogs, totals] =
    await Promise.all([
      User.aggregate([{ $match: { createdAt: { $gte: start } } }, { $group: { _id: dateKey, count: { $sum: 1 } } }]),
      Payment.aggregate([
        { $match: { status: 'captured', createdAt: { $gte: start } } },
        { $group: { _id: dateKey, amount: { $sum: '$amount' } } },
      ]),
      Booking.aggregate([{ $match: { createdAt: { $gte: start } } }, { $group: { _id: dateKey, count: { $sum: 1 } } }]),
      Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Listing.aggregate([{ $match: { status: 'published' } }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
      AuditLog.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      AuditLog.aggregate([
        { $match: { actor: { $ne: null } } },
        { $group: { _id: '$actor', count: { $sum: 1 }, lastActive: { $max: '$createdAt' } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      AuditLog.find().sort('-createdAt').limit(10).populate('actor', 'name email avatarUrl').lean(),
      Promise.all([
        User.countDocuments(),
        Listing.countDocuments(),
        Booking.countDocuments({ status: { $in: ['confirmed', 'active'] } }),
        Payment.aggregate([{ $match: { status: 'captured' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      ]),
    ]);

  const days = dayWindow(windowDays);

  // Resolve the top actor ids back into user documents.
  const actorUsers = await User.find({ _id: { $in: topActorRows.map((r) => r._id) } })
    .select('name email avatarUrl isActive')
    .lean();
  const userById = Object.fromEntries(actorUsers.map((u) => [u._id.toString(), u]));
  const topUsers = topActorRows
    .map((r) => ({ user: userById[r._id.toString()] || null, actions: r.count, lastActive: r.lastActive }))
    .filter((t) => t.user);

  return new ApiResponse(
    200,
    {
      windowDays,
      totals: {
        totalUsers: totals[0],
        totalListings: totals[1],
        activeBookings: totals[2],
        totalRevenue: totals[3][0]?.total || 0,
      },
      newSignups: fillSeries(days, signupRows, 'count'),
      revenueTrend: fillSeries(days, revenueRows, 'amount'),
      bookingTrend: fillSeries(days, bookingRows, 'count'),
      bookingsByStatus: bookingStatusRows.map((r) => ({ status: r._id, count: r.count })).sort((a, b) => b.count - a.count),
      listingsByCategory: categoryRows.map((r) => ({ category: r._id, count: r.count })).sort((a, b) => b.count - a.count),
      activityBreakdown: actionRows.map((r) => ({ action: r._id, count: r.count })),
      topUsers,
      recentActivity: recentLogs,
    },
    'Admin analytics'
  ).send(res);
});

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

const listAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, action, category, resourceType, q, from, to } = req.query;

  const filter = {};
  if (action) filter.action = action;
  if (category) filter.category = category;
  if (resourceType) filter.resourceType = resourceType;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  // Free-text search: matches the log summary, or any log whose actor's
  // name/email matches the query.
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    const matches = await User.find({ $or: [{ name: re }, { email: re }] }).select('_id').lean();
    filter.$or = [{ summary: re }, { actor: { $in: matches.map((u) => u._id) } }];
  }

  const total = await AuditLog.countDocuments(filter);
  const items = await AuditLog.find(filter)
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .populate('actor', 'name email avatarUrl role');

  return new ApiResponse(
    200,
    {
      items,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
    },
    'Audit logs'
  ).send(res);
});

// ---------------------------------------------------------------------------
// Full-scope resource listings for the admin console
// ---------------------------------------------------------------------------

const listBookings = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const filter = status ? { status } : {};
  const total = await Booking.countDocuments(filter);
  const items = await Booking.find(filter)
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .populate('listing', 'title photos pricePerDay')
    .populate('renter', 'name email avatarUrl')
    .populate('owner', 'name email avatarUrl');
  return new ApiResponse(
    200,
    { items, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) } },
    'Bookings'
  ).send(res);
});

const listPayments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const filter = status ? { status } : {};
  const total = await Payment.countDocuments(filter);
  const items = await Payment.find(filter)
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .populate('booking', 'totalAmount status')
    .populate('payer', 'name email');
  return new ApiResponse(
    200,
    { items, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) } },
    'Payments'
  ).send(res);
});

// ---------------------------------------------------------------------------
// Existing admin operations (instrumented with audit logs)
// ---------------------------------------------------------------------------

const listUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, role } = req.query;
  const filter = role ? { role } : {};
  const users = await User.find(filter)
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(Number(limit));
  return new ApiResponse(200, users, 'Users').send(res);
});

// Suspend/unsuspend a user.
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
  if (!user) throw ApiError.notFound('User not found');
  logAudit({
    actor: req.user._id,
    action: 'admin.user_updated',
    category: 'admin',
    resourceType: 'user',
    resourceId: user._id.toString(),
    summary: req.body.isActive !== undefined
      ? `${req.body.isActive ? 'Restored' : 'Suspended'} user ${user.name}`
      : `Updated user ${user.name}`,
    details: req.body,
    req,
  });
  return new ApiResponse(200, user.toSafeJSON(), 'User updated').send(res);
});

const listListingsForModeration = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const listings = await Listing.find(filter).sort('-createdAt').populate('owner', 'name email');
  return new ApiResponse(200, listings, 'Listings for moderation').send(res);
});

const moderateListing = asyncHandler(async (req, res) => {
  const listing = await Listing.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
  if (!listing) throw ApiError.notFound('Listing not found');
  logAudit({
    actor: req.user._id,
    action: 'admin.listing_moderated',
    category: 'admin',
    resourceType: 'listing',
    resourceId: listing._id.toString(),
    summary: `Changed listing "${listing.title}" to ${req.body.status}`,
    details: req.body,
    req,
  });
  return new ApiResponse(200, listing, 'Listing moderated').send(res);
});

const listDisputes = asyncHandler(async (req, res) => {
  const disputes = await Dispute.find()
    .sort('-createdAt')
    .populate('booking')
    .populate('raisedBy', 'name email');
  return new ApiResponse(200, disputes, 'Disputes').send(res);
});

const resolveDispute = asyncHandler(async (req, res) => {
  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) throw ApiError.notFound('Dispute not found');

  dispute.status = req.body.status || 'resolved';
  dispute.resolutionNote = req.body.resolutionNote;
  dispute.resolvedBy = req.user._id;
  await dispute.save();

  // ESCROW step 12B: the admin's decision is what settles the deposit.
  // depositDeduction is the amount withheld for damage; the remainder goes
  // back to the renter. Only this path may deduct — an owner reporting an
  // issue holds the deposit but cannot take from it.
  let escrowResult = null;
  if (dispute.booking) {
    const booking = await Booking.findById(dispute.booking);
    if (booking) {
      const deduction = Number(req.body.depositDeduction || 0);
      try {
        escrowResult = await paymentsService.refundDepositToRenter(booking, {
          deduction,
          reason: req.body.resolutionNote || 'Dispute resolution',
        });
      } catch (err) {
        console.error(`[escrow] deposit settlement failed for booking ${booking._id}:`, err.message);
      }
    }
  }

  logAudit({
    actor: req.user._id,
    action: 'admin.dispute_resolved',
    category: 'admin',
    resourceType: 'dispute',
    resourceId: dispute._id.toString(),
    summary: `Marked dispute as ${dispute.status}`,
    details: { resolutionNote: dispute.resolutionNote },
    req,
  });

  return new ApiResponse(200, dispute, 'Dispute resolved').send(res);
});

// Flagged content queue — placeholder aggregation; wire to a Report
// model if/when content flagging is built out.
const listReports = asyncHandler(async (req, res) => {
  const openDisputes = await Dispute.find({ status: 'open' }).populate('raisedBy', 'name email');
  return new ApiResponse(200, openDisputes, 'Flagged content queue').send(res);
});

// KYC review queue — the admin half of the stepper flow: users submit
// (status -> pending), admins approve/reject here.
const listKyc = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const kycs = await Kyc.find(filter)
    .sort('-createdAt')
    .populate('user', 'name email phone isOwner role');
  return new ApiResponse(200, kycs, 'KYC submissions').send(res);
});

const reviewKyc = asyncHandler(async (req, res) => {
  const kyc = await Kyc.findById(req.params.id);
  if (!kyc) throw ApiError.notFound('KYC submission not found');
  if (kyc.status !== 'pending') {
    throw ApiError.badRequest(`Cannot review a submission in '${kyc.status}' state`);
  }

  const { status, rejectionReason } = req.body;
  kyc.status = status;
  kyc.reviewedBy = req.user._id;
  kyc.reviewedAt = new Date();
  kyc.rejectionReason = status === 'rejected' ? rejectionReason || 'Not approved' : null;
  await kyc.save();

  // An approved KYC activates payment setup: the bank details collected
  // during verification become the owner's payout settings, ready for
  // Razorpay payouts once real keys are configured.
  if (status === 'approved' && kyc.bankDetails) {
    const { PayoutSettings } = require('../../models/Payout');
    await PayoutSettings.findOneAndUpdate(
      { owner: kyc.user },
      {
        $set: {
          accountHolderName: kyc.bankDetails.accountHolderName,
          accountNumber: kyc.bankDetails.accountNumber,
          ifscOrRoutingNumber: kyc.bankDetails.ifsc,
          bankName: kyc.bankDetails.bankName,
          upiId: kyc.bankDetails.upiId,
        },
      },
      { upsert: true, new: true }
    );
  }

  logAudit({
    actor: req.user._id,
    action: 'admin.kyc_reviewed',
    category: 'admin',
    resourceType: 'kyc',
    resourceId: kyc._id.toString(),
    summary: `KYC ${status}${rejectionReason ? ` — ${rejectionReason}` : ''}`,
    details: { status, rejectionReason },
    req,
  });

  return new ApiResponse(200, kyc, `KYC ${status}`).send(res);
});


// --- Sections that previously rendered from static mock data ---------------

// Every conversation on the platform, most recent first. Admins moderate
// disputes, so they need the real threads rather than a sample.
const listConversations = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({})
    .sort('-lastMessageAt')
    .limit(200)
    .populate('participants', 'name email')
    .populate('listing', 'title');
  return new ApiResponse(200, conversations, 'Conversations').send(res);
});

// Categories are a free-text field on Listing rather than their own
// collection, so the real marketplace categories are whatever owners have
// actually used. Aggregating gives the true list plus how many listings sit
// in each — more useful than a fixed enum that drifts from reality.
const listCategories = asyncHandler(async (req, res) => {
  const categories = await Listing.aggregate([
    { $match: { category: { $nin: [null, ''] } } },
    {
      $group: {
        _id: '$category',
        listings: { $sum: 1 },
        published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
        avgPricePerDay: { $avg: '$pricePerDay' },
      },
    },
    { $project: { _id: 0, name: '$_id', listings: 1, published: 1, avgPricePerDay: { $round: ['$avgPricePerDay', 0] } } },
    { $sort: { listings: -1, name: 1 } },
  ]);
  return new ApiResponse(200, categories, 'Categories').send(res);
});

// Extension requests are embedded in bookings, so they have to be unwound to
// be reviewed as a queue.
const listExtensionRequests = asyncHandler(async (req, res) => {
  const requests = await Booking.aggregate([
    { $match: { 'extensionRequests.0': { $exists: true } } },
    { $unwind: '$extensionRequests' },
    { $sort: { 'extensionRequests.createdAt': -1 } },
    { $limit: 200 },
    {
      $project: {
        _id: '$extensionRequests._id',
        bookingId: '$_id',
        status: '$extensionRequests.status',
        requestedUntil: '$extensionRequests.requestedUntil',
        createdAt: '$extensionRequests.createdAt',
        renter: 1,
        listing: 1,
      },
    },
  ]);
  await Booking.populate(requests, [
    { path: 'renter', select: 'name email' },
    { path: 'listing', select: 'title' },
  ]);
  return new ApiResponse(200, requests, 'Extension requests').send(res);
});

module.exports = {
  listConversations,
  listCategories,
  listExtensionRequests,
  getStats,
  getAnalytics,
  listAuditLogs,
  listBookings,
  listPayments,
  listUsers,
  updateUser,
  listListingsForModeration,
  moderateListing,
  listDisputes,
  resolveDispute,
  listReports,
  listKyc,
  reviewKyc,
};
