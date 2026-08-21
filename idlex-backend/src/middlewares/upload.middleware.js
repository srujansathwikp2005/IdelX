const multer = require('multer');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');

// Two storage backends behind one interface. Controllers stay untouched:
// they read `file.filename` and persist `/uploads/<filename>`, so whichever
// driver runs, MongoDB ends up holding the same relative url shape.
//
// disk -> local filesystem (development, and the original behaviour)
// s3   -> private S3 bucket (production; see config/storage.js)

const fileFilter = (req, file, cb) => {
  // Images for listing photos/selfies and PDF for the KYC document.
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Unsupported file type'), false);
};

// Same name generator for both drivers, so a bucket key and a disk filename
// are interchangeable and switching drivers never invalidates stored urls.
function generateName(file) {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${unique}${path.extname(file.originalname)}`;
}

function buildDiskStorage() {
  const uploadRoot = path.join(process.cwd(), env.uploadDir);
  if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadRoot),
    filename: (req, file, cb) => cb(null, generateName(file)),
  });
}

function buildS3Storage() {
  const multerS3 = require('multer-s3');
  const { getS3Client } = require('../config/storage');

  if (!env.storage.bucket) {
    // Fail loudly at boot rather than at the first user upload. An empty
    // S3_BUCKET would otherwise surface as a confusing runtime error
    // halfway through a KYC submission.
    throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET to be set');
  }

  return multerS3({
    s3: getS3Client(),
    bucket: env.storage.bucket,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    // No ACL is set on purpose: the bucket blocks public access and files
    // are served through short-lived presigned urls instead.
    key: (req, file, cb) => cb(null, `${env.storage.prefix}/${generateName(file)}`),
  });
}

const upload = multer({
  storage: env.storage.isS3 ? buildS3Storage() : buildDiskStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — plenty for a KYC PDF
});

// multer-s3 exposes the object key as `file.key`, while diskStorage exposes
// `file.filename`. Rather than teach every controller about both, normalise
// here: strip the prefix so `file.filename` means the same thing either way.
function normalizeFilenames(req, res, next) {
  const stripPrefix = (key) => key.replace(new RegExp(`^${env.storage.prefix}/`), '');
  const fix = (f) => { if (f && !f.filename && f.key) f.filename = stripPrefix(f.key); };

  if (req.file) fix(req.file);
  if (Array.isArray(req.files)) req.files.forEach(fix);
  else if (req.files) Object.values(req.files).forEach((group) => group.forEach(fix));
  next();
}

// Wrap multer's middleware factories so callers get [multer, normalise] and
// nothing at the route level has to change. Express flattens middleware
// arrays, so `upload.array('photos', 10)` keeps working verbatim.
const wrap = (method) => (...args) => [upload[method](...args), normalizeFilenames];

module.exports = {
  single: wrap('single'),
  array: wrap('array'),
  fields: wrap('fields'),
  none: wrap('none'),
  any: wrap('any'),
};
