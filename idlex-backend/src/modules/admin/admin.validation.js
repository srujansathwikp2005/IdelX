const { z } = require('zod');

const kycReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().optional(),
});

const listingModerationSchema = z.object({
  status: z.enum(['published', 'paused', 'suspended']),
});

module.exports = { kycReviewSchema, listingModerationSchema };
