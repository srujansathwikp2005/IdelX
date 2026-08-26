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
    const admin = require('firebase-admin');
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const serviceAccount = require(credentialsPath);
    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    messaging = admin.messaging(app);
    console.log(`[push] FCM ready for project ${serviceAccount.project_id}`);
  } catch (err) {
    console.error('[push] Could not initialise FCM:', err.message);
    messaging = null;
  }
  return messaging;
}

// Sends to every device the user has signed in on. Tokens FCM reports as
// dead are deleted: a token that has been uninstalled stays invalid
// forever, and keeping it means every future send carries a known failure.
async function pushToUser(userId, { title, body, link }) {
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
      android: { priority: 'high', notification: { channelId: 'idlex_default' } },
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
