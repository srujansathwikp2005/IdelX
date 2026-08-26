const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const DeviceToken = require('../../models/DeviceToken');

// Upsert on the token, not on (user, token): the same install signing into
// a second account must move to that account rather than being registered
// twice, or the phone receives both accounts' notifications.
const registerDevice = asyncHandler(async (req, res) => {
  const { token, platform } = req.body;
  if (!token || typeof token !== 'string') {
    throw ApiError.badRequest('A device token is required');
  }

  const device = await DeviceToken.findOneAndUpdate(
    { token },
    {
      $set: {
        user: req.user._id,
        platform: platform || 'android',
        lastSeenAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  return new ApiResponse(200, { id: device._id }, 'Device registered').send(res);
});

// Only the owner's own token can be removed, so one account cannot silence
// another's notifications by guessing a token.
const unregisterDevice = asyncHandler(async (req, res) => {
  await DeviceToken.deleteOne({ token: req.params.token, user: req.user._id });
  return new ApiResponse(200, null, 'Device removed').send(res);
});

module.exports = { registerDevice, unregisterDevice };
