const nodemailer = require('nodemailer');
const env = require('../config/env');

// Email delivery for OTPs and other transactional mail. Mirrors the SMS
// util's degrade-to-console behaviour: without an SMTP account configured
// (local dev / CI) the message is logged instead of sent, so flows never
// hard-fail just because credentials are missing.
let transporter;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  return transporter;
}

async function sendEmail({ to, subject, text, html }) {
  if (!env.smtp.host) {
    console.log(`[email] (dev) To: ${to}`);
    console.log(`[email] (dev) Subject: ${subject}`);
    console.log(`[email] (dev) Body: ${text}`);
    return;
  }
  await getTransporter().sendMail({ from: env.smtp.from, to, subject, text, html });
}

async function sendOtpEmail({ to, otp, purpose = 'email_verify' }) {
  const isListing = purpose === 'listing';
  const subject = isListing
    ? 'Verify your new listing on IdleX'
    : 'Your IdleX email verification code';
  const text =
    `Your IdleX verification code is ${otp}. ` +
    (isListing
      ? 'Enter it on the listing form to publish this item.'
      : 'Enter it to verify your email address.') +
    ' The code expires in 10 minutes.';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <div style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Idle<span style="color:#2563EB;">X</span></div>
      <p style="color: #374151; line-height: 1.6;">${isListing ? 'Confirm your listing' : 'Confirm your email address'} — use this one-time code:</p>
      <div style="font-size: 32px; letter-spacing: 8px; font-weight: 700; color: #2563EB; padding: 12px 0; text-align: center;">${otp}</div>
      <p style="color: #6b7280; font-size: 13px;">The code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>
    </div>`;
  try {
    await sendEmail({ to, subject, text, html });
    return true;
  } catch (err) {
    console.error(`[email] Failed to send OTP to ${to}:`, err.message);
    return false;
  }
}

// Password reset link. The token is single-use and expires in 30 minutes —
// the copy says so, because a user who opens the mail an hour later needs to
// know why the link failed rather than assuming the feature is broken.
async function sendPasswordResetEmail({ to, resetUrl }) {
  const subject = 'Reset your IdleX password';
  const text =
    `Someone asked to reset the password for your IdleX account.\n\n` +
    `Open this link to choose a new one:\n${resetUrl}\n\n` +
    `The link expires in 30 minutes and can be used once. ` +
    `If you did not request this, you can ignore this email — your password will not change.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <div style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Idle<span style="color:#2563EB;">X</span></div>
      <p style="color: #374151; line-height: 1.6;">Someone asked to reset the password for your IdleX account.</p>
      <p style="text-align: center; margin: 24px 0;">
        <a href="${resetUrl}" style="background:#2563EB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:600;">Choose a new password</a>
      </p>
      <p style="color: #6b7280; font-size: 13px; word-break: break-all;">Or paste this into your browser:<br/>${resetUrl}</p>
      <p style="color: #6b7280; font-size: 13px;">The link expires in 30 minutes and can be used once. If you did not request this, you can ignore this email — your password will not change.</p>
    </div>`;
  await sendEmail({ to, subject, text, html });
}

module.exports = { sendEmail, sendOtpEmail, sendPasswordResetEmail };