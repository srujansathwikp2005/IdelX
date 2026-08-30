const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ApiError = require('../../utils/ApiError');
const env = require('../../config/env');
const User = require('../../models/User');
const Kyc = require('../../models/Kyc');
const Booking = require('../../models/Booking');
const Listing = require('../../models/Listing');
const Dispute = require('../../models/Dispute');
const DeviceToken = require('../../models/DeviceToken');
const Notification = require('../../models/Notification');
const { PayoutSettings } = require('../../models/Payout');

// A booking in any of these is still going on: money is owed, an item is out,
// or someone is waiting on an answer. Erasing one side of that mid-flight
// leaves the other party with a counterparty they cannot reach.
const LIVE_BOOKING_STATUSES = [
  'requested',
  'awaiting_payment',
  'confirmed',
  'active',
  'return_requested',
  'disputed',
];

// path.resolve, not path.join. These are absolute in production, and joining
// an absolute path onto the working directory silently produces a path inside
// the release directory instead — which is how a migration once wrote files
// somewhere nothing could find them.
const uploadRoot = () => path.resolve(process.cwd(), env.uploadDir);
const kycRoot = () => path.resolve(process.cwd(), env.kycDir);

/**
 * Deletes a file that belongs to this account, refusing anything that is not
 * a plain filename inside the directory it should be in.
 *
 * The stored value is a bare filename, but it comes from the database, and a
 * delete driven by database content should not be able to walk out of its
 * directory if that value is ever wrong.
 */
async function removeStoredFile(root, stored) {
  if (!stored) return;
  const filename = path.basename(String(stored));
  if (!filename || filename === '.' || filename === '..') return;
  const target = path.resolve(root, filename);
  if (path.dirname(target) !== root) return;
  await fs.unlink(target).catch((err) => {
    // A file that is already gone is the desired end state, not a failure.
    if (err.code !== 'ENOENT') {
      console.error(`[account-deletion] could not remove ${target}: ${err.message}`);
    }
  });
}

/**
 * Why this account cannot be deleted yet, in words the person can act on.
 *
 * Returned rather than thrown so the app can show them before anyone types a
 * password — being told "no" after confirming is a worse experience than
 * being told what to finish first.
 */
async function deletionBlockers(userId) {
  const listingIds = await Listing.find({ owner: userId }).distinct('_id');

  // Every booking this person is on either side of. A dispute names only the
  // person who raised it, so the booking is what connects the other party to
  // it — without this, the person being complained about could delete their
  // way out of an open case.
  const bookingIds = await Booking.find({
    $or: [{ renter: userId }, { listing: { $in: listingIds } }],
  }).distinct('_id');

  const [asRenter, asOwner, openDisputes] = await Promise.all([
    Booking.countDocuments({ renter: userId, status: { $in: LIVE_BOOKING_STATUSES } }),
    listingIds.length
      ? Booking.countDocuments({ listing: { $in: listingIds }, status: { $in: LIVE_BOOKING_STATUSES } })
      : 0,
    Dispute.countDocuments({
      $or: [{ raisedBy: userId }, { booking: { $in: bookingIds } }],
      status: { $in: ['open', 'under_review'] },
    }),
  ]);

  const reasons = [];
  if (asRenter) {
    reasons.push(
      `${asRenter} rental${asRenter === 1 ? '' : 's'} you booked ${asRenter === 1 ? 'is' : 'are'} still going on.`
    );
  }
  if (asOwner) {
    reasons.push(
      `${asOwner} booking${asOwner === 1 ? '' : 's'} on your listings ${asOwner === 1 ? 'is' : 'are'} still going on.`
    );
  }
  if (openDisputes) {
    reasons.push(`You have ${openDisputes} open dispute${openDisputes === 1 ? '' : 's'}.`);
  }
  return reasons;
}

/**
 * Erases the personal data on an account and leaves the record behind.
 *
 * Bookings, ledger entries and payments point at this user and are financial
 * records of a transaction that involved someone else, so they stay — but
 * they stay attached to an account that no longer identifies anybody. The
 * name, address, documents and every way of contacting the person are gone,
 * which is the part that was theirs.
 */
async function deleteAccount(userId, password) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw ApiError.notFound('Account not found');
  if (user.deletedAt) throw ApiError.badRequest('This account has already been deleted');

  // Re-authenticating here, on an already-authenticated request, is the point:
  // a token lifted from a lost phone should not be enough to erase someone.
  const ok = await bcrypt.compare(String(password || ''), user.password);
  if (!ok) throw ApiError.unauthorized('That password is not right');

  if (user.role === 'admin') {
    throw ApiError.badRequest('Admin accounts cannot be deleted from here');
  }

  const blockers = await deletionBlockers(userId);
  if (blockers.length) {
    throw ApiError.conflict(`Finish these first: ${blockers.join(' ')}`);
  }

  // Identity documents, off the disk as well as out of the database. These
  // are the most sensitive thing the platform holds.
  const kyc = await Kyc.findOne({ user: userId });
  if (kyc) {
    await removeStoredFile(kycRoot(), kyc.document?.fileUrl);
    await removeStoredFile(kycRoot(), kyc.selfie?.fileUrl);
    await kyc.deleteOne();
  }
  await removeStoredFile(uploadRoot(), user.avatarUrl);

  await Promise.all([
    // Where their money was sent, and how to reach their devices.
    PayoutSettings.deleteOne({ owner: userId }),
    DeviceToken.deleteMany({ user: userId }),
    Notification.deleteMany({ recipient: userId }),
    // Nothing they own can stay rentable once there is nobody behind it.
    Listing.updateMany({ owner: userId }, { $set: { status: 'paused' } }),
  ]);

  // A unique index sits on email, so it needs a value rather than nothing —
  // one that is unique, obviously not real, and in a reserved TLD that can
  // never be registered or delivered to.
  user.name = 'Deleted user';
  user.email = `deleted-${user._id}@idlex.invalid`;
  user.phone = undefined;
  user.avatarUrl = null;
  user.password = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  user.isActive = false;
  user.isOwner = false;
  user.isEmailVerified = false;
  user.isPhoneVerified = false;
  user.wishlist = [];
  user.otp = undefined;
  user.emailOtp = undefined;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.deletedAt = new Date();
  await user.save({ validateBeforeSave: false });

  return { deletedAt: user.deletedAt };
}

module.exports = { deleteAccount, deletionBlockers, LIVE_BOOKING_STATUSES };
