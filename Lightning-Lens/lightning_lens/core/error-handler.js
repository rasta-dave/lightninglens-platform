/**
 * error-handler.js - Standardized error handling for Lightning Lens
 *
 * Provides consistent error handling, error response formatting,
 * and error logging across all Lightning Lens services.
 */

const { createLogger } = require('./logger');

// Create a logger for error handling
const logger = createLogger({ serviceName: 'error-handler' });

// Define standard error types
const ERROR_TYPES = {
  VALIDATION: 'validation_error',
  NOT_FOUND: 'not_found',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  INTERNAL: 'internal_error',
  NETWORK: 'network_error',
  TIMEOUT: 'timeout',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  BAD_REQUEST: 'bad_request',
  REQUEST_FAILED: 'request_failed',
  PARSE_ERROR: 'parse_error',
  DATABASE_ERROR: 'database_error',
  CONFIG_ERROR: 'configuration_error',
};

// Map error types to HTTP status codes
const ERROR_STATUS_CODES = {
  [ERROR_TYPES.VALIDATION]: 400,
  [ERROR_TYPES.NOT_FOUND]: 404,
  [ERROR_TYPES.UNAUTHORIZED]: 401,
  [ERROR_TYPES.FORBIDDEN]: 403,
  [ERROR_TYPES.INTERNAL]: 500,
  [ERROR_TYPES.NETWORK]: 503,
  [ERROR_TYPES.TIMEOUT]: 504,
  [ERROR_TYPES.SERVICE_UNAVAILABLE]: 503,
  [ERROR_TYPES.BAD_REQUEST]: 400,
  [ERROR_TYPES.REQUEST_FAILED]: 400,
  [ERROR_TYPES.PARSE_ERROR]: 400,
  [ERROR_TYPES.DATABASE_ERROR]: 500,
  [ERROR_TYPES.CONFIG_ERROR]: 500,
};

/**
 * LightningError - Standard error object for Lightning Lens
 * @extends Error
 */
class LightningError extends Error {
  /**
   * Create a standardized LightningError
   * @param {string} message Error message
   * @param {string} type Error type from ERROR_TYPES
   * @param {Object} details Additional error details
   * @param {Error} originalError Original error if this is wrapping an error
   */
  constructor(
    message,
    type = ERROR_TYPES.INTERNAL,
    details = {},
    originalError = null
  ) {
    super(message);

    this.name = 'LightningError';
    this.type = ERROR_TYPES[type] ? type : ERROR_TYPES.INTERNAL;
    this.statusCode = ERROR_STATUS_CODES[this.type] || 500;
    this.details = details || {};
    this.timestamp = new Date().toISOString();
    this.requestId = details.requestId || null;
    this.originalError = originalError;

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LightningError);
    }

    // Add original error stack if available
    if (originalError && originalError.stack) {
      this.originalStack = originalError.stack;
    }
  }

  /**
   * Convert error to a JSON object for API responses
   * @param {boolean} includeStack Whether to include stack trace
   * @returns {Object} Error as a plain object
   */
  toJSON(includeStack = false) {
    const errorObject = {
      error: {
        message: this.message,
        type: this.type,
        timestamp: this.timestamp,
      },
    };

    if (Object.keys(this.details).length > 0) {
      errorObject.error.details = this.details;
    }

    if (this.requestId) {
      errorObject.error.requestId = this.requestId;
    }

    if (includeStack) {
      errorObject.error.stack = this.stack;
      if (this.originalStack) {
        errorObject.error.originalStack = this.originalStack;
      }
    }

    return errorObject;
  }

  /**
   * Log this error using the logger
   * @param {Object} logger Logger instance
   */
  log(customLogger = null) {
    const errorLogger = customLogger || logger;

    errorLogger.error(`${this.type}: ${this.message}`, {
      errorType: this.type,
      details: this.details,
      requestId: this.requestId,
      originalError: this.originalError
        ? {
            message: this.originalError.message,
            name: this.originalError.name,
          }
        : null,
      stack: this.stack,
    });

    return this;
  }
}

