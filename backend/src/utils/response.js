/** Thin, consistent JSON response helpers — every route returns through one
 *  of these so headers/shape never drift between handlers. */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export function dataResponse(data, { status = 200, headers = {} } = {}) {
  return jsonResponse({ data }, { status, headers });
}

export function notImplemented(detail) {
  return jsonResponse(
    { error: { code: 'NOT_IMPLEMENTED', message: 'This endpoint is not implemented yet.', details: detail } },
    { status: 501 },
  );
}

export function notFound(message = 'Not found.') {
  return jsonResponse({ error: { code: 'NOT_FOUND', message } }, { status: 404 });
}
