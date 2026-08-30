const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const PendingRegistration = require('../../models/PendingRegistration');
const ApiError = require('../../utils/ApiError');
const { signAccessToken, signRefreshToken, signPhoneVerificationToken, verifyPhoneVerificationToken } = require('../../utils/tokens');
const { generateOtp, sendOtpSms, normalizePhone, issuePhoneOtp, verifyPhoneOtpRecord, issueEmailOtp, verifyEmailOtpRecord } = require('../../utils/otp');
const { sendPasswordResetEmail, sendOtpEmail } = require('../../utils/email');
const env = require('../../config/env');

// Business logic lives here, controllers stay thin (parse req -> call
// service -> shape response) — mirrors keeping Django views thin and
// pushing logic into a services.py module.

const REGISTRATION_TTL_MS = 10 * 60 * 1000;
const REGISTRATION_MAX_ATTEMPTS = 5;

// Starts a signup. Deliberately does not create the account: an address
// nobody has proved they can read is not an identity, and an account that
// exists before the proof can sign in, be messaged and hold listings while
// still being unreachable. What was submitted waits in PendingRegistration
// until the emailed code comes back.
async function register({ name, email, phone, password, phoneVerificationToken }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw ApiError.conflict('Email already registered');

  // A number is required now. Owners and renters have to be able to reach
  // each other when a handover or a dispute needs sorting out, and support
  // had no way to contact most accounts because the field was optional and
  // almost nobody filled it in.
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) throw ApiError.badRequest('Enter a valid 10-digit phone number');
  const phoneInUse = await User.findOne({ phone: normalizedPhone });
  if (phoneInUse) throw ApiError.conflict('Phone number already registered');

  // An SMS OTP proves the number belongs to whoever is signing up, but it is
  // not demanded here: the address is already proved by the emailed code, and
  // making signup depend on a second delivery channel would shut the door on
  // everyone the SMS gateway cannot reach. Supplying a token is still
  // honoured, and is what marks the number verified.
  let phoneVerified = false;
  if (phoneVerificationToken) {
    try {
      const payload = verifyPhoneVerificationToken(phoneVerificationToken);
      if (payload.phone !== normalizedPhone || payload.purpose !== 'signup') {
        throw new Error('mismatch');
      }
      phoneVerified = true;
    } catch (err) {
      throw ApiError.badRequest('Phone verification is invalid or expired. Request a new OTP');
    }
  }

  const code = generateOtp();

  // Hashed with the same cost the User model uses, so the plaintext never
  // exists at rest even for the ten minutes this record lives.
  const hashed = await bcrypt.hash(password, 10);

  // Upserted rather than inserted: starting the signup again — a typo, a
  // lost email, a second tab — should replace the attempt, not collide with
  // it on the unique index.
  await PendingRegistration.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        name,
        password: hashed,
        phone: normalizedPhone,
        phoneVerified,
        code,
        attempts: 0,
        expiresAt: new Date(Date.now() + REGISTRATION_TTL_MS),
      },
    },
    { upsert: true, new: true }
  );

  // If the code cannot be sent there is nothing to verify against, so unlike
  // the old flow this failure is reported rather than swallowed — the account
  // does not exist yet, so there is nothing to leave half-made.
  const sent = await sendOtpEmail({ to: normalizedEmail, otp: code, purpose: 'email_verify' });
  if (!sent) {
    await PendingRegistration.deleteOne({ email: normalizedEmail });
    throw new ApiError(502, 'We could not send the verification email. Check the address and try again.');
  }

  return { pending: true, email: normalizedEmail };
}

