const env = require('../config/env');

// SMS OTP delivery via Renflair's gateway (sms.renflair.in). The provider
// exposes a simple GET endpoint — no SDK required — and renders the OTP
// using its own approved template. Phone numbers are expected in plain
// 10-digit form (e.g. 9000000000), so the E.164 "+91" prefix is stripped
// before calling.

const RENFLAIR_OTP_URL = 'https://sms.renflair.in/V1.php';

function toLocalNumber(phone) {
  if (!phone || typeof phone !== 'string') return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.length !== 10) return null;
  return digits;
}

// Sends an SMS OTP via Renflair. Never throws — on any provider problem the
// code is logged to the console so the flow still works in development.
async function sendOtpSms(phone, otp) {
  const number = toLocalNumber(phone);
  if (!number) {
    console.error(`[sms] Invalid phone number "${phone}". Logging OTP instead.`);
    console.log(`[otp] (dev) OTP for ${phone}: ${otp}`);
    return;
  }
  if (!env.renflair.apiKey) {
    console.log(`[otp] (dev) RENFLAIR_API_KEY not set. Logging OTP for ${phone}: ${otp}`);
    return;
  }
  const url = `${RENFLAIR_OTP_URL}?API=${encodeURIComponent(env.renflair.apiKey)}&PHONE=${number}&OTP=${otp}`;
  try {
    const resp = await fetch(url, { method: 'GET' });
    const text = await resp.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    const ok =
      resp.ok &&
      (data === null || data.error === undefined || data.error === false || data.status === 'success');
    if (!ok) {
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.error(`[sms] Renflair send failed (${err.message}). Logging OTP instead.`);
    console.log(`[otp] (dev) OTP for ${phone}: ${otp}`);
  }
}

module.exports = { sendOtpSms, toLocalNumber };