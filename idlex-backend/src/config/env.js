require('dotenv').config();

// Centralised, validated access to environment variables.
// Every other module reads config from here instead of calling
// process.env directly, so there's exactly one place that knows
// what variables exist and what their defaults are.
const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/idlex',

  jwt: {
    // Dev defaults only — set real secrets via .env in production.
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_9f8a7c6b5e4d3c2b1a',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_1a2b3c4d5e6f7a8b9c',
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },

  renflair: {
    // API key for the Renflair SMS/OTP gateway (sms.renflair.in). When unset
    // (local dev) the SMS util logs OTPs to the console so flows still work.
    apiKey: process.env.RENFLAIR_API_KEY,
  },

  smtp: {
    // Email delivery for OTPs. When SMTP_HOST is unset (local dev) the
    // email util falls back to logging the message so flows still work.
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'IdleX <no-reply@idlex.app>',
  },

  uploadDir: process.env.UPLOAD_DIR || 'uploads',

  storage: {
    // 's3' in production, 'disk' for local dev. Anything other than 's3'
    // keeps the original local-disk behaviour, so existing dev setups and
    // the test suite are unaffected by this being added.
    driver: (process.env.STORAGE_DRIVER || 'disk').toLowerCase(),
    get isS3() { return this.driver === 's3'; },
    bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION || 'eu-north-1',
    // Uploads are namespaced under a prefix so one bucket can host several
    // environments (idlex-dev/, idlex-prod/) without key collisions.
    prefix: process.env.S3_PREFIX || 'uploads',
    // Short TTL: long enough for a browser to follow the redirect and load
    // the image, short enough that a leaked url is worthless within minutes.
    signedUrlTtl: parseInt(process.env.S3_SIGNED_URL_TTL || '300', 10),
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    // Settlement/merchant bank account number used as the source account
    // for owner payouts (shown in Razorpay dashboard → Payouts). Unset in
    // dev/test mode — payouts then stay in 'pending' without calling the API.
    payoutAccountNumber: process.env.RAZORPAY_ACCOUNT_NUMBER,
  },

  admin: {
    // Default admin account — auto-seeded on server start (see utils/ensureDefaultAdmin.js).
    email: process.env.ADMIN_EMAIL || 'admin@gmail.com',
    password: process.env.ADMIN_PASSWORD || 'admin',
  },
};

module.exports = env;
