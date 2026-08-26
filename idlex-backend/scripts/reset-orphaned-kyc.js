// Returns KYC records whose files are gone to an honest state.
//
// Ten identity documents were destroyed during the move to private storage.
// The records still said 'approved' and still pointed at filenames, so the
// admin screen showed approved submissions with broken images, and nothing
// anywhere said the documents no longer existed.
//
// Rather than delete the accounts -- they hold listings and bookings that
// other users are party to -- this clears the dead references and sends the
// submissions back for review. Everything else about the user survives.
//
//   node scripts/reset-orphaned-kyc.js --dry-run
//   node scripts/reset-orphaned-kyc.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Kyc = require('../src/models/Kyc');
// Required for its side effect: populate('user') resolves the ref through
// mongoose's model registry, and a standalone script never loads the app
// that would otherwise have registered it.
require('../src/models/User');

const dryRun = process.argv.includes('--dry-run');

// path.resolve, not path.join: KYC_DIR is absolute in production.
const privateRoot = path.resolve(process.cwd(), env.kycDir);
const publicRoot = path.resolve(process.cwd(), env.uploadDir);

// A reference counts as live if the file is in either place — the public
// directory is checked too so a record is never reset over a file that
// simply had not been migrated yet.
function fileExists(stored) {
  if (!stored) return false;
  const name = path.basename(String(stored));
  return fs.existsSync(path.join(privateRoot, name)) || fs.existsSync(path.join(publicRoot, name));
}

(async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set');
    process.exit(1);
  }

  console.log(`private: ${privateRoot}`);
  console.log(`public : ${publicRoot}\n`);

  await mongoose.connect(process.env.MONGO_URI);
  const records = await Kyc.find({}).populate('user', 'email');
  let reset = 0;

  for (const kyc of records) {
    const hasDoc = fileExists(kyc.document?.fileUrl);
    const hasSelfie = fileExists(kyc.selfie?.fileUrl);
    // Only records that claim a file and cannot produce it. A submission
    // that never had one is simply incomplete, not damaged.
    const claimed = Boolean(kyc.document?.fileUrl || kyc.selfie?.fileUrl);
    if (!claimed || (hasDoc && hasSelfie)) continue;

    console.log(`${kyc.user?.email ?? 'unknown'}  ${kyc.status} -> pending`);
    console.log(`  document: ${hasDoc ? 'present' : 'MISSING'}   selfie: ${hasSelfie ? 'present' : 'MISSING'}`);

    if (!dryRun) {
      kyc.status = 'pending';
      // Cleared so nothing renders a link to a file that is not there.
      if (kyc.document) kyc.document.fileUrl = undefined;
      if (kyc.selfie) kyc.selfie.fileUrl = undefined;
      // The review fields describe a decision that no longer holds.
      kyc.reviewedBy = null;
      kyc.reviewedAt = null;
      kyc.rejectionReason = null;
      await kyc.save();
    }
    reset += 1;
  }

  console.log(dryRun ? `\nDry run — ${reset} record(s) would be reset.` : `\nReset ${reset} record(s).`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
