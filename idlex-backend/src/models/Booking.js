const mongoose = require('mongoose');

const extensionRequestSchema = new mongoose.Schema(
  {
    requestedNewEndDate: { type: Date, required: true },
    reason: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    requestedAt: { type: Date, default: Date.now },
    respondedAt: Date,
  },
  { _id: true }
);

const bookingSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
    renter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    status: {
      type: String,
      // 'awaiting_payment' sits between the owner approving and the renter
      // paying. Money is only taken once the owner has agreed to hand the
      // item over, so a renter is never charged for a request that is then
      // declined.
      enum: [
        'requested',
        'awaiting_payment',
        'confirmed',
        'active',
        'return_requested',
        'completed',
        'cancelled',
        'disputed',
      ],
      default: 'requested',
      index: true,
    },

    pricePerDay: { type: Number, required: true },
    totalDays: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    serviceFee: { type: Number, required: true },
    securityDeposit: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },

    // Escrow ledger. The renter pays subtotal + serviceFee + securityDeposit
    // up front, but only the platform fee is ours on day one. The other two
    // are held and released on separate events, so each needs its own state
    // rather than being inferred from booking.status.
    // Where the renter wants the item. Entered at request time the way a food
    // delivery address is: typed, or dropped on a map. Coordinates are
    // optional because a typed address is a valid answer on its own.
    deliveryAddress: {
      label: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      lat: Number,
      lng: Number,
      // Free text for "ring the second bell", which is the part couriers
      // actually rely on.
      instructions: String,
    },

    // Set when the owner approves. An unapproved request should not hold
    // someone's dates forever, so a sweep cancels stale ones.
    approvedAt: Date,

    // When the approved-but-unpaid booking lapses. Stored rather than derived
    // from approvedAt so the renter can be shown the actual deadline, and so
    // changing the window later does not silently move the deadline for
    // bookings that were approved under the old one.
    paymentDueAt: Date,

    escrow: {
      // Rent: held from capture until the rental actually starts.
      rentStatus: {
        type: String,
        enum: ['held', 'released', 'refunded'],
        default: 'held',
      },
      rentReleasedAt: Date,

      // Deposit: held for the whole rental, returned after the owner
      // confirms the item came back in good order.
      depositStatus: {
        type: String,
        enum: ['held', 'refunded', 'partially_deducted', 'forfeited'],
        default: 'held',
      },
      depositRefundedAt: Date,
      // How much of the deposit was withheld after a dispute. Zero means the
      // renter got all of it back.
      depositDeducted: { type: Number, default: 0 },
      depositDeductionReason: { type: String, default: null },
    },

    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancellationReason: { type: String, default: null },

    extensionRequests: [extensionRequestSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
