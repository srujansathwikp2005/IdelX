const crypto = require('crypto');
const env = require('../../config/env');
const Payment = require('../../models/Payment');
const Booking = require('../../models/Booking');
const Listing = require('../../models/Listing');
const { Payout, PayoutSettings } = require('../../models/Payout');
const ApiError = require('../../utils/ApiError');
const bookingsService = require('../bookings/bookings.service');
const { logAudit } = require('../../utils/audit');

// Accepted in dev only (Cashfree credentials unset) so the full
// pay -> verify -> booking flow can be exercised before real keys exist.
const DEV_SIGNATURE = 'dev-signature';

function isGatewayConfigured() {
  return Boolean(env.cashfree.appId && env.cashfree.secretKey);
}

// Raw REST call to the Cashfree API. Cashfree authenticates with two headers
// rather than basic auth, and requires an explicit API version — an
// unversioned request is rejected outright.
async function cashfreeRequest(method, path, data) {
  // Payouts and Payments are separate products: different API version, and
  // usually different credentials. Routing on the path keeps every caller
  // unchanged while sending each product what it expects.
  const isPayout = path.startsWith('/payout');
  const res = await fetch(`${env.cashfree.apiBase}${path}`, {
    method,
    headers: {
      'x-client-id': isPayout ? env.cashfree.payoutAppId : env.cashfree.appId,
      'x-client-secret': isPayout ? env.cashfree.payoutSecretKey : env.cashfree.secretKey,
      'x-api-version': isPayout ? env.cashfree.payoutApiVersion : env.cashfree.apiVersion,
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message || `Cashfree API error (${res.status})`);
    err.status = res.status;
    err.details = json;
    throw err;
  }
  return json;
}

// Idempotent contact + fund-account resolution for a payout beneficiary.
// Cashfree Payouts models a beneficiary directly rather than Razorpay's
// contact + fund-account pair, so one idempotent lookup replaces two.
// The beneficiary id is derived from the owner's id, which makes repeat
// payouts to the same owner reuse the same record without a search.
function beneficiaryIdFor(user) {
  return `idlex_owner_${user._id}`;
}

async function findOrCreateBeneficiary(user, settings) {
  const beneId = beneficiaryIdFor(user);
  try {
    const existing = await cashfreeRequest('GET', `/payout/beneficiary?beneficiary_id=${beneId}`);
    if (existing?.beneficiary_id) return existing;
  } catch (err) {
    // 404 means "not created yet", which is the normal first-payout path.
    // Anything else is a real failure and must not be swallowed.
    if (err.status !== 404) throw err;
  }

  return cashfreeRequest('POST', '/payout/beneficiary', {
    beneficiary_id: beneId,
    beneficiary_name: settings.accountHolderName,
    beneficiary_instrument_details: {
      bank_account_number: settings.accountNumber,
      bank_ifsc: settings.ifscOrRoutingNumber,
      ...(settings.upiId ? { vpa: settings.upiId } : {}),
    },
    beneficiary_contact_details: {
      beneficiary_email: user.email,
      beneficiary_phone: (user.phone || '').replace(/\D/g, '').slice(-10) || undefined,
    },
  });
}

// Owner payout for a captured payment. The owner receives the rental
// subtotal; the platform keeps the service fee and the deposit stays
// refundable to the renter. If Cashfree credentials or the owner's payout
// settings are missing, the payout is recorded as 'pending' and the API is
// skipped (dev/test mode) — the booking flow itself never fails because of
// a payout problem.
async function settleOwnerPayout(payment, booking) {
  const listing = await require('../../models/Listing').findById(payment.listing).select('owner title');
  if (!listing) return null;
  const settings = await PayoutSettings.findOne({ owner: listing.owner });
  if (!settings) return null;

  const payout = await Payout.create({
    owner: listing.owner,
    booking: booking._id,
    amount: booking.subtotal,
    status: 'pending',
  });

  if (!isGatewayConfigured()) return payout;

  try {
    const User = require('../../models/User');
    const owner = await User.findById(listing.owner).select('name email phone');
    if (!owner) return payout;

    const beneficiary = await findOrCreateBeneficiary(owner, settings);
    // Derived from the booking, so a retried payout is recognised by
    // Cashfree as the same transfer rather than paying the owner twice.
    const transferId = `idlex_${booking._id}`;

    const result = await cashfreeRequest('POST', '/payout/transfers', {
      transfer_id: transferId,
      // Rupees, not paise — Cashfree differs from Razorpay here, and
      // getting it wrong pays out 100x the intended amount.
      transfer_amount: booking.subtotal,
      transfer_mode: 'banktransfer',
      beneficiary_details: { beneficiary_id: beneficiary.beneficiary_id },
      transfer_remarks: `Rental payout for booking ${booking._id}`,
    });

    payout.gatewayPayoutId = result.cf_transfer_id || transferId;
    payout.status = 'paid';
    await payout.save();

    logAudit({
      action: 'payout.sent',
      category: 'payment',
      resourceType: 'booking',
      resourceId: booking._id.toString(),
      summary: 'Owner payout transferred',
      details: { owner: listing.owner, amount: booking.subtotal, transferId: payout.gatewayPayoutId },
    });
    return payout;
  } catch (err) {
    console.error(`[payout] failed for booking ${booking._id}:`, err.message);
    payout.status = 'failed';
    payout.gatewayPayoutId = err.details?.metadata?.payout_id || null;
    await payout.save();

    // A failed payout is money the owner is owed and has not received, so it
    // belongs in the trail as much as a successful one.
    logAudit({
      action: 'payout.failed',
      category: 'payment',
      resourceType: 'booking',
      resourceId: booking._id.toString(),
      summary: 'Owner payout failed',
      details: { owner: listing.owner, amount: booking.subtotal, error: err.message },
    });
    return payout;
  }
}

// Pay-first checkout: an order is created against the listing + dates and
// the booking only materialises once the payment is captured (see
// markPaymentCaptured). Only the gateway's order id is stored, never card
// data — the same rule as the original Django doc.
// Creates a gateway order for a booking the owner has already approved.
//
// The booking exists first and payment attaches to it, rather than payment
// creating the booking: an owner agrees to the rental before any money is
// taken, so a declined request never has to be refunded.
async function createCheckoutOrder(payerId, { bookingId }) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (booking.renter.toString() !== payerId.toString()) {
    throw ApiError.forbidden('Only the renter can pay for this booking');
  }
  if (booking.status !== 'awaiting_payment') {
    throw ApiError.badRequest(
      booking.status === 'requested'
        ? 'The owner has not approved this booking yet'
        : `This booking cannot be paid for in '${booking.status}' state`
    );
  }

  const listing = await Listing.findById(booking.listing);
  if (!listing) throw ApiError.notFound('Listing not found');

  // Amounts come from the booking, which was priced when it was requested.
  // Recomputing here would let a listing price change between approval and
  // payment alter what the renter was quoted.
  const cost = {
    totalAmount: booking.totalAmount,
    subtotal: booking.subtotal,
    serviceFee: booking.serviceFee,
    securityDeposit: booking.securityDeposit,
  };
  const startDate = booking.startDate;
  const endDate = booking.endDate;

  // Our own order id. Cashfree accepts a merchant-supplied id, which means
  // the Payment row and the gateway order share a key from the start rather
  // than the record depending on whatever the gateway returns.
  // Every visit to the payment page used to leave another 'created' payment
  // behind — one booking had collected seven. They are harmless at the
  // gateway, where unpaid orders simply expire, but they make the ledger
  // unreadable when working out what a renter actually did. Supersede the
  // old ones rather than accumulating them.
  await Payment.updateMany(
    { booking: booking._id, status: 'created' },
    { $set: { status: 'failed', failureReason: 'Superseded by a newer checkout attempt' } }
  );

  const gatewayOrderId = `idlex_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const configured = isGatewayConfigured();

  const payment = await Payment.create({
    payer: payerId,
    listing: listing._id,
    startDate,
    endDate,
    gatewayOrderId,
    amount: cost.totalAmount,
    currency: 'INR',
    status: 'created',
    booking: booking._id,
  });

  let paymentSessionId = null;
  if (configured) {
    const User = require('../../models/User');
    const payer = await User.findById(payerId).select('name email phone');
    const order = await cashfreeRequest('POST', '/pg/orders', {
      order_id: gatewayOrderId,
      // Rupees, not paise. Razorpay used paise; sending paise here would
      // charge the renter 100x.
      order_amount: cost.totalAmount,
      order_currency: 'INR',
      customer_details: {
        customer_id: String(payerId),
        customer_name: payer?.name || 'IdleX user',
        customer_email: payer?.email,
        // Cashfree requires a 10-digit Indian number and rejects the order
        // outright without one.
        customer_phone: (payer?.phone || '').replace(/\D/g, '').slice(-10) || '9999999999',
      },
      order_meta: {
        return_url: `${env.clientUrl}/checkout/${listing._id}?order_id={order_id}`,
        notify_url: `${env.clientUrl}/api/webhooks/payments`,
        // Allowed methods are fixed on the ORDER, not in the browser SDK, so
        // a tampered client cannot re-enable what is excluded here.
        //
        // EMI and Pay Later are deliberately absent: both settle over time or
        // through a lender, while a rental carries a refundable security
        // deposit that must go back to the renter days later. Refunding a
        // deposit against a part-paid EMI is a mess for everyone.
        payment_methods: 'cc,dc,upi,nb,app',
      },
      order_note: `Rental of ${listing.title}`,
    });
    // The session id is what the browser SDK consumes; it is not a secret
    // in the way the API key is, but it is single-use per order.
    paymentSessionId = order.payment_session_id;
  }

  return { payment, configured, paymentSessionId };
}

// Cashfree does not hand the browser a signature to verify. The supported
// check is to ask the API what actually happened to the order — which is
// stronger: the answer comes from the gateway rather than from the client,
// so a forged callback cannot fabricate a successful payment.
async function verifyPaymentByOrder(orderId) {
  if (!isGatewayConfigured()) {
    // Dev mode: no gateway to ask, so accept and synthesise a payment id.
    return { paid: true, gatewayPaymentId: `dev_${crypto.randomBytes(6).toString('hex')}` };
  }

  const payments = await cashfreeRequest('GET', `/pg/orders/${encodeURIComponent(orderId)}/payments`);
  const list = Array.isArray(payments) ? payments : [];
  const success = list.find((p) => p.payment_status === 'SUCCESS');
  if (!success) {
    const attempted = list.map((p) => p.payment_status).join(', ') || 'no attempts';
    return { paid: false, reason: `Payment not successful (${attempted})` };
  }
  return { paid: true, gatewayPaymentId: String(success.cf_payment_id) };
}

// Webhook signature: Cashfree signs `timestamp + rawBody` with the webhook
// secret and base64-encodes it — not hex, and not the body alone. Both
// differences silently fail a Razorpay-shaped implementation.
function verifyWebhookSignature(rawBody, signature, timestamp) {
  if (!env.cashfree.webhookSecret || !signature || !timestamp) return false;
  const expected = crypto
    .createHmac('sha256', env.cashfree.webhookSecret)
    .update(`${timestamp}${rawBody}`)
    .digest('base64');
  // timingSafeEqual needs equal lengths, so compare only when they match.
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Shared capture path for the client-side verification endpoint and the
// gateway webhook. Idempotent: a second capture for the same order is a
// no-op once the booking already exists. The booking is created with
// status 'requested' and the owner is notified inside createBooking —
// payment first, booking request second, exactly the pay-first flow.
async function markPaymentCaptured({ gatewayOrderId, gatewayPaymentId, signature }) {
  const payment = await Payment.findOne({ gatewayOrderId });
  if (!payment) throw ApiError.notFound('Payment not found for this order');

  if (payment.status === 'captured' && payment.booking) {
    const existing = await Booking.findById(payment.booking);
    if (existing) return { payment, booking: existing, created: false };
  }
  if (payment.status === 'failed') {
    throw ApiError.badRequest('Payment was failed at the gateway');
  }

  // Claim the payment atomically before creating anything. A read-then-write
  // guard is not enough: the QR flow verifies twice — once when the checkout
  // modal closes and once from the ?order_id= redirect — and both requests
  // arrive together, both read status 'created', and both create a booking.
  // That happened in production: two bookings 6ms apart from one payment.
  //
  // findOneAndUpdate matching on the pre-claim status is a single atomic
  // operation, so exactly one caller wins.
  //
  // The claim keys on status alone. It used to also require `booking` to be
  // unset, which was right when capture created the booking — but a payment
  // is now created against an already-approved booking, so that condition
  // could never match and every capture fell through to the loser branch,
  // returning the booking without ever confirming it.
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ['created', 'authorized'] } },
    { $set: { status: 'capturing' } },
    { new: true }
  );

  if (!claimed) {
    // Another request is mid-capture. Wait briefly for it to finish and
    // return its booking rather than creating a second one.
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const settled = await Payment.findById(payment._id);
      // Wait for the winner to finish, which means the payment reaching
      // 'captured' — not merely for a booking to exist, since it existed
      // before either request arrived.
      if (settled?.status === 'captured' && settled.booking) {
        const booking = await Booking.findById(settled.booking);
        if (booking) return { payment: settled, booking, created: false };
      }
    }
    throw ApiError.badRequest('This payment is still being processed. Check My Rentals in a moment.');
  }

  let booking;
  try {
    // The booking already exists — the owner approved it before payment was
    // possible — so capture confirms it rather than creating anything.
    booking = await Booking.findById(payment.booking);
    if (!booking) throw ApiError.notFound('Booking not found for this payment');

    if (booking.status === 'awaiting_payment') {
      booking.status = 'confirmed';
      await booking.save();
    } else if (booking.status !== 'confirmed') {
      // Anything else means the booking moved on (cancelled, or already in
      // progress). Capturing must not drag it backwards.
      throw ApiError.badRequest(`Booking is in '${booking.status}' state and cannot be confirmed`);
    }
  } catch (err) {
    // Release the claim so a retry is possible rather than the payment being
    // stuck in 'capturing' forever.
    await Payment.updateOne({ _id: payment._id }, { $set: { status: 'created' } });
    throw err;
  }

  payment.status = 'captured';
  payment.gatewayPaymentId = gatewayPaymentId;
  payment.signature = signature;
  payment.booking = booking._id;
  await payment.save();

  // Box F: the escrow hold itself is an auditable event. Without it the
  // trail shows money arriving and later leaving, with nothing recording
  // that it was held on someone's behalf in between.
  logAudit({
    action: 'escrow.held',
    category: 'payment',
    resourceType: 'booking',
    resourceId: booking._id.toString(),
    summary: 'Funds held in escrow',
    details: {
      rent: booking.subtotal,
      securityDeposit: booking.securityDeposit,
      platformFee: booking.serviceFee,
      total: booking.totalAmount,
    },
  });

  // ESCROW: the owner is NOT paid here. At capture the money is held —
  // rent until the rental starts, deposit until the item comes back. Paying
  // at capture would mean the owner has the rent before the renter has the
  // item, which is exactly what escrow exists to prevent.
  // Release happens in releaseRentToOwner (rental start) and
  // refundDepositToRenter (return confirmed).

  await notifyAdminsOfCapture(payment, booking);

  return { payment, booking, created: true };
}

// Revenue event: every first-time capture is announced to all admins so the
// dashboard doesn't have to be polled. Only runs when a booking was actually
// created (idempotent replays of the same order are skipped).
async function notifyAdminsOfCapture(payment, booking) {
  try {
    const User = require('../../models/User');
    const { notify } = require('../notifications/notifications.service');

    const [admins, listing, renter] = await Promise.all([
      User.find({ role: 'admin' }).select('_id'),
      require('../../models/Listing').findById(payment.listing).select('title'),
      User.findById(payment.payer).select('name'),
    ]);

    const listingTitle = listing ? listing.title : 'a listing';
    const renterName = renter ? renter.name : 'A user';
    const amount = payment.amount.toFixed(2);

    await Promise.all(
      admins.map((admin) =>
        notify(admin._id, {
          type: 'payment_captured',
          title: `New payment of ₹${amount} received`,
          body: `${renterName} paid for "${listingTitle}" (booking ${booking._id}). Revenue updated.`,
          link: '/admin/payments',
        })
      )
    );
  } catch {
    // Notification failures must never fail the payment capture itself.
  }
}


// --- Escrow release ---------------------------------------------------------

// Rent -> owner, once the rental has actually started. Idempotent: a second
// call is a no-op, so a retried request cannot pay the owner twice.
async function releaseRentToOwner(booking) {
  if (booking.escrow?.rentStatus === 'released') return { alreadyReleased: true };

  const payment = await Payment.findOne({ booking: booking._id, status: 'captured' });
  if (!payment) throw ApiError.badRequest('No captured payment for this booking');

  const payout = await settleOwnerPayout(payment, booking);

  // Only claim the rent is released if the transfer actually succeeded.
  //
  // Marking it 'released' on a failed payout makes the ledger assert money
  // moved when it did not, and — worse — the guard at the top of this
  // function then refuses to try again, so the owner is never paid and
  // nothing in the system says otherwise. With Cashfree Payouts not yet
  // activated every payout fails, so this would have silently written off
  // every owner's rent.
  // 'pending' and 'processing' are in flight at the gateway and will land,
  // so they count as released. Only an outright 'failed' does not.
  const settled = Boolean(payout) && payout.status !== 'failed';
  if (settled) {
    booking.escrow.rentStatus = 'released';
    booking.escrow.rentReleasedAt = new Date();
    await booking.save();
  }

  logAudit({
    action: 'escrow.rent_released',
    category: 'payment',
    resourceType: 'booking',
    resourceId: booking._id.toString(),
    summary: settled
      ? 'Rental amount released to the owner'
      : 'Rent release attempted but the payout did not go through',
    details: {
      amount: booking.subtotal,
      payout: payout?._id,
      payoutStatus: payout?.status,
      gatewayPayoutId: payout?.gatewayPayoutId || null,
    },
  });

  return { payout, amount: booking.subtotal, settled };
}

// Deposit -> renter, after the owner confirms the return. `deduction` is the
// amount withheld for damage, which only an admin resolving a dispute may
// set — an owner cannot deduct unilaterally.
async function refundDepositToRenter(booking, { deduction = 0, reason = null } = {}) {
  if (['refunded', 'partially_deducted', 'forfeited'].includes(booking.escrow?.depositStatus)) {
    return { alreadyProcessed: true };
  }

  const deposit = booking.securityDeposit || 0;
  if (deposit <= 0) {
    booking.escrow.depositStatus = 'refunded';
    booking.escrow.depositRefundedAt = new Date();
    await booking.save();
    return { refunded: 0 };
  }

  const withheld = Math.min(Math.max(deduction, 0), deposit);
  const refundAmount = deposit - withheld;

  const payment = await Payment.findOne({ booking: booking._id, status: 'captured' });
  let gatewayRefundId = null;

  let refundError = null;

  if (refundAmount > 0 && payment?.gatewayPaymentId && isGatewayConfigured()) {
    try {
      // Back to the original payment instrument, as the spec requires — the
      // renter should not have to supply bank details to get their own money.
      const refund = await cashfreeRequest('POST', `/pg/orders/${payment.gatewayOrderId}/refunds`, {
        refund_amount: refundAmount,
        refund_id: `dep_${booking._id}`,
        refund_note: reason || 'Security deposit refund',
        refund_speed: 'STANDARD',
      });
      gatewayRefundId = refund.cf_refund_id || refund.refund_id || null;
    } catch (err) {
      // A gateway failure must not be silent. Leaving the deposit 'held'
      // with nothing recorded is how a renter's money goes missing: the
      // admin's decision looks applied, the booking looks settled, and
      // nobody knows a refund was owed. Record it and re-throw so the
      // caller reports the failure rather than claiming success.
      refundError = err.message;
      logAudit({
        action: 'escrow.deposit_refund_failed',
        category: 'payment',
        resourceType: 'booking',
        resourceId: booking._id.toString(),
        summary: 'Security deposit refund failed at the gateway',
        details: {
          amount: refundAmount,
          orderId: payment.gatewayOrderId,
          error: refundError,
        },
      });
      throw ApiError.badRequest(`Deposit refund failed at the gateway: ${refundError}`);
    }
  }

  booking.escrow.depositStatus =
    withheld === 0 ? 'refunded' : withheld >= deposit ? 'forfeited' : 'partially_deducted';
  booking.escrow.depositRefundedAt = new Date();
  booking.escrow.depositDeducted = withheld;
  booking.escrow.depositDeductionReason = reason;
  await booking.save();

  logAudit({
    action: 'escrow.deposit_released',
    category: 'payment',
    resourceType: 'booking',
    resourceId: booking._id.toString(),
    summary:
      withheld === 0
        ? 'Security deposit refunded in full'
        : `Security deposit settled with a deduction of ${withheld}`,
    details: {
      depositHeld: deposit,
      refundedToRenter: refundAmount,
      deducted: withheld,
      reason,
      outcome: booking.escrow.depositStatus,
      gatewayRefundId,
    },
  });

  // A deduction is money the renter did not get back, so it is recorded as
  // its own event rather than only as a field on the refund entry.
  if (withheld > 0) {
    logAudit({
      action: 'escrow.deposit_deducted',
      category: 'payment',
      resourceType: 'booking',
      resourceId: booking._id.toString(),
      summary: `Deducted ${withheld} from the security deposit`,
      details: { deducted: withheld, of: deposit, reason },
    });
  }

  return { refunded: refundAmount, withheld, gatewayRefundId };
}

module.exports = {
  releaseRentToOwner,
  refundDepositToRenter,
  createCheckoutOrder,
  verifyPaymentByOrder,
  verifyWebhookSignature,
  markPaymentCaptured,
  settleOwnerPayout,
  Payout,
  PayoutSettings,
};