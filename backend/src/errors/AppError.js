/**
 * Base class for every error this backend throws deliberately (as opposed to
 * an unexpected runtime exception). Carries an HTTP status and a stable
 * machine-readable `code` so route handlers and the central error handler
 * never need to pattern-match on error message text.
 */
export class AppError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details = undefined } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}
