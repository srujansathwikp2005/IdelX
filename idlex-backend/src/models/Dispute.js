const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },

    // What went wrong. The deposit outcome differs by kind — late return is
    // usually a fee, a missing item is usually the whole deposit — so an
    // admin needs this before deciding, not buried in free text.
    category: {
      type: String,
      // The first three are an owner's claims against a return. The next two
      // are a renter's, and had nowhere to go before -- both landed on
      // 'other', which tells an admin nothing about what to look at.
      enum: ['damage', 'missing_item', 'late_return', 'not_as_described', 'not_received', 'other'],
      default: 'other',
    },

    // What the owner is asking to withhold. Advisory only: the admin decides
    // the actual deduction in resolveDispute.
    claimedAmount: { type: Number, default: 0 },

    // Photo urls supporting the claim. Box 11B calls for evidence from both
    // sides, so the renter can append here too when responding.
    evidence: [{ type: String }],
    status: {
      type: String,
      enum: ['open', 'under_review', 'resolved', 'rejected'],
      default: 'open',
      index: true,
    },
    resolutionNote: { type: String, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Dispute', disputeSchema);
