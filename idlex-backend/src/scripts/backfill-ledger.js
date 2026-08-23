// Reconstructs ledger entries for bookings that were paid before the ledger
// existed.
//
// Without this the admin settlement screen is empty on day one while six
// owners are genuinely owed money — the ledger would be technically correct
// and practically useless. Entries are derived from what the booking already
// records, so nothing is invented.
//
// Safe to run more than once: bookings that already have entries are skipped.
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const Booking = require('../models/Booking');
  const LedgerEntry = require('../models/LedgerEntry');
  const ledger = require('../modules/ledger/ledger.service');

  // Only bookings that were actually paid for have money to account for.
  const paid = await Booking.find({
    status: { $in: ['confirmed', 'active', 'return_requested', 'completed'] },
  });

  let created = 0;
  let skipped = 0;

  for (const booking of paid) {
    if (await LedgerEntry.countDocuments({ booking: booking._id })) {
      skipped += 1;
      continue;
    }

    await ledger.record({
      booking, component: 'rental', action: 'hold', amount: booking.subtotal,
      from: 'renter', to: 'platform', counterparty: booking.owner,
      note: 'Backfilled from booking record',
    });
    await ledger.record({
      booking, component: 'platform_fee', action: 'charge', amount: booking.serviceFee,
      from: 'renter', to: 'platform', settlement: 'not_required',
      note: 'Backfilled from booking record',
    });
    await ledger.record({
      booking, component: 'security_deposit', action: 'hold', amount: booking.securityDeposit,
      from: 'renter', to: 'platform', counterparty: booking.renter,
      note: 'Backfilled from booking record',
    });

    // The escrow flags say whether the rent was already considered released.
    // It stays 'pending' either way, because no transfer ever actually ran —
    // which is the fact this whole exercise exists to make visible.
    if (booking.escrow?.rentStatus === 'released') {
      await ledger.record({
        booking, component: 'rental', action: 'release', amount: booking.subtotal,
        from: 'platform', to: 'owner', counterparty: booking.owner,
        note: 'Backfilled — owed to the owner, no transfer has run',
      });
    }

    if (booking.escrow?.depositDeducted > 0) {
      await ledger.record({
        booking, component: 'damage_deduction', action: 'deduct',
        amount: booking.escrow.depositDeducted,
        from: 'renter', to: 'owner', counterparty: booking.owner,
        note: booking.escrow.depositDeductionReason || 'Backfilled deduction',
      });
    }

    if (['refunded', 'partially_deducted'].includes(booking.escrow?.depositStatus)) {
      const refunded = booking.securityDeposit - (booking.escrow.depositDeducted || 0);
      await ledger.record({
        booking, component: 'security_deposit', action: 'refund', amount: refunded,
        from: 'platform', to: 'renter', counterparty: booking.renter,
        note: 'Backfilled from booking record',
      });
    }

    created += 1;
  }

  console.log(`[backfill] ${created} booking(s) reconstructed, ${skipped} already had entries`);
  await mongoose.disconnect();
})();
