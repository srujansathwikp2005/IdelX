const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const { isOnline } = require('../../sockets/chat.socket');
const User = require('../../models/User');
const { notify } = require('../notifications/notifications.service');

const listConversations = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({
    participants: req.user._id,
    hiddenFor: { $ne: req.user._id },
  })
    .sort('-lastMessageAt')
    // lastSeenAt comes along so the client can say when the other person was
    // last around without a second request per row.
    .populate('participants', 'name avatarUrl lastSeenAt')
    .populate('listing', 'title photos')
    .lean();

  // Unread counts in one aggregate rather than a query per thread — a list of
  // twenty conversations should not be twenty round trips.
  const ids = conversations.map((c) => c._id);
  const counts = await Message.aggregate([
    {
      $match: {
        conversation: { $in: ids },
        sender: { $ne: req.user._id },
        readBy: { $ne: req.user._id },
      },
    },
    { $group: { _id: '$conversation', n: { $sum: 1 } } },
  ]);
  const unreadByThread = new Map(counts.map((c) => [String(c._id), c.n]));

  const items = conversations.map((conversation) => ({
    ...conversation,
    unreadCount: unreadByThread.get(String(conversation._id)) || 0,
    participants: conversation.participants.map((p) => ({
      ...p,
      // Presence is held in memory by the socket layer, so it is answered
      // here rather than stored — a flag in the database would survive a
      // crash and leave people looking online forever.
      isOnline: isOnline(p._id),
    })),
  }));

  return new ApiResponse(200, items, 'Conversations').send(res);
});

const getMessages = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  const isParticipant = conversation.participants.some((p) => p.toString() === req.user._id.toString());
  if (!isParticipant) throw ApiError.forbidden('Not a participant in this conversation');

  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 30);

  const messages = await Message.find({ conversation: conversation._id })
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('sender', 'name avatarUrl');

  // Opening a thread is reading it.
  //
  // readBy has been on the Message model since the beginning and nothing ever
  // wrote to it, so an unread count could only grow — a thread stayed badged
  // no matter how many times it was opened. This was written once and lost
  // when the branch it lived on was replaced; it is the actual fix, and the
  // client refreshing its list faster only made the stale number arrive
  // sooner.
  await Message.updateMany(
    {
      conversation: conversation._id,
      sender: { $ne: req.user._id },
      readBy: { $ne: req.user._id },
    },
    { $addToSet: { readBy: req.user._id } }
  );

  return new ApiResponse(200, messages.reverse(), 'Message history').send(res);
});

// Start a conversation, or return the existing one. Idempotent by design:
// clicking "Message owner" twice must not create a second thread, and the
// participant pair plus listing is what makes two threads the same one.
const startConversation = asyncHandler(async (req, res) => {
  const { userId, listingId } = req.body;
  if (!userId) throw ApiError.badRequest('userId is required');
  if (userId === req.user._id.toString()) {
    throw ApiError.badRequest('You cannot start a conversation with yourself');
  }

  const other = await User.findById(userId).select('_id');
  if (!other) throw ApiError.notFound('User not found');

  const participants = [req.user._id, other._id];
  const filter = { participants: { $all: participants, $size: 2 } };
  if (listingId) filter.listing = listingId;

  let conversation = await Conversation.findOne(filter);
  if (!conversation) {
    conversation = await Conversation.create({
      participants,
      listing: listingId || undefined,
    });
  }

  await conversation.populate('participants', 'name avatarUrl');
  return new ApiResponse(200, conversation, 'Conversation ready').send(res);
});

// Send over HTTP. The socket path stays the primary route, but a message
// must not be lost when the websocket is unavailable — a corporate proxy,
// a flaky network, or simply a socket that has not finished connecting.
const sendMessage = asyncHandler(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) throw ApiError.badRequest('Message text is required');

  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  if (!conversation.participants.some((p) => p.toString() === req.user._id.toString())) {
    throw ApiError.forbidden('Not a participant in this conversation');
  }

  const message = await Message.create({
    conversation: conversation._id,
    sender: req.user._id,
    text,
  });

  conversation.lastMessage = text;
  conversation.lastMessageAt = new Date();
  // A new message un-hides the thread for everyone: if the recipient had
  // deleted their copy, sending into it must put it back in front of them,
  // or the message goes somewhere they cannot open.
  conversation.hiddenFor = [];
  await conversation.save();

  // Mirror the socket event so anyone already watching this thread sees the
  // message immediately, whichever path it arrived by.
  const io = req.app.get('io');
  if (io) io.to(`conversation:${conversation._id}`).emit('message:new', { conversationId: conversation._id });

  // Notify whoever is not the sender. A message was the one thing on the
  // platform that produced no notification at all: the socket event only
  // reaches someone already watching the thread, so a message sent while the
  // other person had the app closed was invisible until they went looking.
  //
  // Skipped when they are currently connected — a phone buzzing for a message
  // already open on screen is noise, and presence is tracked for exactly this.
  const online = req.app.get('onlineUsers');
  const recipients = conversation.participants.filter(
    (p) => p.toString() !== req.user._id.toString()
  );

  for (const recipient of recipients) {
    if (online && online(recipient.toString())) continue;
    // Not awaited: a message must not fail to send because a phone was
    // unreachable, and the socket event has already gone out.
    notify(recipient, {
      type: 'message',
      title: req.user.name || 'New message',
      // Trimmed: a notification tray is not the place for an essay, and the
      // full text is one tap away.
      body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
      link: `/messages/${conversation._id}`,
    }).catch((err) => console.error('[chat] notify failed:', err.message));
  }

  await message.populate('sender', 'name avatarUrl');
  return new ApiResponse(201, message, 'Message sent').send(res);
});


// A single conversation. The thread page fetches this for the header — who
// the other party is and which listing it concerns — and without it the
// page renders "Conversation" with no context at all.
const getConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id)
    .populate('participants', 'name avatarUrl')
    .populate('listing', 'title photos');
  if (!conversation) throw ApiError.notFound('Conversation not found');
  if (!conversation.participants.some((p) => p._id.toString() === req.user._id.toString())) {
    throw ApiError.forbidden('Not a participant in this conversation');
  }
  return new ApiResponse(200, conversation, 'Conversation').send(res);
});


// Removes a conversation from the caller's list. Their copy only — see the
// note on the model.
const deleteConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  if (!conversation.participants.some((p) => p.toString() === req.user._id.toString())) {
    throw ApiError.forbidden('Not a participant in this conversation');
  }

  await Conversation.updateOne(
    { _id: conversation._id },
    { $addToSet: { hiddenFor: req.user._id } }
  );

  return new ApiResponse(200, null, 'Conversation deleted').send(res);
});

module.exports = {
  getConversation, listConversations, getMessages, startConversation, sendMessage,
  deleteConversation };
