const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const service = require('./settings.service');
const { logAudit } = require('../../utils/audit');

const getSettings = asyncHandler(async (req, res) => {
  const manualPayment = await service.getManualPaymentSettings();
  return new ApiResponse(200, { manualPayment }).send(res);
});

const updateManualPayment = asyncHandler(async (req, res) => {
  const before = await service.getManualPaymentSettings();
  await service.updateManualPaymentSettings(req.body, req.user._id);
  const after = await service.getManualPaymentSettings();

  // Worth a trail entry: this decides where every renter's money goes, so
  // "who changed the account, and when" should be answerable later.
  logAudit({
    actor: req.user._id,
    action: 'admin.payment_settings_updated',
    category: 'payment',
    resourceType: 'PlatformSettings',
    summary: `Payment settings updated (${after.upiId ?? 'no UPI ID'})`,
    details: {
      from: { upiId: before.upiId, payeeName: before.payeeName, supportsIntent: before.supportsIntent },
      to: { upiId: after.upiId, payeeName: after.payeeName, supportsIntent: after.supportsIntent },
    },
    req,
  });

  return new ApiResponse(200, { manualPayment: after }, 'Payment settings saved').send(res);
});

module.exports = { getSettings, updateManualPayment };
