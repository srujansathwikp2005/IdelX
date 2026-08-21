const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

const env = require('./config/env');
const { errorMiddleware, notFoundMiddleware } = require('./middlewares/error.middleware');

const authRoutes = require('./modules/auth/auth.routes');
const kycRoutes = require('./modules/kyc/kyc.routes');
const listingsRoutes = require('./modules/listings/listings.routes');
const bookingsRoutes = require('./modules/bookings/bookings.routes');
const paymentsRoutes = require('./modules/payments/payments.routes');
const paymentsController = require('./modules/payments/payments.controller');
const chatRoutes = require('./modules/chat/chat.routes');
const reviewsRoutes = require('./modules/reviews/reviews.routes');
const reviewsController = require('./modules/reviews/reviews.controller');
const adminRoutes = require('./modules/admin/admin.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');
const statsRoutes = require('./modules/stats/stats.routes');
const wishlistRoutes = require('./modules/wishlist/wishlist.routes');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(cookieParser());

// Rate limiting for auth/OTP endpoints — equivalent of DRF's throttling classes.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
app.use('/api/auth', authLimiter);

// Webhook route needs the raw body for signature verification, so it's
// wired up BEFORE the global express.json() body parser.
app.post(
  '/api/webhooks/payments',
  express.raw({ type: '*/*' }),
  (req, res, next) => {
    req.rawBody = req.body;
    try {
      req.body = JSON.parse(req.body.toString('utf8'));
    } catch {
      req.body = {};
    }
    next();
  },
  paymentsController.handleWebhook
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve locally-uploaded files (KYC docs, listing photos) — swap for a
// cloud storage URL in production, same note as the Django doc's
// django-storages recommendation.
app.use('/uploads', express.static(path.join(process.cwd(), env.uploadDir)));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Route mounting — one module per feature, mirroring the Django doc's
// one-app-per-feature layout.
app.use('/api/auth', authRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/listings', listingsRoutes);
app.get('/api/listings/:id/reviews', reviewsController.listListingReviews); // nested under listings, per the doc
app.use('/api/bookings', bookingsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/wishlist', wishlistRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
