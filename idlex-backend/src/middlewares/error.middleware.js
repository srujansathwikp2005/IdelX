const ApiError = require('../utils/ApiError');

// Central error handler — every thrown/next(err) call in the app ends up
// here. Keeps response shape identical whether the error was an ApiError,
// a Mongoose validation error, or something unexpected.
function errorMiddleware(err, req, res, next) {
  let error = err;

  if (!(error instanceof ApiError)) {
    if (error.name === 'ValidationError') {
      error = ApiError.badRequest('Validation failed', error.errors);
    } else if (error.name === 'CastError') {
      error = ApiError.badRequest(`Invalid value for ${error.path}`);
    } else if (error.name === 'MulterError') {
      error = ApiError.badRequest(error.message);
    } else if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      error = ApiError.conflict(`${field || 'Field'} already exists`);
    } else {
      error = new ApiError(500, error.message || 'Internal server error');
    }
  }

  if (process.env.NODE_ENV !== 'production' && error.statusCode === 500) {
    console.error(err.stack);
  }

  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    code: error.code || undefined,
    details: error.details || undefined,
  });
}

function notFoundMiddleware(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

module.exports = { errorMiddleware, notFoundMiddleware };
