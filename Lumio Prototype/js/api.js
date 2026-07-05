/**
 * LumioAPI — the ONLY communication boundary between the frontend and the
 * backend Worker. No screen, component, or helper may call fetch() directly
 * to the Worker. All HTTP is routed through this module.
 *
 * Architecture: vanilla JS IIFE exposed as a global, consistent with the
 * zero-build, no-module-system frontend architecture. Requests go to the
 * same-origin /api/* path, which the Cloudflare Pages Function proxies to
 * the Worker (stripping the /api prefix) — no cross-origin requests from
 * the browser.
 *
 * Error model: every method throws an ApiError on non-2xx responses.
 * Callers catch ApiError to read { status, code, message } and present
 * appropriate UI feedback. Network failures throw the native TypeError from
 * fetch() unchanged.
 *
 * Service namespaces currently exposed:
 *   LumioAPI.health   — infrastructure health check
 *   LumioAPI.auth     — registration (POST /auth/register); login/logout/etc.
 *                       are stubs until a later sprint
 *   LumioAPI.workspaces, .projects, .courses, .lessons,
 *   .assets, .users, .invitations — stubs; populated as backend routes ship
 */
const LumioAPI = (function () {
  'use strict';

  const BASE = '/api';

  // -------------------------------------------------------------------------
  // ApiError — thrown on every non-2xx response so callers have a typed
  // signal to distinguish backend rejections from network failures.
  // -------------------------------------------------------------------------
  function ApiError(status, code, message, details) {
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'UNKNOWN';
    this.message = message || 'An unexpected error occurred.';
    this.details = details || null;
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  // -------------------------------------------------------------------------
  // Internal HTTP client
  // -------------------------------------------------------------------------

  // Guard against concurrent refresh calls — only one POST /auth/refresh is
  // issued even if multiple requests get 401 TOKEN_EXPIRED simultaneously.
  var _refreshPromise = null;

  /**
   * Core fetch wrapper. Always sends/expects JSON. Throws ApiError on
   * non-2xx. Returns the parsed `data` field from the standard envelope
   * { ok, data } on success, or the full parsed body when the backend
   * returns a non-standard shape (e.g. the health endpoint).
   *
   * Automatic token refresh: when the server returns 401 TOKEN_EXPIRED
   * (access JWT expired), this function transparently calls POST /auth/refresh
   * to rotate the tokens and then retries the original request once.
   * The retry is invisible to callers — they receive either the successful
   * response or, if the refresh itself fails (session fully expired), the
   * 401 from the refresh endpoint.
   *
   * @param {string}  method
   * @param {string}  path      - relative to BASE, e.g. '/health'
   * @param {*}       [body]    - serialised to JSON when present
   * @param {boolean} [_retry]  - internal; prevents infinite retry loops
   * @returns {Promise<*>}
   */
  async function request(method, path, body, _retry) {
    const init = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(BASE + path, init);

    let parsed;
    try {
      parsed = await response.json();
    } catch (_) {
      parsed = null;
    }

    if (!response.ok) {
      const err = parsed && parsed.error ? parsed.error : {};

      // Automatic token refresh: intercept TOKEN_EXPIRED once per request.
      // Skip if this is already the retry (prevents infinite loops) or if
      // this IS the refresh request itself.
      if (
        response.status === 401 &&
        err.code === 'TOKEN_EXPIRED' &&
        !_retry &&
        path !== '/auth/refresh'
      ) {
        try {
          // Coalesce concurrent refresh calls into one shared Promise.
          if (!_refreshPromise) {
            _refreshPromise = request('POST', '/auth/refresh', undefined, true)
              .finally(function () { _refreshPromise = null; });
          }
          await _refreshPromise;
          // Retry the original request with the new cookies now in place.
          return request(method, path, body, true);
        } catch (_refreshErr) {
          // Refresh failed (session fully expired) — propagate so the
          // DOMContentLoaded handler can redirect to #/login.
          throw new ApiError(
            _refreshErr.status || 401,
            _refreshErr.code || 'AUTHENTICATION_ERROR',
            _refreshErr.message || 'Session expired. Please sign in again.',
            _refreshErr.details || null,
          );
        }
      }

      throw new ApiError(response.status, err.code, err.message, err.details);
    }

    if (parsed && Object.prototype.hasOwnProperty.call(parsed, 'data')) {
      return parsed.data;
    }
    return parsed;
  }

  function get(path) { return request('GET', path); }
  function post(path, body) { return request('POST', path, body); }

  // -------------------------------------------------------------------------
  // Stub factory — raises a clear error for unimplemented service methods
  // so callers learn immediately which sprint they are blocked on, rather
  // than receiving a cryptic "not a function" message.
  // -------------------------------------------------------------------------
  function notImplemented(label) {
    return function () {
      throw new Error('LumioAPI.' + label + ' is not implemented yet.');
    };
  }

  // -------------------------------------------------------------------------
  // health
  // -------------------------------------------------------------------------
  var health = {
    /** GET /health — returns { status, timestamp } */
    check: function () { return get('/health'); },
  };

  // -------------------------------------------------------------------------
  // auth
  // -------------------------------------------------------------------------
  var auth = {
    /**
     * Register a new Workspace Owner via email + password.
     * Server sets an HttpOnly session cookie on success.
     *
     * @param {{ email: string, password: string, firstName: string, lastName?: string }} opts
     * @returns {Promise<{ user, workspace, membership }>}
     * @throws {ApiError} 409 duplicate email · 400 validation
     */
    register: function (opts) {
      return post('/auth/register', opts);
    },

    /**
     * Sign in with email + password.
     * Server sets an HttpOnly session cookie on success.
     *
     * @param {{ email: string, password: string, rememberMe?: boolean }} opts
     * @returns {Promise<{ user, workspace, membership }>}
     * @throws {ApiError} 401 invalid credentials · 400 validation
     */
    login: function (opts) {
      return post('/auth/login', opts);
    },

    /**
     * Sign out the current session.
     * Server revokes the session and clears the cookie.
     *
     * @returns {Promise<{ ok: true }>}
     */
    logout: function () {
      return post('/auth/logout');
    },

    /**
     * Restore an existing session from the server-managed cookie.
     * Returns the authenticated context if a valid session cookie exists.
     * Throws ApiError(401) when there is no session or it has expired.
     *
     * @returns {Promise<{ user, workspace, membership }>}
     * @throws {ApiError} 401 no active session
     */
    session: function () {
      return get('/auth/session');
    },

    /**
     * Rotate the refresh token and issue a new access JWT.
     * Called automatically by the request() retry loop — callers should not
     * need to invoke this directly.
     *
     * @returns {Promise<{ ok: true }>}
     * @throws {ApiError} 401 if the refresh token is also expired / invalid
     */
    refresh: function () { return post('/auth/refresh'); },
    requestPasswordReset: notImplemented('auth.requestPasswordReset'),
    confirmPasswordReset: notImplemented('auth.confirmPasswordReset'),
  };

  // -------------------------------------------------------------------------
  // Remaining service stubs — populated as backend routes are implemented.
  // -------------------------------------------------------------------------
  var workspaces = {
    get:           notImplemented('workspaces.get'),
    update:        notImplemented('workspaces.update'),
    listMembers:   notImplemented('workspaces.listMembers'),
    addMember:     notImplemented('workspaces.addMember'),
    removeMember:  notImplemented('workspaces.removeMember'),
    getSettings:   notImplemented('workspaces.getSettings'),
    updateSettings: notImplemented('workspaces.updateSettings'),
  };

  var projects = {
    list:    notImplemented('projects.list'),
    get:     notImplemented('projects.get'),
    create:  notImplemented('projects.create'),
    update:  notImplemented('projects.update'),
    delete:  notImplemented('projects.delete'),
  };

  var courses = {
    list:    notImplemented('courses.list'),
    get:     notImplemented('courses.get'),
    create:  notImplemented('courses.create'),
    update:  notImplemented('courses.update'),
    delete:  notImplemented('courses.delete'),
  };

  var lessons = {
    list:    notImplemented('lessons.list'),
    get:     notImplemented('lessons.get'),
    create:  notImplemented('lessons.create'),
    update:  notImplemented('lessons.update'),
    delete:  notImplemented('lessons.delete'),
  };

  var assets = {
    upload:  notImplemented('assets.upload'),
    get:     notImplemented('assets.get'),
    delete:  notImplemented('assets.delete'),
  };

  var users = {
    me:      notImplemented('users.me'),
    update:  notImplemented('users.update'),
    delete:  notImplemented('users.delete'),
  };

  var invitations = {
    send:    notImplemented('invitations.send'),
    accept:  notImplemented('invitations.accept'),
    revoke:  notImplemented('invitations.revoke'),
    list:    notImplemented('invitations.list'),
  };

  // -------------------------------------------------------------------------
  // Public surface
  // -------------------------------------------------------------------------
  return {
    ApiError,
    health,
    auth,
    workspaces,
    projects,
    courses,
    lessons,
    assets,
    users,
    invitations,
  };
})();
