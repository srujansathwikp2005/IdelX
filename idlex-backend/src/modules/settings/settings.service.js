const PlatformSettings = require('../../models/PlatformSettings');
const env = require('../../config/env');

// The settings document is read on every checkout, and changes perhaps twice
// a year. Holding it for a minute keeps that from being a database round trip
// per payment screen without making an admin wait to see their own edit —
// writes clear the cache outright.
const TTL_MS = 60_000;
let cached = null;
let cachedAt = 0;

function invalidate() {
  cached = null;
  cachedAt = 0;
}

async function loadDoc() {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  cached = await PlatformSettings.findOne({ key: 'platform' }).lean();
  cachedAt = Date.now();
  return cached;
}

/**
 * Where renters send money, and how.
 *
 * The stored value wins; the environment is the fallback so an install that
 * has never opened the admin screen keeps the behaviour it shipped with. A
 * blank field in the document counts as "not set" rather than as an
 * intentional empty, which is what makes clearing a field fall back rather
 * than break the payment screen.
 */
async function getManualPaymentSettings() {
  const doc = await loadDoc();
  const stored = doc?.manualPayment ?? {};
  return {
    upiId: stored.upiId || env.manualPayment.upiId || null,
    payeeName: stored.payeeName || env.manualPayment.payeeName || 'IdleX',
    supportsIntent: Boolean(stored.supportsIntent),
    note: stored.note || null,
    // Tells the admin screen whether it is showing a stored value or the
    // deployed default, which is otherwise impossible to tell apart.
    source: stored.upiId ? 'database' : 'environment',
  };
}

async function updateManualPaymentSettings(patch, actorId) {
  const doc = await PlatformSettings.findOneAndUpdate(
    { key: 'platform' },
    {
      $set: {
        'manualPayment.upiId': patch.upiId ?? null,
        'manualPayment.payeeName': patch.payeeName ?? null,
        'manualPayment.supportsIntent': Boolean(patch.supportsIntent),
        'manualPayment.note': patch.note ?? null,
        updatedBy: actorId ?? null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  invalidate();
  return doc;
}

/** How long an approved booking may sit unpaid. */
async function getPaymentWindowHours() {
  const doc = await loadDoc();
  const hours = Number(doc?.booking?.paymentWindowHours);
  return Number.isFinite(hours) && hours > 0 ? hours : 12;
}

module.exports = {
  getManualPaymentSettings,
  updateManualPaymentSettings,
  getPaymentWindowHours,
  invalidate,
};
