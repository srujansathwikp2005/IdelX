// One-off repair for ledger rows the first backfill left wrong.
//
// Deposit refunds that had already gone back through the payment gateway
// were recorded as 'pending', which reads as "still owed". On the settlement
// screen that is an instruction to pay, and the money had already been sent —
// so anyone working that list would have paid it twice.
//
// A row is only corrected when the booking itself says the refund completed
// and records when. Anything ambiguous is left alone and reported, because
// wrongly marking a real obligation as paid is the same mistake pointing the
// other way.
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const LedgerEntry = require('../models/LedgerEntry');
  const Booking = require('../models/Booking');

  const suspect = await LedgerEntry.find({
    component: 'security_deposit',
    action: 'refund',
    settlement: 'pending',
    note: /^Backfilled/,
  });

  let fixed = 0;
  let left = 0;

  for (const entry of suspect) {
    const booking = await Booking.findById(entry.booking);
    const alreadyRefunded =
      booking &&
      ['refunded', 'partially_deducted'].includes(booking.escrow?.depositStatus) &&
      booking.escrow?.depositRefundedAt;

    if (!alreadyRefunded) {
      left += 1;
      console.log(`[fix] left pending: ${entry._id} (booking ${entry.booking}) — no completed refund on record`);
      continue;
    }

    entry.settlement = 'settled';
    entry.provider = 'cashfree_pg';
    entry.settledAt = booking.escrow.depositRefundedAt;
    entry.note = `Backfilled — refunded via the gateway on ${new Date(
      booking.escrow.depositRefundedAt
    ).toISOString().slice(0, 10)}`;
    await entry.save();
    fixed += 1;
    console.log(`[fix] settled Rs ${entry.amount} for booking ${entry.booking}`);
  }

  console.log(`[fix] ${fixed} corrected, ${left} left pending for review`);
  await mongoose.disconnect();
})();
