const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },

    // Which direction this review runs.
    //
    // 'listing' is a renter writing about the item they hired, which is what
    // shows on the product page. 'renter' is the owner writing about the
    // person who hired it, which is what an owner reads when deciding whether
    // to hand their property to a stranger next time.
    kind: { type: String, enum: ['listing', 'renter'], default: 'listing', index: true },

    // Set for a listing review; null when an owner is reviewing a person.
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null, index: true },

    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // The person being written about. Carried for both kinds — a listing
    // review is also a statement about its owner — so a profile can show
    // everything said about someone without joining through listings.
    reviewee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
  },
  { timestamps: true }
);

// One review per completed booking per reviewer — Mongo equivalent of
// Django's UniqueConstraint on (booking, reviewer).
reviewSchema.index({ booking: 1, reviewer: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
