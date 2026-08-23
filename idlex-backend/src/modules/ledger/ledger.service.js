const LedgerEntry = require('../../models/LedgerEntry');
const { logAudit } = require('../../utils/audit');

// Every write to the ledger goes through here, so the rules about what a
// valid movement looks like live in one place rather than being re-derived
// at each call site.

// Records one movement. Deliberately thin: callers say what happened, not
// how to store it.
async function record({
  booking,
  component,
  action,
  amount,
  from,
  to,
  counterparty = null,
  settlement = 'pending',
  provider = null,
  providerReference = null,
  note = null,
  dispute = null,
  actor = null,
  reverses = null,
}) {
  // A zero-amount movement is not an event. Recording it would pad the
  // ledger with rows that mean nothing and make a real one harder to find.
  if (!amount || amount <= 0) return null;

  const entry = await LedgerEntry.create({
    booking: booking._id || booking,
    component,
    action,
    amount: Math.round(amount * 100) / 100,
    from,
    to,
    counterparty,
    settlement,
    provider,
    providerReference,
    settledAt: settlement === 'settled' ? new Date() : null,
    note,
    dispute,
    actor,
    reverses,
  });

  logAudit({
    actor,
    action: `ledger.${component}.${action}`,
    category: 'payment',
    resourceType: 'booking',
    resourceId: String(booking._id || booking),
    summary: note || `${action} ${component}`,
    details: { amount: entry.amount, from, to, settlement },
  });

  return entry;
}

// What the ledger says about one booking.
//
// Balances are derived from the entries rather than stored, because a stored
// total and its entries drift apart the moment one write succeeds and the
// other does not — and then neither can be trusted.
async function summarize(bookingId) {
  const entries = await LedgerEntry.find({ booking: bookingId }).sort({ createdAt: 1 });

  const sum = (predicate) =>
    entries.filter(predicate).reduce((total, e) => total + e.amount, 0);

  const collected = sum((e) => e.action === 'hold' || e.action === 'charge');
  const rentalHeld = sum((e) => e.component === 'rental' && e.action === 'hold');
  const rentalReleased = sum((e) => e.component === 'rental' && e.action === 'release');
  const depositHeld = sum((e) => e.component === 'security_deposit' && e.action === 'hold');
  const depositRefunded = sum((e) => e.component === 'security_deposit' && e.action === 'refund');
  const damageDeducted = sum((e) => e.component === 'damage_deduction');
  const extensionCharged = sum((e) => e.component === 'extension_fee' && e.action !== 'reverse');
  const platformFee = sum((e) => e.component === 'platform_fee');

  return {
    entries,
    collected,
    platformFee,
    rental: {
      held: rentalHeld,
      released: rentalReleased,
      // What the owner is still owed for the rental itself.
      owed: Math.max(0, rentalHeld - rentalReleased),
    },
    deposit: {
      held: depositHeld,
      refunded: depositRefunded,
      deducted: damageDeducted,
      // What is left to give back. Damage deductions and unpaid extension
      // fees both come out of the deposit before the renter sees it.
      refundable: Math.max(0, depositHeld - depositRefunded - damageDeducted - extensionCharged),
    },
    extensionFees: extensionCharged,
    // Anything recorded but not yet actually paid out. This is the number
    // that matters while no payout provider is live: it says what the
    // platform owes, honestly, instead of pretending it has been sent.
    unsettled: entries
      .filter((e) => e.settlement === 'pending' && ['release', 'refund'].includes(e.action))
      .reduce((total, e) => total + e.amount, 0),
  };
}

// Everything owed across all bookings, grouped by who is owed it. This is
// what an admin settlement screen and any future payout run both read.
async function outstandingObligations() {
  return LedgerEntry.find({
    settlement: 'pending',
    action: { $in: ['release', 'refund'] },
  })
    .sort({ createdAt: 1 })
    .populate('counterparty', 'name email phone')
    .populate('booking', 'startDate endDate totalAmount status');
}

// Marks an obligation as actually paid. Called by whatever settles it — a
// gateway callback today, an admin recording a manual transfer meanwhile.
async function markSettled(entryId, { provider, providerReference, actor = null }) {
  const entry = await LedgerEntry.findById(entryId);
  if (!entry) throw new Error('Ledger entry not found');
  if (entry.settlement === 'settled') return entry;

  entry.settlement = 'settled';
  entry.provider = provider;
  entry.providerReference = providerReference;
  entry.settledAt = new Date();
  await entry.save();

  logAudit({
    actor,
    action: 'ledger.settled',
    category: 'payment',
    resourceType: 'booking',
    resourceId: String(entry.booking),
    summary: `Settled ${entry.component} of Rs ${entry.amount}`,
    details: { provider, providerReference, entry: String(entry._id) },
  });

  return entry;
}

module.exports = { record, summarize, outstandingObligations, markSettled };
