const mongoose = require('mongoose');

// In-app notifications delivered on user actions (bookings, approvals…).
// Kept deliberately simple — a bell icon reads the unread count, the
// notifications page lists recent items, and nothing is pushed over a
// socket (that would be a follow-up with Socket.IO, like chat.socket.js).
const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: {
      type: String,
      enum: ['booking_request', 'booking_confirmed', 'booking_cancelled', 'extension_requested', 'return_requested', 'return_confirmed', 'payment_captured', 'message', 'dispute', 'info'],
      default: 'info',
    },

    title: { type: String, required: true },
    body: { type: String, default: '' },

    // Client-side destination when the notification is tapped.
    link: { type: String, default: null },

    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Unread counts are a common hot query — cover it with an index.
notificationSchema.index({ recipient: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);