// Standard shape for every operational error thrown across the app.
// Controllers throw this (or call next(new ApiError(...))) and the
// central error middleware turns it into a consistent JSON response.
class ApiError extends Error {
  // `code` is for the client to branch on. Apps were matching on the
  // English message to decide whether to offer a "Go to KYC" button, which
  // breaks the moment the copy is reworded.
  constructor(statusCode, message, details = null, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }
  static unauthorized(message = 'Not authenticated') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'Not allowed to perform this action', details, code) {
    return new ApiError(403, message, details, code);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }
  
  static conflict(message) {
    return new ApiError(409, message);
  }
}

module.exports = ApiError;
