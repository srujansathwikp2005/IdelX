const mongoose = require('mongoose');

// One row per movement of money, append-only.
//
// The booking already carries subtotal, serviceFee and securityDeposit, but
// those are a quote — what was agreed at request time. They cannot answer
// "how much of this deposit has been paid back, to whom, and when", which is
// exactly what a damage claim or a chargeback turns on. This can.
//
// Entries are never edited or deleted. A correction is another entry in the
// other direction, so the history of what was decided survives the decision
// being reversed.

const ledgerEntrySchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },

    // What this money IS. Kept separate rather than collapsed into a single
    // "amount" so the deposit is never mistaken for owner earnings — the
    // client's instruction, and the thing that makes the provider swappable.
    component: {
      type: String,
      enum: ['rental', 'platform_fee', 'security_deposit', 'damage_deduction', 'extension_fee', 'refund'],
      required: true,
      index: true,
    },

    // What HAPPENED to it. 'hold' means collected and owed to someone;
    // 'release' and 'refund' discharge that obligation.
    action: {
      type: String,
      enum: ['hold', 'release', 'refund', 'deduct', 'charge', 'reverse'],
      required: true,
    },

    // Always positive. Direction lives in `action`, so a negative amount can
    // never sneak in and quietly flip a balance.
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    // Who the money moved between. 'platform' is us; the others are users.
    from: { type: String, enum: ['renter', 'owner', 'platform', 'gateway'], required: true },
    to: { type: String, enum: ['renter', 'owner', 'platform', 'gateway'], required: true },

    // Populated when a real user is on either end, so a payout run can find
    // the recipient without walking back to the booking.
    counterparty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // How this was actually settled. 'pending' is the honest state while no
    // payout provider is configured: the obligation is recorded and visible,
    // rather than being marked paid because a gateway call was skipped.
    settlement: {
      type: String,
      enum: ['pending', 'settled', 'failed', 'not_required'],
      default: 'pending',
      index: true,
    },

    // Whichever provider handled it, named rather than assumed, so the
    // ledger reads correctly after the provider changes.
    provider: { type: String, default: null },
    providerReference: { type: String, default: null },
    settledAt: Date,
    failureReason: { type: String, default: null },

    // Why this entry exists, in words, for whoever reads the ledger during a
    // dispute months later.
    note: { type: String, default: null },

    // Links back to the decision that caused it — a dispute resolution, an
    // extension request, an admin action.
    dispute: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispute', default: null },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Set when an entry supersedes another, so a reversal points at what it
    // reversed instead of the pair having to be inferred by eye.
    reverses: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry', default: null },
  },
  { timestamps: true }
);

// The common read is "everything for this booking, oldest first".
ledgerEntrySchema.index({ booking: 1, createdAt: 1 });

// And "everything still owed to someone", which is what a settlement run and
// the admin payout screen both ask for.
ledgerEntrySchema.index({ settlement: 1, component: 1 });

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
