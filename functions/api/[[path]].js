/**
 * Cloudflare Pages Function — API proxy
 *
 * Routes every /api/* request from the Pages frontend to the lumio-api
 * Worker, stripping the /api prefix before forwarding. The browser sees
 * a single origin (lumio-6kn.pages.dev) for both static assets and API
 * calls, which makes HttpOnly SameSite=Lax cookies work without any
 * cross-origin workarounds.
 *
 * Path mapping:
 *   GET  /api/health            → Worker  GET  /health
 *   POST /api/auth/register     → Worker  POST /auth/register
 *   POST /api/auth/login        → Worker  POST /auth/login
 *   (all other /api/* paths follow the same pattern)
 *
 * This function does not modify request or response bodies, headers, or
 * status codes — it is a transparent proxy. CORS headers are not needed
 * because the request never leaves the same origin from the browser's
 * perspective.
 */

const WORKER_ORIGIN = 'https://lumio-api.raymondrowan72966.workers.dev';

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Strip the /api prefix: /api/health → /health, /api/auth/login → /auth/login.
  // The replace produces an empty string for a bare /api request; fall back
  // to / so the Worker always receives a valid pathname.
  const workerPath = url.pathname.replace(/^\/api/, '') || '/';
  const targetUrl = `${WORKER_ORIGIN}${workerPath}${url.search}`;

  // new Request(url, init) copies method, headers, and body from the original
  // request. The Fetch API automatically sets the correct Host header for the
  // target origin, so the Worker sees lumio-api.raymondrowan72966.workers.dev
  // as the Host rather than the Pages domain.
  return fetch(new Request(targetUrl, context.request));
}
