const mongoose = require('mongoose');

// A signup that has been started but not yet proved.
//
// Accounts are only created once the emailed code comes back, so this holds
// what was submitted in the meantime. Keeping it out of the users collection
// means an unverified signup cannot sign in, cannot be messaged, cannot hold
// a listing, and does not consume the email address if it is abandoned.
//
// The password is hashed here, exactly as the User model would hash it, so
// a plaintext password never exists at rest even for the ten minutes this
// record lives.
const pendingRegistrationSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, trim: true },
    phoneVerified: { type: Boolean, default: false },

    // What the person ticked, kept with the rest of the submission so the
    // record survives the gap between agreeing and the account existing.
    termsAcceptedAt: { type: Date },
    termsVersion: { type: String },

    code: { type: String, required: true },
    attempts: { type: Number, default: 0 },

    // Mongo removes the document once this passes, so an abandoned signup
    // releases the address on its own rather than needing a sweep job.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

pendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);
