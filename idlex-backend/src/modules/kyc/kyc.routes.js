const express = require('express');
const controller = require('./kyc.controller');
const { protect } = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');

const router = express.Router();

// Above the auth guard on purpose: the signed link in the query string is
// the authorisation here, because an <img> cannot carry a bearer token.
router.get('/file/:filename', controller.getKycFile);

router.use(protect);
router.get('/', controller.getMyKyc);
router.post(
  '/submit',
  // kyc.fields, not upload.fields: identity documents go to the private
  // directory, which nothing serves statically.
  upload.kyc.fields([
    { name: 'file', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
  ]),
  controller.submitKyc
);

module.exports = router;