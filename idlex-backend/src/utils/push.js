const DeviceToken = require('../models/DeviceToken');
const env = require('../config/env');

// Push delivery through FCM. Mirrors the SMS and email utils: without
// credentials configured the send is logged and skipped, so no flow fails
// merely because push is not set up on this environment.
let messaging;
let initTried = false;

function getMessaging() {
  if (initTried) return messaging;
  initTried = true;

  const credentialsPath = env.push?.serviceAccountPath;
  if (!credentialsPath) {
    console.log('[push] FIREBASE_SERVICE_ACCOUNT unset — notifications will not be pushed');
    return null;
  }

  try {
    // The modular entry points, not the `admin.apps` / `admin.messaging()`
    // namespace: that namespace is undefined in current firebase-admin, and
    // reading .length off it threw before any credential was even parsed.
    const { getApps, initializeApp, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const serviceAccount = require(credentialsPath);
    const existing = getApps();
    const app = existing.length ? existing[0] : initializeApp({ credential: cert(serviceAccount) });
    messaging = getMessaging(app);
    console.log(`[push] FCM ready for project ${serviceAccount.project_id}`);
  } catch (err) {
    console.error('[push] Could not initialise FCM:', err.message);
    messaging = null;
  }
  return messaging;
}

// Which Android channel a notification is delivered on. Channels are how a
// user mutes one kind of notification without muting the rest, so a single
// catch-all would force them to choose between chat and booking alerts.
//
// The app registers these ids at startup; an id with no channel behind it
// falls back to whatever the manifest names, so an unmapped type is quiet
// rather than broken.
const CHANNELS = {
  message: 'messages',
  booking_request: 'bookings',
  booking_confirmed: 'bookings',
  booking_cancelled: 'bookings',
  extension_requested: 'bookings',
  return_requested: 'bookings',
  return_confirmed: 'bookings',
  payment_captured: 'payments',
};

function channelFor(type) {
  return CHANNELS[type] || 'general';
}

// Sends to every device the user has signed in on. Tokens FCM reports as
// dead are deleted: a token that has been uninstalled stays invalid
// forever, and keeping it means every future send carries a known failure.
async function pushToUser(userId, { title, body, link, type }) {
  const fcm = getMessaging();
  if (!fcm || !userId) return { sent: 0, skipped: true };

  const devices = await DeviceToken.find({ user: userId }).select('token');
  if (!devices.length) return { sent: 0 };

  const tokens = devices.map((d) => d.token);
  let response;
  try {
    response = await fcm.sendEachForMulticast({
      tokens,
      notification: { title, body: body || '' },
      // Data rides alongside so a tap can open the thing the notification is
      // about rather than just the app.
      data: link ? { link: String(link) } : {},
      android: {
        priority: 'high',
        notification: { channelId: channelFor(type) },
      },
    });
  } catch (err) {
    console.error('[push] send failed:', err.message);
    return { sent: 0, error: err.message };
  }

  const dead = [];
  response.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code || '';
    if (
      code.includes('registration-token-not-registered') ||
      code.includes('invalid-registration-token') ||
      code.includes('invalid-argument')
    ) {
      dead.push(tokens[i]);
    }
  });
  if (dead.length) {
    await DeviceToken.deleteMany({ token: { $in: dead } });
  }

  console.log(
    `[push] user=${userId} sent=${response.successCount} failed=${response.failureCount} pruned=${dead.length}`
  );
  return { sent: response.successCount, failed: response.failureCount };
}

module.exports = { pushToUser };
