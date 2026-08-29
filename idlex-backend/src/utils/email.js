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
  const info = await getTransporter().sendMail({ from: env.smtp.from, to, subject, text, html });
  // Log every accepted send. Delivery still depends on the receiving side,
  // but this separates "we never sent it" from "they never received it".
  console.log(
    `[email] sent to ${to} (${subject}) messageId=${info.messageId} ` +
    `accepted=${(info.accepted || []).length} rejected=${(info.rejected || []).length}`
  );
  if ((info.rejected || []).length) {
    console.error(`[email] REJECTED recipients for ${subject}: ${info.rejected.join(', ')}`);
  }
  return info;
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

// Sent when a payment could not be confirmed. The point is the reference:
// without one, a renter chasing a missing payment has nothing to quote and
// support has nothing to search on.
async function sendPaymentIssueEmail({ to, trackingId, amount, itemTitle, reason }) {
  const subject = `IdleX payment reference ${trackingId}`;
  const text =
    `We could not confirm your payment for "${itemTitle}".\n\n` +
    `Tracking ID: ${trackingId}\n` +
    `Amount: Rs ${amount}\n\n` +
    `If money left your account it will be returned automatically, usually within ` +
    `5-7 working days. Nothing further is needed from you.\n\n` +
    `Before paying again, check My Rentals — if the booking is listed there the ` +
    `payment did go through.\n\n` +
    `Quote the tracking ID above if you contact support.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <div style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Idle<span style="color:#2563EB;">X</span></div>
      <p style="color: #374151; line-height: 1.6;">We could not confirm your payment for <strong>${itemTitle}</strong>.</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;">
        <p style="margin:0 0 6px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Tracking ID</p>
        <p style="margin:0;font-family:monospace;font-size:15px;font-weight:700;color:#111827;word-break:break-all;">${trackingId}</p>
        <p style="margin:12px 0 0;color:#6b7280;font-size:13px;">Amount: Rs ${amount}</p>
      </div>
      <p style="color: #374151; line-height: 1.6;">If money left your account it will be returned automatically, usually within 5-7 working days. Nothing further is needed from you.</p>
      <p style="color: #374151; line-height: 1.6;"><strong>Before paying again</strong>, check My Rentals — if the booking is listed there, the payment did go through.</p>
      <p style="color: #6b7280; font-size: 13px;">Quote the tracking ID if you contact support.${reason ? ` Reference: ${reason}` : ''}</p>
    </div>`;
  await sendEmail({ to, subject, text, html });
}

// Sent the moment an admin approves a verification. Without it the owner
// has no idea the review finished — they were told to wait and never told
// to stop, so they either give up or ask support.
async function sendKycApprovedEmail({ to, name }) {
  const subject = 'Your IdleX verification is approved';
  const text =
    `${name ? name + ',' : 'Hello,'}\n\n` +
    `Your IdleX verification has been approved. You can now list items, ` +
    `request rentals and receive payouts.\n\n` +
    `Open the app to get started.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <div style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Idle<span style="color:#6C4EF5;">X</span></div>
      <p style="color: #374151; line-height: 1.6;">${name ? name + ',' : 'Hello,'}</p>
      <p style="color: #374151; line-height: 1.6;">Your verification has been <strong style="color:#15803d;">approved</strong>. You can now list items, request rentals and receive payouts.</p>
      <p style="color: #6b7280; font-size: 13px;">Open the IdleX app to get started.</p>
    </div>`;
  try {
    await sendEmail({ to, subject, text, html });
    return true;
  } catch (err) {
    // An approval must not fail because the mail did. Log and move on.
    console.error(`[email] Failed to send KYC approval to ${to}:`, err.message);
    return false;
  }
}

// Sent when a verification is turned down, because "rejected" with no
// reason is not something a user can act on.
async function sendKycRejectedEmail({ to, name, reason }) {
  const subject = 'Your IdleX verification needs another look';
  const text =
    `${name ? name + ',' : 'Hello,'}\n\n` +
    `Your IdleX verification was not approved.\n\n` +
    `Reason: ${reason || 'Not specified'}\n\n` +
    `You can submit it again from the app.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <div style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Idle<span style="color:#6C4EF5;">X</span></div>
      <p style="color: #374151; line-height: 1.6;">${name ? name + ',' : 'Hello,'}</p>
      <p style="color: #374151; line-height: 1.6;">Your verification was not approved.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;margin:16px 0;color:#991b1b;">${reason || 'Not specified'}</div>
      <p style="color: #6b7280; font-size: 13px;">You can submit it again from the app.</p>
    </div>`;
  try {
    await sendEmail({ to, subject, text, html });
    return true;
  } catch (err) {
    console.error(`[email] Failed to send KYC rejection to ${to}:`, err.message);
    return false;
  }
}

// Sent when an admin confirms the money arrived. The renter has been waiting
// on a person to check a bank statement, so this is the first solid
// confirmation they get -- and it carries the reference they can quote if
// anything is ever disputed.
async function sendPaymentConfirmedEmail({
  to, name, bookingId, itemTitle, rentalAmount, securityDeposit, totalAmount, utr,
}) {
  const subject = `IdleX payment confirmed - booking ${bookingId}`;
  const text =
    `${name ? name + ',' : 'Hello,'}\n\n` +
    `Your payment has been verified and your booking is confirmed.\n\n` +
    `Item: ${itemTitle}\n` +
    `Booking ID: ${bookingId}\n` +
    `Transaction ID: ${utr}\n\n` +
    `Rental: Rs ${rentalAmount}\n` +
    `Refundable deposit: Rs ${securityDeposit}\n` +
    `Total paid: Rs ${totalAmount}\n\n` +
    `The deposit is held and returned after the item comes back undamaged.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <div style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Idle<span style="color:#6C4EF5;">X</span></div>
      <p style="color: #374151; line-height: 1.6;">${name ? name + ',' : 'Hello,'}</p>
      <p style="color: #374151; line-height: 1.6;">Your payment has been verified and your booking is <strong style="color:#15803d;">confirmed</strong>.</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;">
        <p style="margin:0 0 10px;font-weight:600;color:#111827;">${itemTitle}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">
          <tr><td style="padding:3px 0;">Rental</td><td align="right">Rs ${rentalAmount}</td></tr>
          <tr><td style="padding:3px 0;">Refundable deposit</td><td align="right">Rs ${securityDeposit}</td></tr>
          <tr><td style="padding:6px 0 0;border-top:1px solid #e5e7eb;font-weight:700;color:#111827;">Total paid</td><td align="right" style="padding:6px 0 0;border-top:1px solid #e5e7eb;font-weight:700;color:#111827;">Rs ${totalAmount}</td></tr>
        </table>
      </div>
      <p style="color:#6b7280;font-size:13px;">Booking ID: <span style="font-family:monospace;">${bookingId}</span><br/>Transaction ID: <span style="font-family:monospace;">${utr}</span></p>
      <p style="color:#6b7280;font-size:13px;">The deposit is held and returned after the item comes back undamaged.</p>
    </div>`;
  try {
    await sendEmail({ to, subject, text, html });
    return true;
  } catch (err) {
    // A confirmation that fails to send must not undo a verification that
    // has already confirmed the booking.
    console.error(`[email] Failed to send payment confirmation to ${to}:`, err.message);
    return false;
  }
}

module.exports = {
  sendEmail,
  sendPaymentConfirmedEmail,
  sendOtpEmail,
  sendPasswordResetEmail,
  sendPaymentIssueEmail,
  sendKycApprovedEmail,
  sendKycRejectedEmail,
};