const mongoose = require('mongoose');

// A payment the renter made by UPI, outside the platform, that an admin has
// to confirm actually arrived.
//
// Kept apart from the Payment model rather than folded into it. That model is
// shaped around a gateway -- it requires a gatewayOrderId and carries a
// signature to verify -- and none of that exists here. Two models also mean
// the gateway can come back later without unpicking this one, which is the
// point of the prototype.
const manualPaymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    payer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },

    // Copied from the booking when the record is written, never taken from
    // the client. What the renter says they paid is a claim; what the booking
    // says it costs is the fact an admin checks against.
    rentalAmount: { type: Number, required: true },
    platformFee: { type: Number, required: true },
    securityDeposit: { type: Number, required: true },
    totalAmount: { type: Number, required: true },

    // The reference from the renter's own bank or UPI app. Unique across the
    // collection: the same transaction cannot pay for two bookings, and the
    // constraint lives here rather than in a handler so a race between two
    // simultaneous submissions still cannot get past it.
    utr: { type: String, required: true, unique: true, trim: true, uppercase: true },

    status: {
      type: String,
      // No 'pending' before submission -- a record only exists once a UTR has
      // been given, so verification_pending is the first state there is.
      enum: ['verification_pending', 'verified', 'rejected'],
      default: 'verification_pending',
      index: true,
    },

    rejectionReason: { type: String, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Submissions are reviewed oldest first, so the admin queue reads in the
// order people paid.
manualPaymentSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('ManualPayment', manualPaymentSchema);
