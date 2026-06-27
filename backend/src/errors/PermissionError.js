import { AppError } from './AppError.js';

/** Caller is authenticated but not authorized for this action/resource. */
export class PermissionError extends AppError {
  constructor(message = 'You do not have permission to perform this action.', details) {
    super(message, { status: 403, code: 'PERMISSION_ERROR', details });
  }
}
