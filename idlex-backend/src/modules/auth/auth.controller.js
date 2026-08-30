const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const authService = require('./auth.service');
const deletionService = require('./account-deletion.service');
const { verifyRefreshToken, signAccessToken } = require('../../utils/tokens');
const User = require('../../models/User');
const { logAudit } = require('../../utils/audit');

// Starts a signup. No account exists yet, so the 202 says "accepted, not
// finished" rather than 201 Created, which would be a lie the client would
// reasonably act on.
const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  logAudit({
    action: 'user.registration_started',
    category: 'auth',
    summary: 'Signup started, awaiting email verification',
    details: { email: result.email },
    req,
  });
  return new ApiResponse(202, result, 'Check your email for the six-digit code').send(res);
});

const resendRegistrationCode = asyncHandler(async (req, res) => {
  const result = await authService.resendRegistrationCode(req.body.email);
  return new ApiResponse(200, result, 'A new code is on its way').send(res);
});

// Where the account is actually created.
const verifyRegistration = asyncHandler(async (req, res) => {
  const result = await authService.verifyRegistration(req.body.email, req.body.code);
  logAudit({
    actor: result.user?._id,
    action: 'user.registered',
    category: 'auth',
    resourceType: 'user',
    resourceId: result.user?._id?.toString(),
    summary: 'New account created after email verification',
    details: { email: result.user?.email },
    req,
  });
  return new ApiResponse(201, result, 'Account created').send(res);
});

const login = asyncHandler(async (req, res) => {
  let result;
  try {
    result = await authService.login(req.body);
  } catch (err) {
    // Track failed sign-in attempts — useful for spotting brute-force patterns.
    logAudit({
      action: 'user.login_failed',
      category: 'auth',
      summary: 'Failed sign-in attempt',
      details: { email: req.body?.email },
      req,
    });
    throw err;
  }
  logAudit({
    actor: result.user?._id,
    action: 'user.login',
    category: 'auth',
    resourceType: 'user',
    resourceId: result.user?._id?.toString(),
    summary: 'Signed in',
    details: { email: result.user?.email, role: result.user?.role },
    req,
  });
  return new ApiResponse(200, result, 'Logged in successfully').send(res);
});

const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) throw ApiError.badRequest('refreshToken is required');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (err) {
    throw ApiError.unauthorized('Refresh token expired or invalid');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('User no longer exists');

  const accessToken = signAccessToken(user);
  return new ApiResponse(200, { accessToken }, 'Token refreshed').send(res);
});

const requestOtp = asyncHandler(async (req, res) => {
  await authService.requestOtp(req.body.phone);
  return new ApiResponse(200, null, 'OTP sent').send(res);
});

const verifyOtp = asyncHandler(async (req, res) => {
  const user = await authService.verifyOtp(req.body.phone, req.body.code);
  return new ApiResponse(200, user, 'Phone verified').send(res);
});

const requestPhoneOtp = asyncHandler(async (req, res) => {
  const result = await authService.requestPhoneOtp(req.body.phone, req.body.purpose);
  return new ApiResponse(200, result, 'OTP sent').send(res);
});

const verifyPhoneOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifyPhoneOtp(req.body.phone, req.body.code, req.body.purpose);
  return new ApiResponse(200, result, 'Phone verified').send(res);
});

const requestLoginOtp = asyncHandler(async (req, res) => {
  const result = await authService.requestLoginOtp(req.body.phone);
  return new ApiResponse(200, result, 'A sign-in code is on its way').send(res);
});

const loginWithPhoneOtp = asyncHandler(async (req, res) => {
  let result;
  try {
    result = await authService.loginWithPhoneOtp(req.body.phone, req.body.code);
  } catch (err) {
    logAudit({
      action: 'user.login_failed',
      category: 'auth',
      summary: 'Failed phone sign-in',
      details: { phone: req.body.phone, method: 'otp' },
      req,
    });
    throw err;
  }
  logAudit({
    actor: result.user?._id,
    action: 'user.logged_in',
    category: 'auth',
    resourceType: 'user',
    resourceId: result.user?._id?.toString(),
    summary: 'Signed in with a phone code',
    details: { method: 'otp' },
    req,
  });
  return new ApiResponse(200, result, 'Signed in').send(res);
});

const requestEmailOtp = asyncHandler(async (req, res) => {
  await authService.requestEmailOtp(req.body.email);
  return new ApiResponse(200, null, 'A sign-in code is on its way').send(res);
});

const verifyEmailOtp = asyncHandler(async (req, res) => {
  const user = await authService.verifyEmailOtp(req.body.email, req.body.code);
  return new ApiResponse(200, user, 'Email verified').send(res);
});

const requestPasswordReset = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body.email);
  return new ApiResponse(200, null, 'If that email exists, a reset link has been sent').send(res);
});

const confirmPasswordReset = asyncHandler(async (req, res) => {
  await authService.confirmPasswordReset(req.body.token, req.body.newPassword);
  return new ApiResponse(200, null, 'Password reset successfully').send(res);
});

const me = asyncHandler(async (req, res) => {
  return new ApiResponse(200, req.user.toSafeJSON(), 'Current user').send(res);
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateMe(req.user._id, req.body);
  return new ApiResponse(200, user, 'Profile updated').send(res);
});


// What would stop this account being deleted right now. Asked before the
// confirmation screen, so nobody types a password only to be refused.
const accountDeletionStatus = asyncHandler(async (req, res) => {
  const reasons = await deletionService.deletionBlockers(req.user._id);
  return new ApiResponse(200, { canDelete: reasons.length === 0, reasons }).send(res);
});

const deleteMyAccount = asyncHandler(async (req, res) => {
  const result = await deletionService.deleteAccount(req.user._id, req.body.password);
  logAudit({
    actor: req.user._id,
    action: 'account.deleted',
    category: 'auth',
    resourceType: 'User',
    resourceId: String(req.user._id),
    summary: 'Account deleted by its owner',
    req,
  });
  return new ApiResponse(200, result, 'Your account has been deleted').send(res);
});

module.exports = {
  register,
  resendRegistrationCode,
  verifyRegistration,
  login,
  refreshToken,
  requestOtp,
  verifyOtp,
  requestPhoneOtp,
  verifyPhoneOtp,
  requestLoginOtp,
  loginWithPhoneOtp,
  requestEmailOtp,
  verifyEmailOtp,
  requestPasswordReset,
  confirmPasswordReset,
  me,
  updateMe,
  accountDeletionStatus,
  deleteMyAccount,
};
