const Booking = require('../models/Booking');
const Listing = require('../models/Listing');
const { notify } = require('../modules/notifications/notifications.service');

// An unapproved request holds its dates — that is deliberate, so two renters
// cannot both pay for the same window. The cost is that an owner who ignores
// a request freezes their own calendar, and the renter waits on a booking
// that is never going to happen.
//
// So requests expire. Approved-but-unpaid bookings expire faster: the owner
// has committed at that point, and the item should not sit reserved for
// someone who has stopped responding.
const REQUEST_TTL_HOURS = 24;
const AWAITING_PAYMENT_TTL_HOURS = 12;

async function expireStaleBookings() {
  const now = Date.now();
  const requestCutoff = new Date(now - REQUEST_TTL_HOURS * 3600 * 1000);
  const paymentCutoff = new Date(now - AWAITING_PAYMENT_TTL_HOURS * 3600 * 1000);

  const stale = await Booking.find({
    $or: [
      { status: 'requested', createdAt: { $lt: requestCutoff } },
      { status: 'awaiting_payment', approvedAt: { $lt: paymentCutoff } },
    ],
  });

  for (const booking of stale) {
    const wasApproved = booking.status === 'awaiting_payment';
    booking.status = 'cancelled';
    booking.cancellationReason = wasApproved
      ? 'Payment was not completed in time'
      : 'The owner did not respond in time';
    await booking.save();

    const listing = await Listing.findById(booking.listing).select('title');
    const title = listing?.title || 'your rental';

    // Both sides are told, because both were waiting on the other.
    await notify(booking.renter, {
      type: 'booking_cancelled',
      title: 'Booking expired',
      body: wasApproved
        ? `Your approved booking for "${title}" expired because payment was not completed.`
        : `Your request for "${title}" expired because the owner did not respond.`,
      link: '/my-rentals',
    }).catch(() => {});

    await notify(booking.owner, {
      type: 'booking_cancelled',
      title: 'Booking expired',
      body: wasApproved
        ? `The renter did not pay for "${title}" in time. Those dates are free again.`
        : `A request for "${title}" expired unanswered. Those dates are free again.`,
      link: '/dashboard?view=bookings',
    }).catch(() => {});
  }

  if (stale.length) console.log(`[jobs] expired ${stale.length} stale booking(s)`);
  return stale.length;
}

// Hourly is frequent enough for a 12-hour deadline and cheap enough to run
// in-process. Runs once at boot so a restart does not skip a window.
function startExpiryJob() {
  const run = () => expireStaleBookings().catch((err) => console.error('[jobs] expiry failed:', err.message));
  run();
  const timer = setInterval(run, 3600 * 1000);
  // Do not hold the process open on shutdown.
  timer.unref?.();
  return timer;
}

module.exports = { expireStaleBookings, startExpiryJob, REQUEST_TTL_HOURS, AWAITING_PAYMENT_TTL_HOURS };
