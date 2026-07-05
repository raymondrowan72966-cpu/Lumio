import { loadConfig } from './config/index.js';
import { createDbClient } from './database/client.js';
import { createLogger } from './utils/logger.js';
import { createAppRouter } from './routes/index.js';
import { handleError } from './middleware/errorHandler.js';
import { logRequest } from './middleware/requestLogger.js';
import { generateRequestId } from './middleware/requestId.js';
import { notFound } from './utils/response.js';
import { loadAuthContext } from './middleware/authContext.js';
import { buildCorsHeaders, handlePreflight, applyCorsHeaders } from './middleware/cors.js';
import { TokenService } from './services/TokenService.js';
import { SessionService } from './services/SessionService.js';

const router = createAppRouter();

export default {
  async fetch(request, env, _executionCtx) {
    const startedAt = Date.now();
    const requestId = generateRequestId();
    const baseLogger = createLogger({ minLevel: env.LOG_LEVEL || 'INFO', context: { requestId } });

    // corsHeaders is initialised to {} so applyCorsHeaders below is a safe
    // no-op even if config loading fails before the variable is populated.
    let response;
    let corsHeaders = {};
    try {
      const config = loadConfig(env);
      const logger = baseLogger.child({ environment: config.environment });
      const db = createDbClient(config.db, logger);

      // Build CORS headers once per request — before routing so that
      // OPTIONS preflights are handled here rather than falling through to
      // the router (which has no OPTIONS routes registered).
      corsHeaders = buildCorsHeaders(request, config.corsAllowedOrigins);

      if (request.method === 'OPTIONS') {
        return handlePreflight(corsHeaders);
      }

      const url = new URL(request.url);
      const match = router.match(request.method, url.pathname);

      if (!match) {
        response = notFound(`No route for ${request.method} ${url.pathname}`);
      } else {
        const tokenService = new TokenService(config.security);
        const sessionService = new SessionService({ db, tokenService, securityConfig: config.security });
        const auth = await loadAuthContext(request, { db, sessionService });
        response = await match.handler(request, match.params, { config, db, logger, auth });
      }

      logRequest(logger, request, response, startedAt);
    } catch (err) {
      response = handleError(err, baseLogger);
      logRequest(baseLogger, request, response, startedAt);
    }

    // Apply CORS headers to every response — 200s, 4xxs, 5xxs alike —
    // so clients receive consistent CORS behaviour regardless of route outcome.
    return applyCorsHeaders(response, corsHeaders);
  },
};
