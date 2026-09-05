// Every review written before two-way reviews existed was a renter writing
// about a listing. They carry no `kind` and no `reviewee`, so the listing
// query — which now filters on kind — would skip them and a product page
// would lose its reviews. This stamps the direction they always had.
const mongoose = require('mongoose');
const Review = require('../src/models/Review');
const Listing = require('../src/models/Listing');
const User = require('../src/models/User');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const legacy = await Review.find({
    $or: [{ kind: { $exists: false } }, { reviewee: { $exists: false } }, { reviewee: null }],
  }).lean();

  let stamped = 0;
  for (const r of legacy) {
    const listing = await Listing.findById(r.listing).select('owner').lean();
    if (!listing) {
      console.log(`  skipped ${r._id}: its listing is gone`);
      continue;
    }
    await Review.updateOne(
      { _id: r._id },
      { $set: { kind: 'listing', reviewee: listing.owner } }
    );
    stamped++;
  }
  console.log(`stamped ${stamped} of ${legacy.length} legacy review(s)`);

  // Owners have never been rated as people, so nothing to recompute for
  // users yet — but run it so the counters exist rather than being absent.
  const users = await User.find({ ratingCount: { $exists: false } }).select('_id').lean();
  if (users.length) {
    await User.updateMany(
      { _id: { $in: users.map((u) => u._id) } },
      { $set: { ratingAvg: 0, ratingCount: 0 } }
    );
    console.log(`initialised rating counters on ${users.length} user(s)`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
