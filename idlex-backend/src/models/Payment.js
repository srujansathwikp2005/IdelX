const mongoose = require('mongoose');

// Mirrors the gateway's own status enum rather than inventing one, per
// the Django doc's guidance — only gateway transaction refs are stored,
// never raw card data.
//
// Checkout happens BEFORE the booking exists (pay first, then the booking
// is created and the owner is notified), so the payment carries the
// checkout data needed to materialise the booking after capture:
// `listing`, `startDate`, `endDate` are populated at order creation and
// `booking` is set once the payment is captured.
const paymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null, index: true },
    payer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Checkout data — stored at order creation, consumed when the
    // payment is captured to create the booking.
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    // 'razorpay' stays in the enum so historical rows remain readable;
    // new payments are always cashfree.
    gateway: { type: String, enum: ['cashfree', 'razorpay', 'stripe'], default: 'cashfree' },
    gatewayOrderId: { type: String, required: true },
    gatewayPaymentId: { type: String, default: null },
    signature: { type: String, default: null },

    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },

    status: {
      type: String,
      enum: ['created', 'authorized', 'captured', 'failed', 'refunded'],
      default: 'created',
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);