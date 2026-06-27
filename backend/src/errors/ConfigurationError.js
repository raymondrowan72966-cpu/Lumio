import { AppError } from './AppError.js';

/** The Worker's environment/bindings are missing or malformed — a deploy-time
 *  problem, never something a caller's request could have triggered. */
export class ConfigurationError extends AppError {
  constructor(message = 'Server is misconfigured.', details) {
    super(message, { status: 500, code: 'CONFIGURATION_ERROR', details });
  }
}
