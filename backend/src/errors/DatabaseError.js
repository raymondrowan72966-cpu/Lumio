import { AppError } from './AppError.js';

/** A D1 query/transaction failed, or returned a shape the caller didn't expect. */
export class DatabaseError extends AppError {
  constructor(message = 'A database error occurred.', details) {
    super(message, { status: 500, code: 'DATABASE_ERROR', details });
  }
}
