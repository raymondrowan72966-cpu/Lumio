import { AppError } from './AppError.js';

/** Identity could not be established (missing/invalid/expired credentials or token). */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required.', details) {
    super(message, { status: 401, code: 'AUTHENTICATION_ERROR', details });
  }
}
