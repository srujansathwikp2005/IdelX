// Storage driver selection.
//
// The app stores every uploaded file as a RELATIVE url (`/uploads/<name>`)
// in MongoDB, regardless of driver. That indirection is deliberate: the
// bucket, region or CDN can change without a data migration, and existing
// rows keep resolving. Only this module and upload.middleware.js know
// whether the bytes actually live on local disk or in S3.
const env = require('./env');

let s3Client = null;

// Lazily constructed so that disk-driver deployments never need the AWS
// SDK configured (or even reachable) at boot.
function getS3Client() {
  if (!env.storage.isS3) return null;
  if (!s3Client) {
    const { S3Client } = require('@aws-sdk/client-s3');
    // No explicit credentials: on EC2 the SDK resolves the instance
    // profile automatically, so no long-lived keys ever touch the box.
    s3Client = new S3Client({ region: env.storage.region });
  }
  return s3Client;
}

// Presigned GET so the bucket can stay fully private. KYC documents are
// identity papers — they must never be publicly readable, and a public
// bucket plus an unguessable key is not a real access control.
async function getSignedUrlFor(key) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const command = new GetObjectCommand({ Bucket: env.storage.bucket, Key: key });
  return getSignedUrl(getS3Client(), command, { expiresIn: env.storage.signedUrlTtl });
}

module.exports = { getS3Client, getSignedUrlFor };
