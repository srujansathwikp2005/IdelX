const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const SupportTicket = require('../../models/SupportTicket');

// Raise a ticket.
const createTicket = asyncHandler(async (req, res) => {
  const subject = String(req.body.subject || '').trim();
  const message = String(req.body.message || '').trim();
  if (!subject || !message) throw ApiError.badRequest('Subject and message are required');

  const ticket = await SupportTicket.create({ user: req.user._id, subject, message });
  return new ApiResponse(201, ticket, 'Support request submitted').send(res);
});

// The caller's own tickets, newest first.
const myTickets = asyncHandler(async (req, res) => {
  const tickets = await SupportTicket.find({ user: req.user._id })
    .sort('-createdAt')
    .populate('replies.author', 'name');
  return new ApiResponse(200, tickets, 'Your support requests').send(res);
});

// Reply. Both sides use this: an admin answering, or the user following up.
const replyToTicket = asyncHandler(async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message) throw ApiError.badRequest('Reply message is required');

  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw ApiError.notFound('Support request not found');

  const isAdmin = req.user.role === 'admin';
  // Anyone may reply to their own ticket; only an admin may reply to others'.
  if (!isAdmin && ticket.user.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('Not your support request');
  }

  ticket.replies.push({ author: req.user._id, isAdmin, message });
  // An admin reply answers it; a user reply reopens it, because a follow-up
  // means the original answer did not resolve the problem.
  ticket.status = isAdmin ? 'answered' : 'open';
  await ticket.save();

  await ticket.populate('replies.author', 'name');
  return new ApiResponse(200, ticket, 'Reply added').send(res);
});

// Admin: the whole queue, optionally filtered by status.
const listAllTickets = asyncHandler(async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  const tickets = await SupportTicket.find(filter)
    .sort('-createdAt')
    .populate('user', 'name email phone')
    .populate('replies.author', 'name');
  return new ApiResponse(200, tickets, 'Support requests').send(res);
});

// Admin: close a ticket without replying.
const closeTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findByIdAndUpdate(
    req.params.id,
    { status: 'closed' },
    { new: true }
  );
  if (!ticket) throw ApiError.notFound('Support request not found');
  return new ApiResponse(200, ticket, 'Support request closed').send(res);
});

module.exports = { createTicket, myTickets, replyToTicket, listAllTickets, closeTicket };