// Re-sends the code for a signup already in progress, extending its window.
async function resendRegistrationCode(email) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const pending = await PendingRegistration.findOne({ email: normalizedEmail });
  if (!pending) {
    throw ApiError.badRequest('That signup has expired. Start again.');
  }

  const code = generateOtp();
  pending.code = code;
  pending.attempts = 0;
  pending.expiresAt = new Date(Date.now() + REGISTRATION_TTL_MS);
  await pending.save();

  const sent = await sendOtpEmail({ to: normalizedEmail, otp: code, purpose: 'email_verify' });
  if (!sent) throw new ApiError(502, 'We could not send the verification email. Try again shortly.');

  return { pending: true, email: normalizedEmail };
}

// Completes a signup. This is where the account comes into existence, and
// it is created already verified — there is no other way in.
async function verifyRegistration(email, code) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const pending = await PendingRegistration.findOne({ email: normalizedEmail });
  if (!pending) throw ApiError.badRequest('That signup has expired. Start again.');

  if (pending.attempts >= REGISTRATION_MAX_ATTEMPTS) {
    await PendingRegistration.deleteOne({ _id: pending._id });
    throw ApiError.badRequest('Too many incorrect attempts. Start again.');
  }

  if (pending.code !== String(code).trim()) {
    pending.attempts += 1;
    await pending.save();
    throw ApiError.badRequest('The code is invalid or has expired');
  }

  // The window can close between the lookup and here.
  if (pending.expiresAt < new Date()) {
    await PendingRegistration.deleteOne({ _id: pending._id });
    throw ApiError.badRequest('That code has expired. Start again.');
  }

  // Re-checked at the moment of creation: someone else may have taken the
  // address or number during the ten minutes this signup was open.
  if (await User.findOne({ email: normalizedEmail })) {
    await PendingRegistration.deleteOne({ _id: pending._id });
    throw ApiError.conflict('Email already registered');
  }
  if (pending.phone && (await User.findOne({ phone: pending.phone }))) {
    throw ApiError.conflict('Phone number already registered');
  }

  const user = new User({
    name: pending.name,
    email: normalizedEmail,
    phone: pending.phone,
    password: pending.password,
    isEmailVerified: true,
    isPhoneVerified: Boolean(pending.phoneVerified),
  });
  // Tells the model's pre-save hook the digest is already final; hashing it
  // again would store a hash of a hash and no password would ever match.
  user.$locals.passwordAlreadyHashed = true;
  await user.save();

  await PendingRegistration.deleteOne({ _id: pending._id });

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
  // Checked before isActive, because a deleted account is also inactive and
  // "suspended" would be both wrong and alarming.
  if (user.deletedAt) throw ApiError.forbidden('This account has been deleted');
  if (!user.isActive) throw ApiError.forbidden('Account is suspended');

  // Belt and braces. New accounts are only created once verified, so this
  // should never fire — but nothing else in the app checks, and an account
  // that reached the database unverified by any route must not sign in.
  if (!user.isEmailVerified) {
    throw ApiError.forbidden(
      'Confirm your email address before signing in. Check your inbox for the code.',
      { email: user.email },
      'email_unverified'
    );
  }

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

// Passwordless sign-in. Like the email route above, this reports a number
// with no account rather than accepting it silently: a user staring at a
// code field for a code that was never sent has no way to work out why.
async function requestLoginOtp(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw ApiError.badRequest('Enter a valid 10-digit phone number');

  const user = await User.findOne({ phone: normalized });
  if (!user) throw ApiError.notFound('No account found with that mobile number');

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

// A sign-in code only goes to an address that has an account behind it.
//
// This used to answer 200 for any address, so nothing could be learned about
// who is registered — but the client then told the user "we sent a code to
// fkkgf@gmail.com" when nothing had been sent, and they waited for an email
// that was never coming. Saying so does allow an address to be tested for an
// account; that is the deliberate trade, and it matches what sign-in already
// reveals through a password attempt.
async function requestEmailOtp(email) {
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) throw ApiError.notFound('No account found with that email address');

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
  resendRegistrationCode,
  verifyRegistration,
  requestPasswordReset,
  confirmPasswordReset,
  updateMe,
};
