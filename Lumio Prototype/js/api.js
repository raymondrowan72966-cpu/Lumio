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
  function patch(path, body) { return request('PATCH', path, body); }
  function del(path) { return request('DELETE', path); }

  // Non-JSON request (e.g. multipart/form-data). Browser sets Content-Type
  // automatically with the correct boundary when body is FormData.
  async function requestRaw(method, path, body) {
    const response = await fetch(BASE + path, {
      method,
      body,
      credentials: 'same-origin',
    });
    let parsed;
    try { parsed = await response.json(); } catch (_) { parsed = null; }
    if (!response.ok) {
      const err = parsed && parsed.error ? parsed.error : {};
      throw new ApiError(response.status, err.code, err.message, err.details);
    }
    if (parsed && Object.prototype.hasOwnProperty.call(parsed, 'data')) return parsed.data;
    return parsed;
  }

  // Blob fetch — returns a Blob on success, throws ApiError on non-2xx.
  async function requestBlob(path) {
    const response = await fetch(BASE + path, { credentials: 'same-origin' });
    if (!response.ok) {
      let parsed;
      try { parsed = await response.json(); } catch (_) { parsed = null; }
      const err = parsed && parsed.error ? parsed.error : {};
      throw new ApiError(response.status, err.code, err.message, err.details);
    }
    return response.blob();
  }

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
    requestPasswordReset: function (body) { return post('/auth/password-reset/request', body); },
    confirmPasswordReset: function (body) { return post('/auth/password-reset/confirm', body); },
  };

  // -------------------------------------------------------------------------
  // Remaining service stubs — populated as backend routes are implemented.
  // -------------------------------------------------------------------------
  var workspaces = {
    get:           notImplemented('workspaces.get'),
    update:        notImplemented('workspaces.update'),

    /**
     * List all members of a workspace.
     * Requires Workspace Owner session.
     *
     * @param {string} workspaceId
     * @returns {Promise<{ members: Array }>}
     */
    listMembers: function (workspaceId) {
      return get('/workspaces/' + encodeURIComponent(workspaceId) + '/members');
    },

    /**
     * Create a new workspace member directly (no invitation).
     * Requires Workspace Owner session.
     *
     * @param {string} workspaceId
     * @param {{ firstName, lastName, email, role, temporaryPassword }} body
     * @returns {Promise<{ ok: true, userId: string }>}
     * @throws {ApiError} 400 validation · 403 not owner · 409 duplicate
     */
    createMember: function (workspaceId, body) {
      return post('/workspaces/' + encodeURIComponent(workspaceId) + '/members', body);
    },

    updateMember: function (workspaceId, userId, body) {
      return patch('/workspaces/' + encodeURIComponent(workspaceId) + '/members/' + encodeURIComponent(userId), body);
    },
    resetMemberPassword: function (workspaceId, userId, body) {
      return post('/workspaces/' + encodeURIComponent(workspaceId) + '/members/' + encodeURIComponent(userId) + '/reset-password', body);
    },
    removeMember: function (workspaceId, userId) {
      return del('/workspaces/' + encodeURIComponent(workspaceId) + '/members/' + encodeURIComponent(userId));
    },
    getSettings:   notImplemented('workspaces.getSettings'),
    updateSettings: notImplemented('workspaces.updateSettings'),
  };

  // -------------------------------------------------------------------------
  // workspace — Step 9: Workspace Resource Persistence
  // Generic GET / PUT for workspace-owned resources (label packs, etc.).
  // All methods require an active session (HttpOnly cookies sent automatically).
  // -------------------------------------------------------------------------
  var workspace = {
    /**
     * Fetch all resources of a given type for the authenticated workspace.
     * @param {string} type  e.g. 'labelPacks'
     * @returns {Promise<Record<string, object>>}
     */
    getResources: function (type) {
      return get('/workspace/resources/' + encodeURIComponent(type));
    },

    /**
     * Full sync: client sends all items it has; server upserts and returns
     * the canonical set (with version metadata attached by the server).
     * @param {string}                 type   e.g. 'labelPacks'
     * @param {Record<string, object>} items  id → resource object
     * @returns {Promise<Record<string, object>>}
     */
    syncResources: function (type, items) {
      return request('PUT', '/workspace/resources/' + encodeURIComponent(type), { items });
    },

    /**
     * Fetch the public branding projection for the login page.
     * No session required — safe to call before authentication.
     *
     * @returns {Promise<{ name, shortName, logos: Record<string,string>, theme: object }>}
     */
    getPublicBranding: function () {
      return get('/workspace/public');
    },
  };

  // -------------------------------------------------------------------------
  // projects — Step 7: Cloud Project Persistence
  // All methods require an active session (HttpOnly cookies sent automatically).
  // -------------------------------------------------------------------------
  var projects = {
    /**
     * List all non-deleted projects for the authenticated workspace.
     * @returns {Promise<Array>} array of project metadata objects
     */
    list: function () { return get('/projects'); },

    /**
     * Get a single project with its course and lessons.
     * @param {string} id
     * @returns {Promise<{ project, course, lessons }>}
     */
    get: function (id) { return get('/projects/' + id); },

    /**
     * Create a new project (with optional course + lessons payload).
     * @param {{ title, type, status?, health?, folderId?, course?, lessons? }} data
     * @returns {Promise<object>} the newly created project row
     */
    create: function (data) { return post('/projects', data); },

    /**
     * Replace a project's metadata and content.
     * @param {string} id
     * @param {{ project, course?, lessons? }} data
     * @returns {Promise<object>} the updated project row
     */
    update: function (id, data) { return request('PUT', '/projects/' + id, data); },

    /**
     * Soft-delete a project (moves to Trash in D1; reversible via restore).
     * @param {string} id
     * @returns {Promise<{ deleted: true }>}
     */
    delete: function (id) { return request('DELETE', '/projects/' + id); },

    /**
     * Workspace-Owner-only: persist a governance status transition on any
     * workspace project without requiring project ownership.
     * @param {string} id
     * @param {string} status
     * @returns {Promise<object>} the updated project row
     */
    updateStatus: function (id, status) {
      return request('PATCH', '/projects/' + id + '/status', { status });
    },

    shares: {
      /**
       * Create or update an individual project share.
       * @param {string} projectId
       * @param {{ userId: string, permission: 'view'|'comment'|'edit' }} data
       * @returns {Promise<{ ok: true }>}
       */
      upsert: function (projectId, data) {
        return post('/projects/' + projectId + '/shares', data);
      },

      /**
       * Remove an individual project share.
       * @param {string} projectId
       * @param {string} userId
       * @returns {Promise<{ ok: true }>}
       */
      delete: function (projectId, userId) {
        return request('DELETE', '/projects/' + projectId + '/shares/' + encodeURIComponent(userId));
      },
    },
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

  // -------------------------------------------------------------------------
  // assets — Step 8: Cloud Asset Persistence
  // All methods require an active session (HttpOnly cookies sent automatically).
  // -------------------------------------------------------------------------
  var assets = {
    /**
     * Upload an asset blob to R2 and record metadata in D1.
     * Uses multipart/form-data so large files are streamed without base64 overhead.
     *
     * @param {string}  assetId     - content-addressed "asset://..." identifier
     * @param {File}    file        - the binary blob to upload
     * @param {string}  [courseId]  - owning course (null for workspace-level assets)
     * @param {string}  [workspaceId] - unused by server (derived from session), kept for symmetry
     * @returns {Promise<{ id, fileName, mimeType, sizeBytes, r2Key }>}
     */
    upload: function (assetId, file, courseId) {
      var fd = new FormData();
      fd.append('assetId', assetId);
      fd.append('file', file, file.name || 'asset');
      if (courseId) fd.append('courseId', courseId);
      return requestRaw('POST', '/assets/upload', fd);
    },

    /**
     * Fetch an asset blob from R2 (via Worker ownership check).
     * Returns a Blob with the correct Content-Type.
     *
     * @param {string} assetId - "asset://..." identifier
     * @returns {Promise<Blob>}
     */
    getBlob: function (assetId) {
      return requestBlob('/assets/' + encodeURIComponent(assetId));
    },

    /**
     * List all assets belonging to a project (course).
     * @param {string} projectId
     * @returns {Promise<Array>}
     */
    listByProject: function (projectId) {
      return get('/projects/' + projectId + '/assets');
    },

    /**
     * Soft-delete an asset from D1 (R2 object is retained).
     * @param {string} assetId
     * @returns {Promise<{ deleted: true }>}
     */
    delete: function (assetId) {
      return request('DELETE', '/assets/' + encodeURIComponent(assetId));
    },
  };

  var users = {
    me:             notImplemented('users.me'),
    update:         notImplemented('users.update'),
    delete:         notImplemented('users.delete'),
    changePassword: function (body) { return request('PATCH', '/users/me/password', body); },
  };

  var invitations = {
    /**
     * Send a workspace invitation.
     * Requires Workspace Owner session.
     *
     * @param {string} workspaceId
     * @param {{ firstName, lastName, email, role, authProvider }} body
     * @returns {Promise<{ ok: true, invitationId: string }>}
     * @throws {ApiError} 400 validation · 403 not owner · 409 duplicate
     */
    send: function (workspaceId, body) {
      return post('/workspaces/' + encodeURIComponent(workspaceId) + '/invitations', body);
    },

    /**
     * List pending invitations for a workspace.
     * Requires Workspace Owner session.
     *
     * @param {string} workspaceId
     * @returns {Promise<{ invitations: Array }>}
     */
    list: function (workspaceId) {
      return get('/workspaces/' + encodeURIComponent(workspaceId) + '/invitations');
    },

    /**
     * Fetch display-safe invitation details by raw token.
     * No authentication required — used by the accept-invite screen.
     *
     * @param {string} token
     * @returns {Promise<{ invitation: object }>}
     * @throws {ApiError} 400 if invalid/expired/used
     */
    get: function (token) {
      return get('/invitations/' + encodeURIComponent(token));
    },

    /**
     * Accept an invitation. No authentication required.
     *
     * @param {string} token  — raw invitation token from the URL
     * @param {{ password?: string }} body
     * @returns {Promise<{ ok: true }>}
     * @throws {ApiError} 400 invalid/expired · 400 validation
     */
    accept: function (token, body) {
      return post('/invitations/' + encodeURIComponent(token) + '/accept', body);
    },

    /**
     * Revoke a pending invitation by invitation ID.
     * Requires Workspace Owner session.
     *
     * @param {string} invitationId
     * @returns {Promise<{ ok: true }>}
     * @throws {ApiError} 400 not pending · 403 not owner
     */
    revoke: function (invitationId) {
      return request('DELETE', '/invitations/' + encodeURIComponent(invitationId));
    },
  };

  // -------------------------------------------------------------------------
  // Public surface
  // -------------------------------------------------------------------------
  return {
    ApiError,
    health,
    auth,
    workspaces,
    workspace,
    projects,
    courses,
    lessons,
    assets,
    users,
    invitations,
  };
})();
