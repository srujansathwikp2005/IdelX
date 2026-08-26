// Moves identity documents out of the public uploads directory.
//
// KYC files were written alongside listing photos and served by
// express.static, so every document and selfie was fetchable by anyone with
// the URL — no auth, no expiry. This moves them to the private directory and
// rewrites each record to hold a bare filename, which is what the signed
// route expects.
//
// Idempotent: a record already holding a bare filename is left alone, and a
// file already moved is not moved twice.
//
//   node scripts/migrate-kyc-private.js --dry-run
//   node scripts/migrate-kyc-private.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Kyc = require('../src/models/Kyc');

const dryRun = process.argv.includes('--dry-run');
// path.resolve, not path.join. KYC_DIR is an absolute path in production,
// and join glues it onto the cwd instead of replacing it — this script wrote
// documents to <release>/opt/idlex/shared/kyc-private, inside a directory the
// next deploy deletes. The middleware already resolved correctly; this did
// not, and the dry run could not reveal it because it never touches disk.
const publicRoot = path.resolve(process.cwd(), env.uploadDir);
const privateRoot = path.resolve(process.cwd(), env.kycDir);

function migrateOne(stored, report) {
  if (!stored) return { value: stored, changed: false };

  const filename = path.basename(String(stored));
  const from = path.join(publicRoot, filename);
  const to = path.join(privateRoot, filename);

  if (fs.existsSync(to)) {
    report.push(`  already private: ${filename}`);
  } else if (fs.existsSync(from)) {
    report.push(`  move: ${filename}`);
    if (!dryRun) {
      fs.renameSync(from, to);
      // Verified rather than assumed. A move that silently did not happen,
      // followed by anything that cleans up the source, loses the file.
      if (!fs.existsSync(to)) throw new Error(`move failed: ${filename}`);
    }
  } else {
    // The record points at a file neither directory has. Worth saying out
    // loud rather than silently rewriting a path to nothing.
    report.push(`  MISSING on disk: ${filename}`);
  }

  return { value: filename, changed: filename !== stored };
}

(async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set');
    process.exit(1);
  }
  // Printed before anything moves. A path that looks wrong here is the last
  // chance to stop, and the dry run cannot show it any other way.
  console.log(`public : ${publicRoot}`);
  console.log(`private: ${privateRoot}\n`);

  if (!dryRun && !fs.existsSync(privateRoot)) {
    fs.mkdirSync(privateRoot, { recursive: true, mode: 0o750 });
  }

  await mongoose.connect(process.env.MONGO_URI);
  const records = await Kyc.find({});
  let moved = 0;

  for (const kyc of records) {
    const report = [];
    const doc = migrateOne(kyc.document?.fileUrl, report);
    const selfie = migrateOne(kyc.selfie?.fileUrl, report);

    if (report.length) {
      console.log(`KYC ${kyc._id} (${kyc.status}):`);
      report.forEach((l) => console.log(l));
    }

    if ((doc.changed || selfie.changed) && !dryRun) {
      if (kyc.document) kyc.document.fileUrl = doc.value;
      if (kyc.selfie) kyc.selfie.fileUrl = selfie.value;
      await kyc.save();
      moved += 1;
    }
  }

  console.log(dryRun ? '\nDry run — nothing moved or written.' : `\nRewrote ${moved} record(s).`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
