const Notification = require('../../models/Notification');
const { pushToUser } = require('../../utils/push');

// Single entry point for creating notifications — called from other
// modules (bookings, etc.) whenever a user-triggered event needs to
// reach the other party.
async function notify(recipientId, { type = 'info', title, body = '', link = null }) {
  if (!recipientId) return null;
  const notification = await Notification.create({ recipient: recipientId, type, title, body, link });

  // Pushed after the record is written, and never allowed to fail the
  // caller: a booking must not roll back because a phone was unreachable.
  // The notification is already in the app either way.
  pushToUser(recipientId, { title, body, link, type }).catch((err) =>
    console.error('[push] notify failed:', err.message)
  );

  return notification;
}

function toSafeJSON(notification) {
  const obj = notification.toObject ? notification.toObject() : notification;
  return obj;
}

module.exports = { notify, toSafeJSON };