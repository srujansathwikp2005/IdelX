const mongoose = require('mongoose');

// One document, holding the settings an admin can change without a deploy.
//
// Everything here started life as an environment variable, which meant that
// changing the account renters pay into needed a release and someone with
// shell access. The env values are still read as the fallback, so a fresh
// install behaves exactly as it did before anyone opens this screen.
const platformSettingsSchema = new mongoose.Schema(
  {
    // Pinned so there can only ever be one of these.
    key: { type: String, default: 'platform', unique: true, immutable: true },

    manualPayment: {
      // The VPA renters send money to, e.g. "idlex@ybl".
      upiId: { type: String, default: null, trim: true },

      // Shown next to the amount in the payer's UPI app.
      payeeName: { type: String, default: null, trim: true },

      // Whether the app may hand the payment straight to a UPI app.
      //
      // Off by default, and deliberately so: UPI only allows a third-party
      // app to start a payment when the payee is a registered merchant. Point
      // an intent at a personal VPA and PhonePe answers "declined for
      // security reasons", which reads to the renter as a broken app. Scanning
      // the QR or pasting the ID works either way, so those stay the offered
      // route until someone here confirms this is a merchant account.
      supportsIntent: { type: Boolean, default: false },

      // Free text shown under the payment instructions, for anything the
      // account needs said about it ("payments verified within 2 hours").
      note: { type: String, default: null, trim: true },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
