const crypto = require('crypto');
const env = require('../config/env');

// Short-lived signed links for files that must not be public.
//
// A plain protected route would be the obvious answer, but an <img> tag
// cannot send an Authorization header, and the admin review screen has to
// display a selfie next to a document. A signed query parameter is the one
// mechanism that works in an image tag, expires on its own, and cannot be
// forged without the server's secret.
//
// The signature covers the filename *and* the expiry, so neither can be
// changed without invalidating it.
const SECRET = process.env.FILE_SIGNING_SECRET || env.jwt.accessSecret;

// Ten minutes: long enough to open a review screen and study a document,
// short enough that a URL copied out of a log or a browser history is
// useless by the time anyone finds it.
const DEFAULT_TTL_MS = 10 * 60 * 1000;

function sign(filename, ttlMs = DEFAULT_TTL_MS) {
  const expires = Date.now() + ttlMs;
  const mac = crypto
    .createHmac('sha256', SECRET)
    .update(`${filename}:${expires}`)
    .digest('hex');
  return { expires, token: mac };
}

function verify(filename, expires, token) {
  const exp = Number(expires);
  if (!exp || !token) return false;
  if (Date.now() > exp) return false;

  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${filename}:${exp}`)
    .digest('hex');

  // Constant-time: a plain === leaks how much of the signature was right
  // through how long the comparison took.
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(String(token), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/// Builds the path a client should fetch a private KYC file from.
function signedKycUrl(storedValue) {
  if (!storedValue) return null;
  // Older records stored a public path; only the filename matters now.
  const filename = String(storedValue).split('/').pop();
  const { expires, token } = sign(filename);
  return `/api/kyc/file/${encodeURIComponent(filename)}?expires=${expires}&token=${token}`;
}

module.exports = { sign, verify, signedKycUrl };
