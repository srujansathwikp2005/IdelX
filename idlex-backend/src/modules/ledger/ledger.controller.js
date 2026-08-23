const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const ApiResponse = require('../../utils/ApiResponse');
const ledger = require('./ledger.service');
const { activeProvider } = require('../settlement/settlement.provider');
const Booking = require('../../models/Booking');
const { PayoutSettings } = require('../../models/Payout');

// The ledger for one booking: every movement, and the balances derived from
// them. Visible to the two people in the booking and to admins — a renter
// asking where their deposit went should be able to see the answer without
// opening a support ticket.
const bookingLedger = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound('Booking not found');

  const me = req.user._id.toString();
  const involved = booking.renter.toString() === me || booking.owner.toString() === me;
  if (!involved && req.user.role !== 'admin') {
    throw ApiError.forbidden('You cannot view this ledger');
  }

  const summary = await ledger.summarize(booking._id);
  return new ApiResponse(200, summary, 'Booking ledger').send(res);
});

// Everything the platform currently owes, with the details needed to pay it.
//
// This is the screen that makes manual settlement workable: who is owed
// what, and where to send it. It reads the same pending entries an automated
// payout run would, so switching to one changes nothing about what is owed.
const outstanding = asyncHandler(async (req, res) => {
  const entries = await ledger.outstandingObligations();

  const rows = await Promise.all(
    entries.map(async (entry) => {
      const settings =
        entry.to === 'owner' && entry.counterparty
          ? await PayoutSettings.findOne({ owner: entry.counterparty._id }).lean()
          : null;

      return {
        id: entry._id,
        booking: entry.booking,
        component: entry.component,
        amount: entry.amount,
        payTo: entry.to,
        recipient: entry.counterparty,
        createdAt: entry.createdAt,
        note: entry.note,
        // Present for an owner with payout details saved; null for a renter
        // refund, which goes back to the original payment instrument and
        // needs no bank details at all.
        payoutDetails: settings
          ? {
              accountHolderName: settings.accountHolderName,
              accountNumber: settings.accountNumber,
              ifsc: settings.ifscOrRoutingNumber,
              bankName: settings.bankName,
              upiId: settings.upiId,
            }
          : null,
      };
    })
  );

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return new ApiResponse(
    200,
    { items: rows, total, provider: activeProvider().name },
    'Outstanding obligations'
  ).send(res);
});

// Records that a transfer actually happened. Used by an admin who has just
// sent the money by UPI or bank transfer, and by any automated provider that
// settles later.
const settle = asyncHandler(async (req, res) => {
  const { reference, provider } = req.body;
  if (!reference) throw ApiError.badRequest('A payment reference is required');

  const entry = await ledger.markSettled(req.params.entryId, {
    provider: provider || 'manual',
    providerReference: reference,
    actor: req.user._id,
  });

  return new ApiResponse(200, entry, 'Marked as settled').send(res);
});

module.exports = { bookingLedger, outstanding, settle };
