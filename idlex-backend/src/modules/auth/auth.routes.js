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
  phoneLoginRequestSchema,
  phoneLoginVerifySchema,
  emailOtpRequestSchema,
  emailOtpVerifySchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  updateMeSchema,
} = require('./auth.validation');

const router = express.Router();

router.post('/register', validate(registerSchema), controller.register);
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

module.exports = router;
