const multer = require('multer');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

// Local-disk storage for development. In production, swap `storage` for
// an S3/Cloudinary multer-storage adapter — nothing else in the app
// needs to change, since routes only depend on req.file(s).url shape.
const uploadRoot = path.join(process.cwd(), env.uploadDir);
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

// Identity documents never go to the public root. Nothing serves this
// directory statically; the only way out of it is the signed route in the
// KYC module.
const kycRoot = path.resolve(process.cwd(), env.kycDir);
if (!fs.existsSync(kycRoot)) fs.mkdirSync(kycRoot, { recursive: true, mode: 0o750 });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  // Images for listing photos/selfies and PDF for the KYC document.
  // HEIC/HEIF are accepted here and converted to JPEG by normalizeImages
  // below. Every photo an iPhone takes is HEIC, and desktop Chrome and
  // Firefox cannot decode it in-browser, so rejecting it at the edge would
  // block those users entirely regardless of what the client tries first.
  const allowed = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
  ];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  // ApiError, not a bare Error: a plain Error falls through the error
  // middleware's known cases and surfaces as a 500, telling the user the
  // server broke when in fact they picked the wrong kind of file.
  return cb(
    ApiError.badRequest(
      `Unsupported file type "${file.mimetype}". Upload a JPG, PNG or WebP image${
        file.fieldname === 'photos' ? '' : ', or a PDF'
      }.`
    ),
    false
  );
};

const LIMITS = { fileSize: 10 * 1024 * 1024 }; // 10MB — plenty for a KYC PDF

const upload = multer({ storage, fileFilter, limits: LIMITS });

// Converts any uploaded HEIC/HEIF to JPEG on disk, in place, so nothing
// downstream has to know which format the phone produced. Runs after multer
// has written the file and before the controller reads req.files.
//
// This is what makes the feature browser-independent. The client converts
// when it can — Safari decodes HEIC natively — but desktop Chrome and
// Firefox cannot, and every photo an iPhone takes is HEIC. Doing it here
// covers every browser regardless.
async function normalizeImages(req, res, next) {
  const files = req.file
    ? [req.file]
    : Array.isArray(req.files)
      ? req.files
      : Object.values(req.files || {}).flat();

  for (const file of files) {
    if (!/^image\/(heic|heif)$/i.test(file.mimetype || '')) continue;
    if (!file.path) continue; // nothing local to convert

    try {
      const sharp = require('sharp');
      const jpegPath = `${file.path.replace(/\.[^.]+$/, '')}.jpg`;
      // .rotate() applies the EXIF orientation; without it portrait photos
      // from a phone arrive sideways.
      await sharp(file.path).rotate().jpeg({ quality: 88 }).toFile(jpegPath);
      await fs.promises.unlink(file.path).catch(() => {});

      file.path = jpegPath;
      file.filename = path.basename(jpegPath);
      file.mimetype = 'image/jpeg';
    } catch (err) {
      // Report rather than storing a file browsers cannot display. A silent
      // failure here would show as a broken image long after upload.
      return next(ApiError.badRequest(`Could not process ${file.originalname}: ${err.message}`));
    }
  }
  return next();
}

// Wrap multer's factories so every caller gets conversion for free and no
// route has to remember to add it. Express flattens middleware arrays, so
// `upload.array('photos', 10)` keeps working unchanged.
const wrap = (method) => (...args) => [upload[method](...args), normalizeImages];

// The same multer configuration, writing to the private root instead. Kept
// as a separate instance rather than a per-request destination so a route
// cannot accidentally send identity documents to the public directory by
// forgetting a flag.
const kycStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, kycRoot),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const kycUpload = multer({
  storage: kycStorage,
  fileFilter,
  limits: LIMITS,
});

const wrapKyc = (method) => (...args) => [kycUpload[method](...args), normalizeImages];

module.exports = {
  single: wrap('single'),
  array: wrap('array'),
  fields: wrap('fields'),
  none: wrap('none'),
  any: wrap('any'),
  normalizeImages,
  kycRoot,
  // Routes handling identity documents use these instead.
  kyc: {
    single: wrapKyc('single'),
    fields: wrapKyc('fields'),
  },
};
