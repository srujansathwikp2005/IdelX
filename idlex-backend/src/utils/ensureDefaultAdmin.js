const env = require('../config/env');
const User = require('../models/User');

// Converges the admin account on every boot: exactly one account holds the
// admin role, it is the address in ADMIN_EMAIL, and its password is the one
// in ADMIN_PASSWORD.
//
// Previously this returned early when the account already existed and left
// the password untouched. That made the credential unchangeable through
// configuration — setting ADMIN_PASSWORD on a deployment that had already
// booted did nothing, silently, so a weak seeded password survived every
// attempt to replace it.
async function ensureDefaultAdmin() {
  const email = String(env.admin.email || '').trim().toLowerCase();
  const password = String(env.admin.password || '');

  // No credentials, no admin. There is deliberately no fallback: a default
  // that ships in source is a published credential, and this account can
  // read every user's KYC documents and payment records.
  if (!email || !password) {
    console.warn(
      '[admin] ADMIN_EMAIL / ADMIN_PASSWORD are not set — no admin account was seeded.'
    );
    return null;
  }

  let admin = await User.findOne({ email }).select('+password');

  if (admin) {
    admin.role = 'admin';
    admin.isActive = true;
    admin.isEmailVerified = true;
    // Only assign when it differs, so the bcrypt hash — and therefore the
    // document — is left alone on a no-op boot.
    if (!(await admin.comparePassword(password))) {
      admin.password = password;
      console.log('[admin] Admin password reset to the configured value.');
    }
    await admin.save();
  } else {
    admin = await User.create({
      name: 'Admin',
      email,
      password,
      role: 'admin',
      isOwner: true,
      isRenter: true,
      isEmailVerified: true,
    });
    console.log(`[admin] Admin account created: ${email}`);
  }

  // Exactly one admin. Any other account holding the role — a leftover seed
  // from an earlier default, or a promotion made by hand — is demoted and
  // deactivated rather than deleted, so its listings, bookings and history
  // stay intact and it can be restored from the admin console if the
  // demotion was not intended.
  //
  // Deactivating matters as much as demoting: the account this replaces was
  // seeded with a password that ships in source, so demotion alone would
  // leave a publicly-known credential able to sign in as an ordinary user.
  const { modifiedCount } = await User.updateMany(
    { role: 'admin', _id: { $ne: admin._id } },
    { $set: { role: 'renter', isActive: false } }
  );
  if (modifiedCount > 0) {
    console.warn(
      `[admin] Demoted and deactivated ${modifiedCount} other admin account(s).`
    );
  }

  return admin;
}

module.exports = ensureDefaultAdmin;
