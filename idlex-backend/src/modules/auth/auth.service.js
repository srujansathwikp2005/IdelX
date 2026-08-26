const crypto = require('crypto');
const User = require('../../models/User');
const ApiError = require('../../utils/ApiError');
const { signAccessToken, signRefreshToken, signPhoneVerificationToken, verifyPhoneVerificationToken } = require('../../utils/tokens');
const { generateOtp, sendOtpSms, normalizePhone, issuePhoneOtp, verifyPhoneOtpRecord, issueEmailOtp, verifyEmailOtpRecord } = require('../../utils/otp');
const { sendPasswordResetEmail } = require('../../utils/email');
const env = require('../../config/env');

// Business logic lives here, controllers stay thin (parse req -> call
// service -> shape response) — mirrors keeping Django views thin and
// pushing logic into a services.py module.

async function register({ name, email, phone, password, phoneVerificationToken }) {
  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('Email already registered');

  let normalizedPhone;
  if (phone) {
    normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) throw ApiError.badRequest('Enter a valid 10-digit phone number');
    const phoneInUse = await User.findOne({ phone: normalizedPhone });
    if (phoneInUse) throw ApiError.conflict('Phone number already registered');
    if (!phoneVerificationToken) {
      throw ApiError.badRequest('Verify your phone number with an OTP before creating the account');
    }
    try {
      const payload = verifyPhoneVerificationToken(phoneVerificationToken);
      if (payload.phone !== normalizedPhone || payload.purpose !== 'signup') {
        throw new Error('mismatch');
      }
    } catch (err) {
      throw ApiError.badRequest('Phone verification is invalid or expired. Request a new OTP');
    }
  }

  const user = await User.create({ name, email, phone: normalizedPhone, password });
  if (normalizedPhone) {
    user.isPhoneVerified = true;
    await user.save();
  }

  // Send the verification code as part of registering. It used to wait for
  // the client to make a second call, so anyone whose app dropped between
  // the two ended up with an account that could never be verified — and a
  // failure here must not undo an account that already exists.
  try {
    await issueEmailOtp(user._id, user.email, 'email_verify');
  } catch (err) {
    console.error(`[auth] Could not send verification email to ${user.email}:`, err.message);
  }

  return issueTokens(user);
}

// Accepts either an email address or a phone number in `identifier`.
// `email` remains supported for older clients.
async function login({ identifier, email, password }) {
  const raw = String(identifier || email || '').trim();
  if (!raw) throw ApiError.badRequest('Enter your email address or phone number');

  // An "@" is the reliable discriminator: a phone number never contains one,
  // and this avoids guessing from length or leading digits.
  let query;
  if (raw.includes('@')) {
    query = { email: raw.toLowerCase() };
  } else {
    const phone = normalizePhone(raw);
    // A malformed number gets the same generic failure as a wrong password.
    // Saying "that isn't a valid number" would confirm which field was read
    // and help an attacker enumerate accounts.
    if (!phone) throw ApiError.unauthorized('Invalid credentials');
    query = { phone };
  }

  const user = await User.findOne(query).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid credentials');
  }
  if (!user.isActive) throw ApiError.forbidden('Account is suspended');
  return issueTokens(user);
}

function issueTokens(user) {
  return {
    user: user.toSafeJSON(),
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

// Issues a phone OTP for signup or profile phone-change verification.
// The number does not need an account yet — OTPs are stored separately.
async function requestPhoneOtp(phone, purpose) {
  const result = await issuePhoneOtp(phone, purpose);
  if (!result) throw ApiError.badRequest('Enter a valid 10-digit phone number');
  return result;
}

// Validates a phone OTP and returns a short-lived verification token the
// caller must present when registering or saving a new profile number.
async function verifyPhoneOtp(phone, code, purpose) {
  const result = await verifyPhoneOtpRecord(phone, code, purpose);
  if (!result.ok) {
    if (result.reason === 'not_found') throw ApiError.badRequest('No OTP requested for this number');
    if (result.reason === 'attempts') throw ApiError.badRequest('Too many incorrect attempts. Request a new OTP');
    throw ApiError.badRequest('OTP is invalid or expired');
  }
  return { verified: true, token: signPhoneVerificationToken(result.phone, purpose) };
}

// Passwordless sign-in. The request step is deliberately quiet about
// whether the number has an account: replying "no account" would turn this
// endpoint into a way to test which phone numbers are registered.
async function requestLoginOtp(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw ApiError.badRequest('Enter a valid 10-digit phone number');

  const user = await User.findOne({ phone: normalized });
  if (!user) return { phone: normalized };

  await issuePhoneOtp(normalized, 'login');
  return { phone: normalized };
}

async function loginWithPhoneOtp(phone, code) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw ApiError.unauthorized('Invalid code');

  const result = await verifyPhoneOtpRecord(normalized, code, 'login');
  if (!result.ok) {
    if (result.reason === 'attempts') {
      throw ApiError.badRequest('Too many incorrect attempts. Request a new code');
    }
    // 'not_found' is folded in with a wrong code on purpose — see above.
    throw ApiError.badRequest('The code is invalid or has expired');
  }

  const user = await User.findOne({ phone: normalized });
  if (!user) throw ApiError.unauthorized('Invalid code');

  // Signing in with a code proves the number, so record that.
  if (!user.isPhoneVerified) {
    user.isPhoneVerified = true;
    await user.save();
  }
  return issueTokens(user);
}

async function requestOtp(phone) {
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 50 * 60 * 1000); // 50 min

  await User.findOneAndUpdate(
    { phone },
    { $set: { otp: { code, expiresAt } } },
    { upsert: false }
  );

  await sendOtpSms(phone, code);
}

