const mongoose = require('mongoose');

// One row per device signed into an account. FCM tokens belong to an app
// install, not to a person: the same phone handed to someone else keeps its
// token, so sign-out deletes the row rather than leaving it pointing at the
// previous account.
//
// The token is unique on its own. A device that signs into a second account
// must move, not duplicate — otherwise it receives both accounts' pushes.
const deviceTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['android', 'ios', 'web'], default: 'android' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);
