const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null },
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },

    // Who has removed this thread from their own list.
    //
    // Deleting a conversation hides your copy; it does not destroy the other
    // person's. Their half of a conversation is their record of an agreement
    // about someone's property, and one party should not be able to erase it
    // for both. A new message clears the flag, so replying brings the thread
    // back rather than sending into something the recipient cannot see.
    hiddenFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Conversation', conversationSchema);
