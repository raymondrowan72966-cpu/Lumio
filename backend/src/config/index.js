import { ConfigurationError } from '../errors/index.js';
import { loadSecurityConfig } from './security.js';

/**
 * Configuration is read exclusively from the Worker's `env` (bindings +
 * vars + secrets, all supplied by Cloudflare per-environment via
 * wrangler.toml's [env.staging]/[env.production] sections or `wrangler
 * secret put`) — never from a committed file. Nothing in this module reads
 * process.env or hardcodes a value that differs between environments.
 *
 * Required bindings are validated eagerly (at request time, not at deploy
 * time — Workers have no separate "boot" phase to validate in) so a missing
 * binding fails fast with a clear ConfigurationError instead of a confusing
 * "undefined is not a function" three calls deep into a service.
 */
// Both bindings are required for the Worker to start — DB for all data
// operations, ASSETS_BUCKET for media storage (R2). A missing binding means
// the deployment is misconfigured and should fail fast with a clear error
// rather than crashing somewhere deep inside a route handler.
const REQUIRED_BINDINGS = ['DB', 'ASSETS_BUCKET'];

/**
 * Parses the CORS_ALLOWED_ORIGINS env var (comma-separated list of origins)
 * into an array. Falls back to the Pages domain so the most common case works
 * without any wrangler.toml change. Additional origins (e.g. a local dev
 * server or a future custom domain) can be added via CORS_ALLOWED_ORIGINS.
 */
function loadCorsOrigins(env) {
  const raw = env.CORS_ALLOWED_ORIGINS;
  if (raw && typeof raw === 'string' && raw.trim().length > 0) {
    return raw.split(',').map((o) => o.trim()).filter(Boolean);
  }
  return ['https://lumio-6kn.pages.dev'];
}

export function loadConfig(env) {
  if (!env || typeof env !== 'object') {
    throw new ConfigurationError('Worker env was not provided.');
  }

  const missing = REQUIRED_BINDINGS.filter((key) => env[key] === undefined);
  if (missing.length > 0) {
    throw new ConfigurationError('Missing required binding(s).', { missing });
  }

  const environment = env.ENVIRONMENT || 'development';
  if (!['development', 'staging', 'production'].includes(environment)) {
    throw new ConfigurationError(`Unrecognized ENVIRONMENT value: "${environment}".`);
  }

  if (!env.APP_BASE_URL || typeof env.APP_BASE_URL !== 'string' || env.APP_BASE_URL.trim().length === 0) {
    throw new ConfigurationError('APP_BASE_URL is required. Set it in wrangler.toml [vars] for each environment.');
  }
  if (!env.RESEND_API_KEY || typeof env.RESEND_API_KEY !== 'string' || env.RESEND_API_KEY.trim().length === 0) {
    throw new ConfigurationError('RESEND_API_KEY is required. Set it via: npx wrangler secret put RESEND_API_KEY');
  }

  return {
    environment,
    isProduction: environment === 'production',
    logLevel: env.LOG_LEVEL || (environment === 'production' ? 'INFO' : 'DEBUG'),
    db: env.DB,
    security: loadSecurityConfig(env),
    assetsBucket: env.ASSETS_BUCKET,    // R2 binding — validated above
    sessionSecret: env.SESSION_SECRET, // secret — set via `wrangler secret put`
    corsAllowedOrigins: loadCorsOrigins(env),
    appBaseUrl: env.APP_BASE_URL.trim(),
    resendApiKey: env.RESEND_API_KEY,
  };
}
