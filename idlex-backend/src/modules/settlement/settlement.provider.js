const env = require('../../config/env');

// How money reaches an owner or goes back to a renter.
//
// The client's instruction was explicit: do not hard-code the system around
// Cashfree Payouts. So settlement sits behind this interface, and booking
// logic never names a provider. Cashfree Payouts, Easy Split, a different
// gateway or a person making bank transfers are all just implementations of
// `settle`.
//
// Every provider returns the same shape, so a caller cannot tell which one
// ran — which is the point. Adding one means adding a case here, not editing
// the escrow flow.

// The obligation is recorded and visible, and a human moves the money.
//
// This is the honest default while no automated provider is available. It
// does not pretend to send anything: the entry stays 'pending' until someone
// records the transfer, so the admin screen always shows what is genuinely
// still owed.
const manualProvider = {
  name: 'manual',
  async settle() {
    return {
      settled: false,
      settlement: 'pending',
      reference: null,
      note: 'Awaiting manual transfer',
    };
  },
};

// Cashfree Payouts — a standalone transfer to a bank account or UPI ID.
// Present and working, but currently unusable: Cashfree declined activation
// of the standalone Payouts product for this account.
const cashfreePayoutsProvider = {
  name: 'cashfree_payouts',
  async settle({ payment, booking }) {
    // Required here rather than at module load: pulling in the payments
    // service at import time would make settlement and payments depend on
    // each other in a cycle.
    const payments = require('../payments/payments.service');
    const payout = await payments.settleOwnerPayout(payment, booking);
    const failed = !payout || payout.status === 'failed';
    return {
      settled: !failed,
      settlement: failed ? 'failed' : 'settled',
      reference: payout?.gatewayPayoutId || null,
      note: payout?.failureReason || (payout ? null : 'Owner has no payout details configured'),
    };
  },
};

// Cashfree Easy Split — the money is divided at capture, so the owner's
// share never pools in the platform account and there is nothing to transfer
// later.
//
// Left unimplemented on purpose. Cashfree has not yet confirmed whether Easy
// Split can hold a security deposit refundable for the length of a rental,
// which is the whole question the client's support ticket is asking. Writing
// the integration now would mean guessing at that answer and rewriting it
// either way.
const easySplitProvider = {
  name: 'cashfree_easy_split',
  async settle() {
    return {
      settled: false,
      settlement: 'pending',
      reference: null,
      note: 'Easy Split is not yet configured for this account',
    };
  },
};

const providers = {
  manual: manualProvider,
  cashfree_payouts: cashfreePayoutsProvider,
  cashfree_easy_split: easySplitProvider,
};

// Manual is the default deliberately. An unset or misspelled value falling
// back to a real provider would move money by accident; falling back to
// manual only means someone has to press a button.
function activeProvider() {
  const configured = (env.settlement?.provider || 'manual').toLowerCase();
  return providers[configured] || manualProvider;
}

module.exports = { activeProvider, providers };
