const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const Listing = require('../../models/Listing');

// The categories a listing can belong to.
//
// The set itself is fixed — it is a taxonomy, not user data, and every
// listing already stores one of these slugs. What is served rather than
// hardcoded is the pairing of slug to display name and the live count, so a
// client never has to guess that "home-appliances" reads as "Home
// Appliances", and never shows a category that has nothing in it as though
// it were full.
const CATEGORIES = [
  { slug: 'electronics', name: 'Electronics', icon: 'devices' },
  { slug: 'cameras', name: 'Cameras', icon: 'camera' },
  { slug: 'outdoor', name: 'Outdoor', icon: 'terrain' },
  { slug: 'tools', name: 'Tools', icon: 'tools' },
  { slug: 'home-appliances', name: 'Home Appliances', icon: 'appliance' },
  { slug: 'sports', name: 'Sports', icon: 'sports' },
  { slug: 'vehicles', name: 'Vehicles', icon: 'vehicle' },
  { slug: 'books', name: 'Books', icon: 'book' },
];

const listCategories = asyncHandler(async (req, res) => {
  // One aggregate rather than a count per category — eight queries to render
  // a filter bar is eight too many.
  const counts = await Listing.aggregate([
    { $match: { status: 'published' } },
    { $group: { _id: '$category', n: { $sum: 1 } } },
  ]);
  const byCategory = new Map(counts.map((c) => [c._id, c.n]));

  const items = CATEGORIES.map((category) => ({
    ...category,
    count: byCategory.get(category.slug) || 0,
  }));

  return new ApiResponse(200, items, 'Categories').send(res);
});

module.exports = { listCategories, CATEGORIES };
