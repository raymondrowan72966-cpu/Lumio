/** Every request gets a stable id, used to correlate all log lines for that
 *  request and (later) returned to the caller for support purposes. */
export function generateRequestId() {
  return crypto.randomUUID();
}
