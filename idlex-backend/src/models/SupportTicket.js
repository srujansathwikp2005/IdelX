const mongoose = require('mongoose');

// One reply on a ticket, from either side. Kept as a subdocument rather than
// its own collection: a ticket is always read whole, and the thread is short.
const replySchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Denormalised so the admin list can show who answered without a second
    // populate, and so the record survives the author being deleted.
    isAdmin: { type: Boolean, default: false },
    message: { type: String, required: true, trim: true },
  },
  { timestamps: true, _id: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },

    // Deliberately three states, not a workflow. The brief asks for a simple
    // way to raise an issue and get an answer, not a helpdesk.
    status: {
      type: String,
      enum: ['open', 'answered', 'closed'],
      default: 'open',
      index: true,
    },

    replies: [replySchema],
  },
  { timestamps: true }
);

// The admin queue reads oldest-open-first; the user's list reads newest-first.
supportTicketSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
