/** Thin, consistent JSON response helpers — every route returns through one
 *  of these so headers/shape never drift between handlers. */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

/**
 * @param {*}      body
 * @param {{ status?: number, headers?: object, cookies?: string[] }} [opts]
 *   cookies — array of Set-Cookie header values; supports multiple cookies
 *   (a plain object key can hold only one Set-Cookie value, so this is the
 *   canonical way to set two cookies, e.g. lumio_access + lumio_session).
 */
export function jsonResponse(body, { status = 200, headers = {}, cookies = [] } = {}) {
  const res = new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
  for (const cookie of cookies) {
    res.headers.append('Set-Cookie', cookie);
  }
  return res;
}

export function dataResponse(data, opts = {}) {
  return jsonResponse({ data }, opts);
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
