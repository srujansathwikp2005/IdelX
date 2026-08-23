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

  // Payment gateway. Cashfree replaced Razorpay after Razorpay declined the
  // account: they classified the marketplace as vehicle rental, a category
  // they do not support.
  // How owner settlements and refunds actually move. 'manual' records the
  // obligation and leaves the transfer to a person, which is correct while
  // no automated provider is approved. See modules/settlement.
  settlement: {
    provider: (process.env.SETTLEMENT_PROVIDER || 'manual').toLowerCase(),
  },

  cashfree: {
    appId: process.env.CASHFREE_APP_ID,
    secretKey: process.env.CASHFREE_SECRET_KEY,
    // Cashfree PG signs webhooks with the secret key itself — there is no
    // separate webhook secret in the dashboard, unlike Razorpay. The
    // override exists only for a future setup that does issue one.
    get webhookSecret() {
      return process.env.CASHFREE_WEBHOOK_SECRET || this.secretKey;
    },
    // 'sandbox' or 'production'. The two use different hostnames, so this is
    // what decides whether test keys reach the test environment.
    mode: (process.env.CASHFREE_MODE || 'sandbox').toLowerCase(),
    get apiBase() {
      return this.mode === 'production'
        ? 'https://api.cashfree.com'
        : 'https://sandbox.cashfree.com';
    },
    // Pinned: Cashfree routes breaking changes through this header, so an
    // unpinned integration can break without a deploy.
    apiVersion: process.env.CASHFREE_API_VERSION || '2023-08-01',

    // Payouts is a separate Cashfree product with its own API version and,
    // on most accounts, its own credential pair issued from the Payouts
    // section of the dashboard. Both fall back to the Payments values, so
    // an account that shares one set keeps working untouched.
    payoutApiVersion: process.env.CASHFREE_PAYOUT_API_VERSION || '2024-01-01',
    get payoutAppId() {
      return process.env.CASHFREE_PAYOUT_APP_ID || this.appId;
    },
    get payoutSecretKey() {
      return process.env.CASHFREE_PAYOUT_SECRET_KEY || this.secretKey;
    },
  },

  admin: {
    // Auto-seeded on server start (see utils/ensureDefaultAdmin.js).
    //
    // Deliberately NO fallback values. A default that ships in source is a
    // published credential, and this account can read every user's KYC
    // documents and payment records. Unset means no admin is seeded, which
    // is a visible failure; a weak default is an invisible one.
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },
};

module.exports = env;
