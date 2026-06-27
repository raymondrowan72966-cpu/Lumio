import { notImplemented } from '../utils/response.js';

/**
 * Route surface only — handlers exist so the path/method is reserved and
 * documented, but every one returns 501 until the Authentication sprint
 * implements it per docs/SAAS_AUTHENTICATION_SPECIFICATION.md.
 */
export const authRoutes = [
  { method: 'POST', path: '/auth/register', handler: () => notImplemented('auth.register') },
  { method: 'POST', path: '/auth/login', handler: () => notImplemented('auth.login') },
  { method: 'POST', path: '/auth/logout', handler: () => notImplemented('auth.logout') },
  { method: 'POST', path: '/auth/refresh', handler: () => notImplemented('auth.refresh') },
  { method: 'POST', path: '/auth/password-reset/request', handler: () => notImplemented('auth.passwordResetRequest') },
  { method: 'POST', path: '/auth/password-reset/confirm', handler: () => notImplemented('auth.passwordResetConfirm') },
  { method: 'GET', path: '/auth/oauth/:provider/callback', handler: () => notImplemented('auth.oauthCallback') },
];