async function verifyOtp(phone, code) {
  const user = await User.findOne({ phone }).select('+otp.code +otp.expiresAt');
  if (!user || !user.otp || !user.otp.code) {
    throw ApiError.badRequest('No OTP requested for this number');
  }
  if (user.otp.code !== code || user.otp.expiresAt < new Date()) {
    throw ApiError.badRequest('OTP is invalid or expired');
  }
  user.isPhoneVerified = true;
  user.otp = undefined;
  await user.save();
  return user.toSafeJSON();
}

async function requestEmailOtp(email) {
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) return; // don't leak whether the email exists

  await issueEmailOtp(user._id, user.email, 'email_verify');
}

async function verifyEmailOtp(email, code) {
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+emailOtp.code +emailOtp.expiresAt +emailOtp.purpose');
  if (!user) throw ApiError.notFound('No account found with this email');

  const result = await verifyEmailOtpRecord(user._id, code, 'email_verify');
  if (!result.ok) {
    if (result.reason === 'no_request') throw ApiError.badRequest('No email verification code requested');
    throw ApiError.badRequest('OTP is invalid or expired');
  }

  user.isEmailVerified = true;
  await user.save();
  // Tokens, not just the user: proving the address is a sign-in, and the
  // clients read `accessToken`/`user` off this response. Returning the bare
  // user left them with nothing to store and nothing to show.
  return issueTokens(user);
}

async function requestPasswordReset(email) {
  const user = await User.findOne({ email });
  if (!user) return; // don't leak whether the email exists

  const token = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
  await user.save();

  const resetUrl = `${env.clientUrl}/reset-password?token=${token}`;

  try {
    await sendPasswordResetEmail({ to: user.email, resetUrl });
  } catch (err) {
    // Never fail the request because delivery failed: the response is
    // deliberately identical whether or not the address exists, and a 500
    // here would leak that it does. Log loudly so a broken mailer is
    // visible in the journal rather than silently swallowing resets.
    console.error(`[auth] Failed to send password reset email to ${email}:`, err.message);
  }

  // Without SMTP configured the mailer logs instead of sending, so surface
  // the link too — otherwise a local dev run has no way to complete a reset.
  if (!env.smtp.host) {
    console.log(`[auth] Password reset link for ${email}: ${resetUrl}`);
  }
}

async function confirmPasswordReset(token, newPassword) {
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpires');

  if (!user) throw ApiError.badRequest('Reset token is invalid or expired');

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
}

// Profile updates + renter->owner upgrade. `becomeOwner` is the only
// path that sets the owner role — registration never accepts it, so
// there is no privilege-escalation surface via register.
async function updateMe(userId, { name, phone, phoneVerificationToken, avatarUrl, becomeOwner }) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  if (name !== undefined) user.name = name;
  if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;

  // Changing the phone number requires OTP verification of the NEW
  // number first — `phoneVerificationToken` proves it was verified.
  if (phone !== undefined && phone !== user.phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) throw ApiError.badRequest('Enter a valid 10-digit phone number');
    const inUse = await User.findOne({ phone: normalized, _id: { $ne: userId } });
    if (inUse) throw ApiError.conflict('Phone number already in use by another account');
    if (!phoneVerificationToken) {
      throw ApiError.badRequest('Verify the new phone number with an OTP before saving');
    }
    try {
      const payload = verifyPhoneVerificationToken(phoneVerificationToken);
      if (payload.phone !== normalized || payload.purpose !== 'profile') {
        throw new Error('mismatch');
      }
    } catch (err) {
      throw ApiError.badRequest('Phone verification is invalid or expired. Request a new OTP');
    }
    user.phone = normalized;
    user.isPhoneVerified = true;
  }

  if (becomeOwner) {
    user.role = 'owner';
    user.isOwner = true;
  }

  await user.save();
  return user.toSafeJSON();
}

module.exports = {
  register,
  login,
  requestOtp,
  verifyOtp,
  requestPhoneOtp,
  verifyPhoneOtp,
  requestEmailOtp,
  verifyEmailOtp,
  requestLoginOtp,
  loginWithPhoneOtp,
  requestPasswordReset,
  confirmPasswordReset,
  updateMe,
};
