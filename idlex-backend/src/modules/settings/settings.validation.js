const { z } = require('zod');

// A VPA is `handle@bank`. Validated here rather than only in the browser
// because a typo in this field is not a cosmetic problem: every renter is
// sent to pay an account that does not exist, and nothing in the flow would
// notice until the money did not arrive.
const upiId = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,32}$/, 'Enter a UPI ID in the form name@bank');

const manualPaymentSettingsSchema = z.object({
  upiId: upiId.optional().nullable(),
  payeeName: z.string().trim().min(2).max(64).optional().nullable(),
  supportsIntent: z.boolean().optional(),
  note: z.string().trim().max(280).optional().nullable(),
});

module.exports = { manualPaymentSettingsSchema };
