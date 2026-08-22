const express = require('express');
const controller = require('./chat.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);
// Frontend fetches these on page load, then upgrades to the socket
// connection (see src/sockets/chat.socket.js) for live updates —
// same REST-then-socket pattern the Django doc lays out for Channels.
router.get('/conversations', controller.listConversations);
router.get('/conversations/:id/messages', controller.getMessages);
// Creating a thread and sending over HTTP. Both were missing: conversations
// could be listed but never started, and the client's non-socket path posted
// to a route that did not exist, silently discarding the message.
router.post('/conversations', controller.startConversation);
router.post('/conversations/:id/messages', controller.sendMessage);

module.exports = router;
