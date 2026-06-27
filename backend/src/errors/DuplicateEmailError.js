import { ValidationError } from './ValidationError.js';

/**
 * A specific, identifiable case of ValidationError — an attempt to use an
 * email address already attached to an existing account. Kept as a
 * ValidationError subclass (same 400 status) rather than a sibling of
 * AppError, since it genuinely IS a validation failure of the caller's
 * input; the separate class exists so callers can distinguish this exact
 * case via `instanceof`/`error.code` rather than string-matching a
 * message, regardless of whether it was caught from a pre-check read or
 * from the database's UNIQUE constraint itself (see
 * DECISIONS.md for why the constraint, not the pre-check, is the
 * authoritative source of truth here).
 */
export class DuplicateEmailError extends ValidationError {
  constructor(message = 'An account with this email already exists.', details) {
    super(message, details);
    this.name = 'DuplicateEmailError';
    this.code = 'DUPLICATE_EMAIL';
  }
}
