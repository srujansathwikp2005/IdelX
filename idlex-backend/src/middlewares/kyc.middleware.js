const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const Kyc = require('../models/Kyc');

// Verification gate. A user may only create listings, request a rental or
// pay once an admin has approved their KYC. Viewing and reading are never
// blocked. Admins (staff) bypass the check.
//
// The message is per-action because this guard sits on three different
// routes: telling someone requesting a rental that they cannot "add
// listings" describes a feature they were not using.
//
// `kyc_required` is what clients should branch on to offer a route into
// verification. The submission's own status rides along in details so the
// copy can distinguish "you have not started" from "we are still reviewing".
function requireApprovedKyc(action = 'continue') {
  return asyncHandler(async (req, res, next) => {
    if (req.user.role === 'admin') return next();

    const kyc = await Kyc.findOne({ user: req.user._id });
    if (kyc && kyc.status === 'approved') return next();

    const status = kyc ? kyc.status : 'not_started';
    const explanation = {
      not_started: `You need to complete verification before you can ${action}.`,
      pending: `Your verification is being reviewed. You can ${action} once it is approved.`,
      rejected: `Your verification was not approved. Submit it again before you ${action}.`,
    }[status] || `You need an approved verification before you can ${action}.`;

    throw ApiError.forbidden(
      explanation,
      { kycStatus: status, rejectionReason: kyc?.rejectionReason || undefined },
      'kyc_required'
    );
  });
}

module.exports = { requireApprovedKyc };
