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
const REQUIRED_BINDINGS = ['DB']; // D1 database binding name, set in wrangler.toml

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

  return {
    environment,
    isProduction: environment === 'production',
    logLevel: env.LOG_LEVEL || (environment === 'production' ? 'INFO' : 'DEBUG'),
    db: env.DB,
    security: loadSecurityConfig(env),
    // Placeholders for bindings later sprints will require — intentionally
    // not validated as REQUIRED yet, since Sprint 1 does not use them:
    assetsBucket: env.ASSETS_BUCKET, // R2 — Phase: Assets sprint
    sessionSecret: env.SESSION_SECRET, // secret — Phase: Authentication sprint
  };
}
