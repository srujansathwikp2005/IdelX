const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const env = require('../../config/env');
const paymentsService = require('./payments.service');
const { Payout, PayoutSettings } = require('../../models/Payout');
const { logAudit } = require('../../utils/audit');

// Step 1 of the pay-first flow: create a Cashfree order for the listing +
// dates. The client opens Cashfree Checkout with the returned
// payment_session_id, then calls /verify once the payment completes.
const checkout = asyncHandler(async (req, res) => {
  const { listingId, startDate, endDate } = req.body;
  if (!listingId || !startDate || !endDate) {
    throw ApiError.badRequest('listingId, startDate and endDate are required');
  }

  const { payment, configured, paymentSessionId } = await paymentsService.createCheckoutOrder(req.user._id, {
    listingId,
    startDate,
    endDate,
  });

  logAudit({
    actor: req.user._id,
    action: 'payment.intent_created',
    category: 'payment',
    resourceType: 'payment',
    resourceId: payment._id?.toString(),
    summary: 'Initiated a payment',
    details: { listing: listingId, amount: payment.amount, status: payment.status, configured },
    req,
  });

  return new ApiResponse(
    201,
    {
      paymentId: payment._id,
      orderId: payment.gatewayOrderId,
      amount: payment.amount,
      currency: payment.currency,
      gateway: payment.gateway,
      // What the browser SDK needs to open checkout. Replaces Razorpay's
      // keyId + order_id pair — Cashfree scopes the session to one order.
      paymentSessionId,
      // 'sandbox' or 'production': the SDK must be initialised with the same
      // mode the order was created in, or the session is rejected.
      mode: env.cashfree.mode,
      configured,
    },
    'Payment order created'
  ).send(res);
});

// Step 2 of the pay-first flow: confirm with Cashfree that the order was
// the checkout popup, then materialise the booking (status 'requested')
// and notify the owner. Idempotent — safe to call again after a network
// blip, the same order returns the already-created booking.
const verify = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) throw ApiError.badRequest('orderId is required');

  // The gateway is the source of truth. Rather than trusting a signature the
  // browser hands us, ask Cashfree what happened to this order — a forged
  // callback cannot make an unpaid order report SUCCESS.
  const result = await paymentsService.verifyPaymentByOrder(orderId);
  if (!result.paid) throw ApiError.badRequest(result.reason || 'Payment was not completed');

  const { booking, created } = await paymentsService.markPaymentCaptured({
    gatewayOrderId: orderId,
    gatewayPaymentId: result.gatewayPaymentId,
    signature: 'verified-by-gateway',
  });

  logAudit({
    actor: req.user._id,
    action: 'payment.verified',
    category: 'payment',
    resourceType: 'payment',
    resourceId: booking._id.toString(),
    summary: created ? 'Payment captured — booking requested' : 'Payment already captured',
    details: { orderId, paymentId, booking: booking._id },
    req,
  });

  return new ApiResponse(
    200,
    booking,
    created ? 'Payment verified — booking requested' : 'Booking already confirmed for this payment'
  ).send(res);
});

const listPayoutHistory = asyncHandler(async (req, res) => {
  const payouts = await Payout.find({ owner: req.user._id }).sort('-createdAt');
  return new ApiResponse(200, payouts, "Owner's payout history").send(res);
});

const getPayoutSettings = asyncHandler(async (req, res) => {
  const settings = await PayoutSettings.findOne({ owner: req.user._id });
  return new ApiResponse(200, settings, 'Payout settings').send(res);
});

const updatePayoutSettings = asyncHandler(async (req, res) => {
  const settings = await PayoutSettings.findOneAndUpdate(
    { owner: req.user._id },
    { $set: { ...req.body, owner: req.user._id } },
    { upsert: true, new: true }
  );
  return new ApiResponse(200, settings, 'Payout settings updated').send(res);
});

// Gateway webhook receiver — not user-facing, no auth middleware, verified
// by signature instead. Mounted on raw body (see app.js). Backup path:
// if the client never reaches /verify, the captured event still creates
// the booking.
const handleWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  const valid = paymentsService.verifyWebhookSignature(req.rawBody, signature, timestamp);
  if (!valid) throw ApiError.badRequest('Invalid webhook signature');

  // Cashfree names the success event PAYMENT_SUCCESS_WEBHOOK and nests the
  // entities one level deeper than Razorpay did.
  const { type, data } = req.body;
  if (type === 'PAYMENT_SUCCESS_WEBHOOK') {
    const gatewayPayment = data?.payment || {};
    const gatewayOrder = data?.order || {};

    const result = await paymentsService.markPaymentCaptured({
      gatewayOrderId: gatewayOrder.order_id,
      gatewayPaymentId: String(gatewayPayment.cf_payment_id || ''),
      signature: 'verified-by-webhook',
    });

    // No session user here — the webhook is gateway-authenticated, so the
    // audit log has a null actor but still lands in the activity trail.
    logAudit({
      action: 'payment.captured',
      category: 'payment',
      resourceType: 'payment',
      resourceId: gatewayOrder.order_id || null,
      summary: 'Payment captured via gateway webhook',
      details: { orderId: gatewayOrder.order_id, paymentId: gatewayPayment.cf_payment_id, booking: result.booking?._id },
      req,
    });
  }

  res.status(200).json({ received: true });
});

module.exports = { checkout, verify, listPayoutHistory, getPayoutSettings, updatePayoutSettings, handleWebhook };