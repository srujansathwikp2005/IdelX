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
      enum: ['damage', 'missing_item', 'late_return', 'other'],
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
