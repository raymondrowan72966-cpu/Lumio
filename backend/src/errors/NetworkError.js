import { AppError } from './AppError.js';

/** An outbound call to another service (email provider, OAuth provider, R2, etc.) failed. */
export class NetworkError extends AppError {
  constructor(message = 'A network error occurred.', details) {
    super(message, { status: 502, code: 'NETWORK_ERROR', details });
  }
}
