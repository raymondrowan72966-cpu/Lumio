/** Logs one INFO line per request (method, path, status, duration) — the
 *  only place request-level logging happens, so no route handler needs its
 *  own ad-hoc console.log. */
export function logRequest(logger, request, response, startedAt) {
  const url = new URL(request.url);
  logger.info('request completed', {
    method: request.method,
    path: url.pathname,
    status: response.status,
    durationMs: Date.now() - startedAt,
  });
}