/**
 * Create specialized error instances for common error types
 */
function createErrorFactory(type) {
  return (message, details = {}, originalError = null) => {
    return new LightningError(message, type, details, originalError);
  };
}

// Create factory functions for each error type
const ValidationError = createErrorFactory(ERROR_TYPES.VALIDATION);
const NotFoundError = createErrorFactory(ERROR_TYPES.NOT_FOUND);
const UnauthorizedError = createErrorFactory(ERROR_TYPES.UNAUTHORIZED);
const ForbiddenError = createErrorFactory(ERROR_TYPES.FORBIDDEN);
const InternalError = createErrorFactory(ERROR_TYPES.INTERNAL);
const NetworkError = createErrorFactory(ERROR_TYPES.NETWORK);
const TimeoutError = createErrorFactory(ERROR_TYPES.TIMEOUT);
const ServiceUnavailableError = createErrorFactory(
  ERROR_TYPES.SERVICE_UNAVAILABLE
);
const BadRequestError = createErrorFactory(ERROR_TYPES.BAD_REQUEST);
const RequestFailedError = createErrorFactory(ERROR_TYPES.REQUEST_FAILED);
const ParseError = createErrorFactory(ERROR_TYPES.PARSE_ERROR);
const DatabaseError = createErrorFactory(ERROR_TYPES.DATABASE_ERROR);
const ConfigError = createErrorFactory(ERROR_TYPES.CONFIG_ERROR);

/**
 * Create Express middleware for handling errors
 * @param {Object} options Error handling options
 * @returns {Function} Express error handler middleware
 */
function createErrorHandler(options = {}) {
  const defaultOptions = {
    logErrors: true,
    includeStackInResponse: process.env.NODE_ENV !== 'production',
    fallbackMessage: 'An unexpected error occurred',
    logger: null,
  };

  const opts = { ...defaultOptions, ...options };
  const errorLogger = opts.logger || logger;

  return (err, req, res, next) => {
    // Add request ID if available
    const requestId = req.id || req.headers['x-request-id'] || null;

    // Handle LightningError objects
    if (err instanceof LightningError) {
      if (opts.logErrors) {
        // Add request info to error details
        err.details.url = req.originalUrl || req.url;
        err.details.method = req.method;
        err.requestId = requestId;
        err.log(errorLogger);
      }

      return res
        .status(err.statusCode)
        .json(err.toJSON(opts.includeStackInResponse));
    }

    // Convert other errors to LightningError
    const lightningError = new LightningError(
      err.message || opts.fallbackMessage,
      ERROR_TYPES.INTERNAL,
      {
        url: req.originalUrl || req.url,
        method: req.method,
      },
      err
    );

    // Set request ID if available
    if (requestId) {
      lightningError.requestId = requestId;
    }

    if (opts.logErrors) {
      lightningError.log(errorLogger);
    }

    return res
      .status(lightningError.statusCode)
      .json(lightningError.toJSON(opts.includeStackInResponse));
  };
}

/**
 * Wrap a function to catch errors and convert them to LightningErrors
 * @param {Function} fn Function to wrap
 * @param {string} errorType Default error type
 * @param {string} fallbackMessage Fallback error message
 * @returns {Function} Wrapped function
 */
function catchErrors(
  fn,
  errorType = ERROR_TYPES.INTERNAL,
  fallbackMessage = 'Operation failed'
) {
  return async function (...args) {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof LightningError) {
        throw error;
      } else {
        throw new LightningError(
          error.message || fallbackMessage,
          errorType,
          {},
          error
        );
      }
    }
  };
}

// Export error handling utilities
module.exports = {
  LightningError,
  ERROR_TYPES,
  ERROR_STATUS_CODES,
  createErrorHandler,
  catchErrors,

  // Factory functions for common error types
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  InternalError,
  NetworkError,
  TimeoutError,
  ServiceUnavailableError,
  BadRequestError,
  RequestFailedError,
  ParseError,
  DatabaseError,
  ConfigError,
};
