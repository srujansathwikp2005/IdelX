const { z } = require('zod');

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(7),
  password: z.string().min(8),
  // Required when a phone is provided — proves the number was OTP-verified.
  phoneVerificationToken: z.string().optional(),
});

// Login accepts an email address OR a phone number in one field. `email`
// is still accepted so that any client not yet updated keeps working.
const loginSchema = z
  .object({
    identifier: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    password: z.string().min(1),
  })
  .refine((data) => Boolean(data.identifier || data.email), {
    message: 'Enter your email address or phone number',
    path: ['identifier'],
  });

const otpRequestSchema = z.object({
  phone: z.string().min(7),
});

const otpVerifySchema = z.object({
  phone: z.string().min(7),
  code: z.string().length(6),
});

const phoneOtpRequestSchema = z.object({
  phone: z.string().min(7),
  purpose: z.enum(['signup', 'profile']),
});

const registerVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

const registerResendSchema = z.object({
  email: z.string().email(),
});

const phoneLoginRequestSchema = z.object({
  phone: z.string().min(7),
});

const phoneLoginVerifySchema = z.object({
  phone: z.string().min(7),
  code: z.string().length(6),
});

const phoneOtpVerifySchema = z.object({
  phone: z.string().min(7),
  code: z.string().length(6),
  purpose: z.enum(['signup', 'profile']),
});

const emailOtpRequestSchema = z.object({
  email: z.string().email(),
});

const emailOtpVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

const passwordResetConfirmSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

// Profile update — `becomeOwner` flips the renter->owner dual-capability
// flag (role + isOwner), the documented way a renter starts listing.
const updateMeSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(7).optional(),
  // Required when `phone` differs from the user's current number.
  phoneVerificationToken: z.string().optional(),
  avatarUrl: z.string().optional(),
  becomeOwner: z.boolean().optional(),
});

module.exports = {
  registerSchema,
  registerVerifySchema,
  registerResendSchema,
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
};
