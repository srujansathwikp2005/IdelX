const express = require('express');
const controller = require('./support.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Everything here needs a signed-in user: a ticket belongs to someone.
router.use(protect);

router.post('/', controller.createTicket);
router.get('/mine', controller.myTickets);
router.post('/:id/replies', controller.replyToTicket);

module.exports = router;
