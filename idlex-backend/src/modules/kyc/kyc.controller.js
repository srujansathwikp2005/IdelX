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
  if (!String(accountHolderName || '').trim() || !String(accountNumber || '').trim() ||
      !String(ifsc || '').trim() || !String(bankName || '').trim()) {
    throw ApiError.badRequest(
      'Bank details are required for payment setup: account holder name, account number, IFSC code and bank name'
    );
  }
  kyc.bankDetails = {
    accountHolderName: String(accountHolderName).trim(),
    accountNumber: String(accountNumber).trim(),
    ifsc: String(ifsc).trim().toUpperCase(),
    bankName: String(bankName).trim(),
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