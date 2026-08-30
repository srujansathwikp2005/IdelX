const express = require('express');
const controller = require('./auth.controller');
const validate = require('../../middlewares/validate.middleware');
const { protect } = require('../../middlewares/auth.middleware');
const {
  registerSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  phoneOtpRequestSchema,
  phoneOtpVerifySchema,
  registerVerifySchema,
  registerResendSchema,
  phoneLoginRequestSchema,
  phoneLoginVerifySchema,
  emailOtpRequestSchema,
  emailOtpVerifySchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  updateMeSchema,
  deleteAccountSchema,
} = require('./auth.validation');

const router = express.Router();

router.post('/register', validate(registerSchema), controller.register);
router.post('/register/verify', validate(registerVerifySchema), controller.verifyRegistration);
router.post('/register/resend', validate(registerResendSchema), controller.resendRegistrationCode);
router.post('/login', validate(loginSchema), controller.login);
router.post('/token/refresh', controller.refreshToken);
router.post('/otp/request', validate(otpRequestSchema), controller.requestOtp);
router.post('/otp/verify', validate(otpVerifySchema), controller.verifyOtp);
router.post('/phone-otp/request', validate(phoneOtpRequestSchema), controller.requestPhoneOtp);
router.post('/phone-otp/verify', validate(phoneOtpVerifySchema), controller.verifyPhoneOtp);
router.post('/phone-login/request', validate(phoneLoginRequestSchema), controller.requestLoginOtp);
router.post('/phone-login/verify', validate(phoneLoginVerifySchema), controller.loginWithPhoneOtp);
router.post('/email-otp/request', validate(emailOtpRequestSchema), controller.requestEmailOtp);
router.post('/email-otp/verify', validate(emailOtpVerifySchema), controller.verifyEmailOtp);
router.post('/password/reset', validate(passwordResetRequestSchema), controller.requestPasswordReset);
router.post('/password/reset/confirm', validate(passwordResetConfirmSchema), controller.confirmPasswordReset);
router.get('/me', protect, controller.me);
router.patch('/me', protect, validate(updateMeSchema), controller.updateMe);

router.get('/me/deletion', protect, controller.accountDeletionStatus);
// POST rather than DELETE: this one carries a body, and a request body on a
// DELETE is the kind of thing an intermediary is allowed to drop.
router.post('/me/delete', protect, validate(deleteAccountSchema), controller.deleteMyAccount);

module.exports = router;
