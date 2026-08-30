const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const Kyc = require('../../models/Kyc');
const { logAudit } = require('../../utils/audit');
const path = require('path');
const fs = require('fs');
const env = require('../../config/env');
const { kycRoot } = require('../../middlewares/upload.middleware');
const { signedKycUrl, verify } = require('../../utils/signedFile');

// Adds freshly signed links to whatever file references a record holds.
// Signed on read rather than stored, so a link is only ever as old as the
// request that produced it.
function withSignedFiles(kyc) {
  const obj = kyc.toObject ? kyc.toObject() : { ...kyc };
  if (obj.document?.fileUrl) {
    obj.document = { ...obj.document, fileUrl: signedKycUrl(obj.document.fileUrl) };
  }
  if (obj.selfie?.fileUrl) {
    obj.selfie = { ...obj.selfie, fileUrl: signedKycUrl(obj.selfie.fileUrl) };
  }
  return obj;
}

const getMyKyc = asyncHandler(async (req, res) => {
  let kyc = await Kyc.findOne({ user: req.user._id });
  if (!kyc) kyc = await Kyc.create({ user: req.user._id });
  return new ApiResponse(200, withSignedFiles(kyc), 'KYC status').send(res);
});

// Serves an identity document or selfie.
//
// Not behind `protect`: an <img> tag cannot send an Authorization header,
// and the admin review screen has to show a selfie beside a document. The
// signature in the query string is the authorisation, and it expires.
const getKycFile = asyncHandler(async (req, res) => {
  const filename = path.basename(String(req.params.filename || ''));
  const { expires, token } = req.query;

  if (!verify(filename, expires, token)) {
    throw ApiError.forbidden('This link has expired. Reload the page and try again.');
  }

  let filePath = path.join(kycRoot, filename);
  // basename above already strips traversal; this is the belt to that
  // braces, so a future change to the parsing cannot open the filesystem.
  if (!filePath.startsWith(kycRoot)) throw ApiError.forbidden('Not allowed');

  // Records written before the move still point at files sitting in the
  // public directory. Serving those here too means deploying and migrating
  // need not happen in the same instant. Safe to delete once the migration
  // has run everywhere — the signature is still required either way.
  if (!fs.existsSync(filePath)) {
    const legacy = path.join(path.resolve(process.cwd(), env.uploadDir), filename);
    if (fs.existsSync(legacy)) filePath = legacy;
    else throw ApiError.notFound('File not found');
  }

  // Never cached by a proxy: the URL is short-lived by design and a shared
  // cache would outlive it.
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(filePath);
});

// Single-step submission: the user uploads a document (PDF) and a live
// selfie captured at submission time. Both go to the admin for review.
const submitKyc = asyncHandler(async (req, res) => {
  const files = req.files || {};
  if (!files.file || !files.file[0]) throw ApiError.badRequest('A document file (PDF) is required');
  if (!files.selfie || !files.selfie[0]) throw ApiError.badRequest('A live selfie is required');

  let kyc = await Kyc.findOne({ user: req.user._id });
  if (!kyc) kyc = await Kyc.create({ user: req.user._id });

  kyc.document = {
    // The filename only. A stored '/uploads/...' path was a public URL
    // that stayed valid forever once anyone had seen it.
    fileUrl: files.file[0].filename,
    uploadedAt: new Date(),
  };
  kyc.selfie = {
    fileUrl: files.selfie[0].filename,
    uploadedAt: new Date(),
  };

  // Bank details are part of payment setup: on KYC approval they become
  // the user's PayoutSettings so owners can receive rental earnings.
  const { accountHolderName, accountNumber, ifsc, bankName, upiId } = req.body;

  // UPI is what payouts actually go out on, so it is the one that has to be
  // there. Requiring a full bank account as well asked owners for an IFSC
  // and account number nothing in the platform uses -- the most sensitive
  // details we hold, collected for a rail we do not settle on.
  const upi = String(upiId || '').trim();
  if (!upi) {
    throw ApiError.badRequest('A UPI ID is required — payouts are sent by UPI');
  }
  // Shape only, not existence: a typo here means a payout that bounces, and
  // an admin reading it back against a failed transfer needs it to at least
  // look like an address.
  if (!/^[\w.\-]{2,64}@[a-zA-Z]{2,32}$/.test(upi)) {
    throw ApiError.badRequest('That does not look like a UPI ID. It should look like name@bank');
  }

  // Bank details are optional. Some owners will want a fallback for a payout
  // that cannot go by UPI, and an account holder name is worth having when
  // one is given, but none of it blocks verification.
  const anyBankField = [accountHolderName, accountNumber, ifsc, bankName]
    .some((v) => String(v || '').trim());
  if (anyBankField && (!String(accountNumber || '').trim() || !String(ifsc || '').trim())) {
    // Half a bank account is worse than none: it looks usable and is not.
    throw ApiError.badRequest(
      'If you add bank details, include both the account number and the IFSC code'
    );
  }
  kyc.bankDetails = {
    accountHolderName: accountHolderName ? String(accountHolderName).trim() : undefined,
    accountNumber: accountNumber ? String(accountNumber).trim() : undefined,
    ifsc: ifsc ? String(ifsc).trim().toUpperCase() : undefined,
    bankName: bankName ? String(bankName).trim() : undefined,
    upiId: upiId ? String(upiId).trim() : undefined,
  };

  kyc.status = 'pending';
  kyc.rejectionReason = null;
  kyc.reviewedBy = null;
  kyc.reviewedAt = null;
  await kyc.save();

  logAudit({
    actor: req.user._id,
    action: 'kyc.submitted',
    category: 'kyc',
    resourceType: 'kyc',
    resourceId: kyc._id.toString(),
    summary: 'Submitted document and live selfie for KYC review',
    req,
  });
  return new ApiResponse(200, kyc, 'KYC submitted for review').send(res);
});

module.exports = { getMyKyc, submitKyc, getKycFile, withSignedFiles };