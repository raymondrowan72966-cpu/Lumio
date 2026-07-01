import { loadConfig } from './config/index.js';
import { createDbClient } from './database/client.js';
import { createLogger } from './utils/logger.js';
import { createAppRouter } from './routes/index.js';
import { handleError } from './middleware/errorHandler.js';
import { logRequest } from './middleware/requestLogger.js';
import { generateRequestId } from './middleware/requestId.js';
import { notFound } from './utils/response.js';
import { loadAuthContext } from './middleware/authContext.js';
import { TokenService } from './services/TokenService.js';
import { SessionService } from './services/SessionService.js';

const router = createAppRouter();

export default {
  async fetch(request, env, _executionCtx) {
    const startedAt = Date.now();
    const requestId = generateRequestId();
    const baseLogger = createLogger({ minLevel: env.LOG_LEVEL || 'INFO', context: { requestId } });

    let response;
    try {
      const config = loadConfig(env);
      const logger = baseLogger.child({ environment: config.environment });
      const db = createDbClient(config.db, logger);

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
      return response;
    } catch (err) {
      response = handleError(err, baseLogger);
      logRequest(baseLogger, request, response, startedAt);
      return response;
    }
  },
};
