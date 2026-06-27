import { AppError } from './AppError.js';

/** Caller-supplied input failed validation (shape, format, missing fields). */
export class ValidationError extends AppError {
  constructor(message = 'Invalid request.', details) {
    super(message, { status: 400, code: 'VALIDATION_ERROR', details });
  }
}
