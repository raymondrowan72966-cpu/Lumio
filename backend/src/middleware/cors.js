/**
 * CORS middleware — three focused functions that are composed in index.js.
 *
 * Design constraints:
 *  - Never reflect '*' as Access-Control-Allow-Origin when credentials are
 *    involved (Access-Control-Allow-Credentials: true). Browsers reject that
 *    combination and it would expose session cookies to any origin.
 *  - Reflect the request Origin only if it appears in the configured
 *    allow-list. Requests from un-allowed origins receive no ACAO header and
 *    are blocked by the browser.
 *  - Always emit Vary: Origin so CDN edges and reverse proxies never serve a
 *    response with a reflected origin to a different caller.
 *  - Same-origin browser requests (via the Pages /api/* proxy) never send an
 *    Origin header, so they are entirely unaffected by this middleware —
 *    buildCorsHeaders will return no ACAO header for them, which is correct.
 *  - Non-browser API clients (curl, Postman, native apps) bypass CORS
 *    entirely because they are not browsers — this middleware does not
 *    interfere with them.
 */

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Authorization';
// 86 400 s = 24 hours — browsers cache the preflight result for this long,
// reducing the number of OPTIONS round-trips per session.
const PREFLIGHT_MAX_AGE = '86400';

/**
 * Returns a plain-object header set for the given request.
 * The ACAO header is only included when the request's Origin is in the
 * allow-list; callers must not assume it is always present.
 *
 * @param {Request} request
 * @param {string[]} allowedOrigins   - e.g. ['https://lumio-6kn.pages.dev']
 * @returns {Record<string, string>}
 */
export function buildCorsHeaders(request, allowedOrigins) {
  const origin = request.headers.get('origin');

  const headers = {
    'access-control-allow-methods': ALLOWED_METHODS,
    'access-control-allow-headers': ALLOWED_HEADERS,
    'access-control-allow-credentials': 'true',
    // Required whenever ACAO is dynamic — prevents caches from serving a
    // reflected-origin response to a different caller.
    'vary': 'Origin',
  };

  if (origin && Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) {
    headers['access-control-allow-origin'] = origin;
  }

  return headers;
}

/**
 * Handles a CORS preflight (OPTIONS) request.
 * Returns 204 No Content — no body, no route handler needed.
 *
 * @param {Record<string, string>} corsHeaders - from buildCorsHeaders()
 * @returns {Response}
 */
export function handlePreflight(corsHeaders) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      // Extra preflight-only header: tells browsers how long to cache this
      // preflight result. Not emitted on non-OPTIONS responses.
      'access-control-max-age': PREFLIGHT_MAX_AGE,
    },
  });
}

/**
 * Clones a Response, merging the CORS headers into its header set.
 * The original Response body stream is consumed by this function — do not
 * attempt to read or re-use the original after calling applyCorsHeaders.
 *
 * If corsHeaders is empty (e.g. config failed to load), the response is
 * returned unchanged rather than erroring.
 *
 * @param {Response} response
 * @param {Record<string, string>} corsHeaders - from buildCorsHeaders()
 * @returns {Response}
 */
export function applyCorsHeaders(response, corsHeaders) {
  if (!corsHeaders || Object.keys(corsHeaders).length === 0) return response;

  const next = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    next.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: next,
  });
}
