import { dataResponse } from '../utils/response.js';
import { getSchemaVersion } from '../database/schemaVersion.js';

/** Not part of the sprint's required /auth, /users, /workspaces, /projects,
 *  /assets surface, but a near-zero-cost addition that makes every later
 *  deployment verifiable in seconds — confirms the Worker is running, the
 *  D1 binding is reachable, and what schema version (if any) is applied. */
export const healthRoutes = [
  {
    method: 'GET',
    path: '/health',
    handler: async (_req, _params, ctx) => {
      const dbOk = await ctx.db.ping();
      const schema = dbOk ? await getSchemaVersion(ctx.db) : { applied: [], latest: null };
      return dataResponse({
        status: dbOk ? 'ok' : 'degraded',
        environment: ctx.config.environment,
        database: { reachable: dbOk, schemaVersion: schema.latest },
      });
    },
  },
];
