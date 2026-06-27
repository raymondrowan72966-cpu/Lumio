import { AppError } from './AppError.js';

/**
 * A duplicate-resource conflict — an attempt to register an email address
 * already attached to an existing account. Per the API Standards rule
 * ("duplicate resources are not malformed requests, they are resource
 * conflicts"), this is a 409 Conflict, not a 400 Bad Request — it
 * extends AppError directly rather than ValidationError, since
 * ValidationError is hardcoded to 400 and 400 is not the correct status
 * for this case. The distinct class still exists for the same reason as
 * before: callers can check `instanceof DuplicateEmailError`/`error.code`
 * rather than string-matching a message, regardless of whether it was
 * caught from a pre-check read or from the database's UNIQUE constraint
 * itself (see DECISIONS.md ADR-015 for why the constraint, not the
 * pre-check, is the authoritative source of truth here).
 */
export class DuplicateEmailError extends AppError {
  constructor(message = 'An account with this email address already exists.', details) {
    super(message, { status: 409, code: 'DUPLICATE_EMAIL', details });
    this.name = 'DuplicateEmailError';
  }
}
