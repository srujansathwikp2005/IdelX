const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const ManualPayment = require('../../models/ManualPayment');
const Booking = require('../../models/Booking');
const service = require('./manual-payments.service');
const env = require('../../config/env');
const { logAudit } = require('../../utils/audit');
const { sendPaymentConfirmedEmail } = require('../../utils/email');
const User = require('../../models/User');

// What the renter needs in order to pay: the amounts, broken out, and where
// to send the money. Served rather than hard-coded in the app so the UPI
// details can change without shipping a release.
const getPaymentInstructions = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.bookingId).populate('listing', 'title');
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.renter.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('This booking is not yours');
  }

  const existing = await ManualPayment.findOne({ booking: booking._id })
    .sort('-createdAt')
    .lean();

  return new ApiResponse(200, {
    booking: {
      id: booking._id,
      status: booking.status,
      listingTitle: booking.listing?.title ?? null,
      startDate: booking.startDate,
      endDate: booking.endDate,
      totalDays: booking.totalDays,
    },
    // The breakdown the checkout screen shows. Sent as separate figures
    // rather than one total, because the deposit is refundable and the
    // rental is not, and a renter should see that before paying.
    amounts: {
      rentalAmount: booking.subtotal,
      platformFee: booking.serviceFee,
      securityDeposit: booking.securityDeposit,
      totalAmount: booking.totalAmount,
    },
    payTo: {
      upiId: env.manualPayment.upiId,
      payeeName: env.manualPayment.payeeName,
      // A UPI intent string the app can render as a QR code, so nothing has
      // to ship an image that would go stale if the account changed.
      upiUri: env.manualPayment.upiId
        ? `upi://pay?pa=${encodeURIComponent(env.manualPayment.upiId)}` +
          `&pn=${encodeURIComponent(env.manualPayment.payeeName || 'IdleX')}` +
          `&am=${booking.totalAmount}&cu=INR` +
          `&tn=${encodeURIComponent(`IdleX booking ${booking._id}`)}`
        : null,
    },
    submission: existing
      ? {
          id: existing._id,
          status: existing.status,
          utr: existing.utr,
          submittedAt: existing.createdAt,
          rejectionReason: existing.rejectionReason,
        }
      : null,
  }, 'Payment instructions').send(res);
});

const submitPayment = asyncHandler(async (req, res) => {
  const payment = await service.submit(req.user._id, {
    bookingId: req.body.bookingId,
    utr: req.body.utr,
  });

  logAudit({
    actor: req.user._id,
    action: 'payment.manual_submitted',
    category: 'payment',
    resourceType: 'booking',
    resourceId: payment.booking.toString(),
    summary: 'Renter submitted a UPI reference for verification',
    details: { utr: payment.utr, amount: payment.totalAmount },
    req,
  });

  return new ApiResponse(201, payment, 'Submitted — we will confirm once the payment is checked').send(res);
});

// --- admin ----------------------------------------------------------------

const listForReview = asyncHandler(async (req, res) => {
  const { status = 'verification_pending' } = req.query;
  const filter = status === 'all' ? {} : { status };
  const payments = await ManualPayment.find(filter)
    // Oldest first: whoever paid first has been waiting longest.
    .sort({ createdAt: 1 })
    .populate('payer', 'name email phone')
    .populate('listing', 'title')
    .populate('booking', 'status startDate endDate');
  return new ApiResponse(200, payments, 'Manual payments').send(res);
});

const reviewPayment = asyncHandler(async (req, res) => {
  const { status, rejectionReason } = req.body;
  if (!['verified', 'rejected'].includes(status)) {
    throw ApiError.badRequest("status must be 'verified' or 'rejected'");
  }

  const { payment, booking } = await service.review(req.params.id, {
    status,
    rejectionReason,
    adminId: req.user._id,
  });

  logAudit({
    actor: req.user._id,
    action: 'payment.manual_reviewed',
    category: 'payment',
    resourceType: 'booking',
    resourceId: booking._id.toString(),
    summary: `Manual payment ${status}`,
    details: { utr: payment.utr, amount: payment.totalAmount, rejectionReason: payment.rejectionReason },
    req,
  });

  // Emailed after the decision is saved, and its failure is never allowed to
  // undo a verification that has already confirmed a booking.
  if (status === 'verified') {
    const renter = await User.findById(payment.payer).select('name email');
    if (renter?.email) {
      await sendPaymentConfirmedEmail({
        to: renter.email,
        name: renter.name,
        bookingId: booking._id.toString(),
        itemTitle: payment.listing?.title || 'your rental',
        rentalAmount: payment.rentalAmount,
        securityDeposit: payment.securityDeposit,
        totalAmount: payment.totalAmount,
        utr: payment.utr,
      });
    }
  }

  return new ApiResponse(200, payment, `Payment ${status}`).send(res);
});

module.exports = { getPaymentInstructions, submitPayment, listForReview, reviewPayment };
