const { z } = require('zod');

// The address the renter types, and where they were when they typed it.
//
// Every field is optional here and re-checked by sanitizeAddress, which
// trims, length-caps and range-checks before anything is stored. The schema's
// job is only to let it through: validate() replaces req.body with the parsed
// result, so a key the schema does not name is dropped before any handler
// sees it -- which is how every delivery address on the platform was
// silently discarded.
const deliveryAddressSchema = z.object({
  label: z.string().optional(),
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  instructions: z.string().optional(),
  // Coerced because a client may send either a number or a string, and
  // rejecting "16.54" would fail a booking over a JSON detail.
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

const createBookingSchema = z.object({
  listingId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  deliveryAddress: deliveryAddressSchema.optional(),
});

const cancelBookingSchema = z.object({
  reason: z.string().min(1),
});

const extensionRequestSchema = z.object({
  requestedNewEndDate: z.coerce.date(),
  reason: z.string().optional(),
});

const extensionRespondSchema = z.object({
  approve: z.boolean(),
});

module.exports = {
  createBookingSchema,
  cancelBookingSchema,
  extensionRequestSchema,
  extensionRespondSchema,
};
