const ManualPayment = require('../../models/ManualPayment');
const Booking = require('../../models/Booking');
const ApiError = require('../../utils/ApiError');
const ledger = require('../ledger/ledger.service');
const { notify } = require('../notifications/notifications.service');

// A UTR is 12 digits from most Indian banks, but UPI apps surface longer
// alphanumeric references too. Normalised rather than rejected on shape:
// refusing a reference because it does not look the way we expect is worse
// than storing one an admin can still check against the bank statement.
function normaliseUtr(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

// Records a payment the renter says they made.
//
// Nothing here confirms anything. The record exists so an admin can check it
// against money that actually arrived, which is the whole point of the manual
// flow — a renter typing a reference is a claim, not a receipt.
async function submit(userId, { bookingId, utr }) {
  const reference = normaliseUtr(utr);
  if (!reference) throw ApiError.badRequest('Enter the UPI transaction ID from your payment app');

  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.renter.toString() !== userId.toString()) {
    throw ApiError.forbidden('This booking is not yours');
  }
  if (booking.status !== 'awaiting_payment') {
    throw ApiError.badRequest(
      `This booking is in '${booking.status}' state and is not waiting for payment`
    );
  }

  // Checked before writing so the common case gets a message that explains
  // itself. The unique index below is what actually guarantees it — two
  // submissions racing would both pass this check.
  const clash = await ManualPayment.findOne({ utr: reference });
  if (clash) {
    throw ApiError.conflict(
      'That transaction ID has already been submitted. Each payment can only be used once.'
    );
  }

  // One open submission per booking, so an admin is never choosing between
  // two claims for the same money.
  const open = await ManualPayment.findOne({
    booking: booking._id,
    status: { $in: ['verification_pending', 'verified'] },
  });
  if (open) {
    throw ApiError.conflict(
      open.status === 'verified'
        ? 'This booking has already been paid for.'
        : 'A payment for this booking is already waiting to be checked.'
    );
  }

  try {
    return await ManualPayment.create({
      booking: booking._id,
      payer: booking.renter,
      listing: booking.listing,
      // From the booking, not the request body. A client that could name its
      // own amounts could claim to have paid ten rupees for a ten thousand
      // rupee rental.
      rentalAmount: booking.subtotal,
      platformFee: booking.serviceFee,
      securityDeposit: booking.securityDeposit,
      totalAmount: booking.totalAmount,
      utr: reference,
    });
  } catch (err) {
    // The unique index, reached by two submissions arriving together.
    if (err.code === 11000) {
      throw ApiError.conflict('That transaction ID has already been submitted.');
    }
    throw err;
  }
}

// The admin's decision. This is the only path by which a booking becomes
// confirmed under the manual flow.
async function review(paymentId, { status, rejectionReason, adminId }) {
  const payment = await ManualPayment.findById(paymentId).populate('listing', 'title');
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status !== 'verification_pending') {
    throw ApiError.badRequest(`This payment has already been ${payment.status}`);
  }

  const booking = await Booking.findById(payment.booking);
  if (!booking) throw ApiError.notFound('Booking not found for this payment');

  payment.status = status;
  payment.reviewedBy = adminId;
  payment.reviewedAt = new Date();
  payment.rejectionReason = status === 'rejected' ? rejectionReason || 'Payment could not be verified' : null;
  await payment.save();

  if (status === 'rejected') {
    await notify(payment.payer, {
      type: 'payment_captured',
      title: 'Your payment could not be verified',
      body: `${payment.rejectionReason} You can submit the transaction ID again.`,
      link: `/pay/${booking._id}`,
    }).catch(() => {});
    return { payment, booking };
  }

  // Verified. The booking confirms and the money is split into what it is
  // actually made of, because the three parts settle differently and at
  // different times: the rental goes to the owner, the fee is ours, and the
  // deposit has to stay refundable.
  if (booking.status === 'awaiting_payment') {
    booking.status = 'confirmed';
    await booking.save();

    await ledger.record({
      booking, component: 'rental', action: 'hold', amount: booking.subtotal,
      from: 'renter', to: 'platform', counterparty: booking.owner,
      note: `Rental collected by UPI (${payment.utr}), held until the renter confirms receipt`,
    });
    await ledger.record({
      booking, component: 'platform_fee', action: 'charge', amount: booking.serviceFee,
      from: 'renter', to: 'platform', settlement: 'not_required',
      note: 'IdleX platform fee',
    });
    await ledger.record({
      booking, component: 'security_deposit', action: 'hold', amount: booking.securityDeposit,
      from: 'renter', to: 'platform', counterparty: booking.renter,
      note: `Refundable deposit collected by UPI (${payment.utr})`,
    });
  }

  await notify(payment.payer, {
    type: 'payment_captured',
    title: 'Payment verified — your booking is confirmed',
    body: 'You can arrange the handover with the owner.',
    link: `/bookings/${booking._id}`,
  }).catch(() => {});

  await notify(booking.owner, {
    type: 'booking_confirmed',
    title: 'A booking has been paid for',
    body: 'The renter has paid and the booking is confirmed.',
    link: `/bookings/${booking._id}`,
  }).catch(() => {});

  return { payment, booking };
}

module.exports = { submit, review, normaliseUtr };
