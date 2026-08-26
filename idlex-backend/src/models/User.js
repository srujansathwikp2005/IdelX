const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Single user collection for Owner/Renter/Admin — matches the Django doc's
// choice not to split into separate tables. `role` plus boolean flags gate
// behaviour; admin is just role: 'admin'.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, select: false },

    role: {
      type: String,
      enum: ['renter', 'owner', 'admin'],
      default: 'renter',
    },
    // A user can act as both owner and renter without a role switch;
    // `role` covers admin vs regular, these flags cover the dual capability.
    isOwner: { type: Boolean, default: false },
    isRenter: { type: Boolean, default: true },

    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }, // false = suspended by admin

    // When this account was last seen doing anything. Written on socket
    // connect and disconnect, and by the API on authenticated requests, so it
    // stays roughly true whether or not the app holds a socket open.
    lastSeenAt: { type: Date, default: null },

    avatarUrl: { type: String, default: null },

    // Listings a user has saved to come back to later.
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: [] }],

    otp: {
      code: { type: String, select: false },
      expiresAt: { type: Date, select: false },
    },

    // Email OTP — shared by account verification and per-listing
    // verification; `purpose` distinguishes the two flows.
    emailOtp: {
      code: { type: String, select: false },
      expiresAt: { type: Date, select: false },
      purpose: { type: String, enum: ['email_verify', 'listing'], select: false },
    },

    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  // Signup completion carries a password already hashed to the same cost,
  // because it was hashed when the pending registration was written rather
  // than kept in plaintext for ten minutes. Hashing it again would produce a
  // digest of a digest, and the password would never match.
  if (this.$locals.passwordAlreadyHashed) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.otp;
  delete obj.emailOtp;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);