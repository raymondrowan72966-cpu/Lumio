import { AppError } from '../errors/index.js';
import { jsonResponse } from '../utils/response.js';

/**
 * Centralised error handling — every route handler's thrown error passes
 * through exactly this one place before becoming an HTTP response. A route
 * handler should never construct its own error Response for a failure case;
 * it should throw one of the typed errors in src/errors and let this
 * function decide the wire format.
 */
export function handleError(err, logger) {
  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger?.error(err.message, { code: err.code, details: err.details, stack: err.stack });
    } else {
      logger?.warning(err.message, { code: err.code, details: err.details });
    }
    return jsonResponse(err.toJSON(), { status: err.status });
  }

  // Anything else is an unexpected, unhandled exception — never leak its
  // message/stack to the caller; log it fully server-side instead.
  logger?.error('Unhandled exception', { error: String(err), stack: err?.stack });
  return jsonResponse(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
    { status: 500 },
  );
}
