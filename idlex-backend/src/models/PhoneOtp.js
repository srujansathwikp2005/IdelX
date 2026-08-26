const mongoose = require('mongoose');

// Phone OTPs live in their own collection (not on the User doc) so a
// number can be verified *before* an account exists (signup) and before
// a profile update commits a new number. `purpose` keeps the signup and
// profile-change flows from consuming each other's codes.
const phoneOtpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, trim: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    purpose: { type: String, enum: ['signup', 'profile', 'login'], required: true },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

phoneOtpSchema.index({ phone: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.model('PhoneOtp', phoneOtpSchema);