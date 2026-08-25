const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const LedgerEntry = require('../../models/LedgerEntry');
const Booking = require('../../models/Booking');

// What an owner has earned, and what is still owed to them.
//
// Every figure is derived from the ledger rather than stored on the user.
// A stored balance and the entries behind it drift apart the moment one
// write succeeds and the other does not, and then neither can be trusted —
// which for money is the whole problem.
const getEarnings = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const entries = await LedgerEntry.find({
    counterparty: userId,
    to: 'owner',
  }).lean();

  const sum = (list) => list.reduce((total, e) => total + e.amount, 0);

  // Paid means the money actually left the platform. Everything else is a
  // promise, and showing the two as one number is how someone comes to
  // believe they have been paid when they have not.
  const settled = entries.filter((e) => e.settlement === 'settled');
  const pending = entries.filter((e) => e.settlement === 'pending');

  const bookingIds = [...new Set(entries.map((e) => String(e.booking)))];
  const completed = await Booking.countDocuments({
    owner: userId,
    status: 'completed',
  });

  return new ApiResponse(
    200,
    {
      // Lifetime, and what is owed right now.
      totalEarned: sum(settled),
      pendingPayout: sum(pending),

      // The split, because rent and a damage award are different things
      // and an owner reading a single figure cannot tell which they got.
      rentEarned: sum(settled.filter((e) => e.component === 'rental')),
      damageAwarded: sum(settled.filter((e) => e.component === 'damage_deduction')),

      completedRentals: completed,
      rentalsWithEarnings: bookingIds.length,

      // Named so a client does not have to guess why a figure is zero.
      payoutsEnabled: pending.length === 0 || settled.length > 0,
    },
    'Earnings'
  ).send(res);
});

// The individual movements, newest first, for the detail screen.
const getEarningsHistory = asyncHandler(async (req, res) => {
  const entries = await LedgerEntry.find({
    counterparty: req.user._id,
    to: 'owner',
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('booking', 'startDate endDate')
    .lean();

  const items = await Promise.all(
    entries.map(async (entry) => {
      const booking = entry.booking
        ? await Booking.findById(entry.booking._id || entry.booking)
            .populate('listing', 'title')
            .select('listing')
            .lean()
        : null;
      return {
        _id: entry._id,
        component: entry.component,
        amount: entry.amount,
        settlement: entry.settlement,
        settledAt: entry.settledAt,
        createdAt: entry.createdAt,
        note: entry.note,
        listingTitle: booking?.listing?.title || null,
      };
    })
  );

  return new ApiResponse(200, items, 'Earnings history').send(res);
});

module.exports = { getEarnings, getEarningsHistory };
