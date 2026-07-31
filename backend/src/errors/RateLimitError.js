import { AppError } from './AppError.js';

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, { status: 429, code: 'RATE_LIMITED' });
  }
}
