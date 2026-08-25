const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/tokens');
const User = require('../models/User');

// Equivalent of DRF's IsAuthenticated: reads the Bearer access token,
// verifies it, and attaches the user document to req.user.
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or invalid Authorization header');
  }
  const token = header.split(' ')[1];

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    throw ApiError.unauthorized('Access token expired or invalid');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('User no longer exists or is suspended');
  }

  req.user = user;

  // A cheap heartbeat on every authenticated request.
  //
  // The app polls rather than holding a socket, so without this someone using
  // it constantly would still read as last seen whenever they last had a
  // socket open. Throttled to a minute: this runs on every request, and
  // writing the same field a hundred times a minute buys nothing.
  const lastSeen = user.lastSeenAt?.getTime() ?? 0;
  if (Date.now() - lastSeen > 60000) {
    User.updateOne({ _id: user._id }, { lastSeenAt: new Date() }).catch(() => {});
  }
  next();
});

module.exports = { protect };
