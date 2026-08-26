// Grandfathers accounts that predate verification being enforced.
//
// Sign-in now refuses an unverified account, and accounts created from here
// on are only created once verified. Everyone who registered before that
// change has isEmailVerified false through no fault of their own, and would
// be locked out of an account they have been using.
//
// Run once, after deploying. Idempotent: a second run reports zero.
//
//   node scripts/backfill-email-verified.js --dry-run
//   node scripts/backfill-email-verified.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const dryRun = process.argv.includes('--dry-run');

(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const filter = { isEmailVerified: { $ne: true } };
  const affected = await User.find(filter).select('email createdAt').lean();

  console.log(`${affected.length} account(s) would be marked verified:`);
  affected.forEach((u) => console.log(`  ${u.email}  (created ${u.createdAt?.toISOString() ?? 'unknown'})`));

  if (dryRun) {
    console.log('\nDry run — nothing written.');
  } else {
    const result = await User.updateMany(filter, { $set: { isEmailVerified: true } });
    console.log(`\nUpdated ${result.modifiedCount} account(s).`);
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
