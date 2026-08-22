const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const User = require('../../models/User');

const listConversations = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({ participants: req.user._id })
    .sort('-lastMessageAt')
    .populate('participants', 'name avatarUrl')
    .populate('listing', 'title photos');
  return new ApiResponse(200, conversations, 'Conversations').send(res);
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
  await conversation.save();

  // Mirror the socket event so anyone already watching this thread sees the
  // message immediately, whichever path it arrived by.
  const io = req.app.get('io');
  if (io) io.to(`conversation:${conversation._id}`).emit('message:new', { conversationId: conversation._id });

  await message.populate('sender', 'name avatarUrl');
  return new ApiResponse(201, message, 'Message sent').send(res);
});

module.exports = { listConversations, getMessages, startConversation, sendMessage };
