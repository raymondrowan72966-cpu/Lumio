import { dataResponse } from '../utils/response.js';
import { getSchemaVersion } from '../database/schemaVersion.js';

/** Confirms the Worker is running, D1 is reachable, R2 is reachable, and
 *  what schema version is applied. Verifiable in seconds after every deploy. */
export const healthRoutes = [
  {
    method: 'GET',
    path: '/health',
    handler: async (_req, _params, ctx) => {
      const dbOk = await ctx.db.ping();
      const schema = dbOk ? await getSchemaVersion(ctx.db) : { applied: [], latest: null };

      // R2 head check — list with a limit of 1 object. An empty bucket
      // returns an empty list (not an error), so any non-throw response
      // confirms the bucket binding is properly wired and the Worker has
      // permission to read from it.
      let r2Ok = false;
      try {
        await ctx.config.assetsBucket.list({ limit: 1 });
        r2Ok = true;
      } catch (_err) {
        r2Ok = false;
      }

      const allOk = dbOk && r2Ok;
      return dataResponse({
        status: allOk ? 'ok' : 'degraded',
        environment: ctx.config.environment,
        database: { reachable: dbOk, schemaVersion: schema.latest },
        storage: { reachable: r2Ok },
      });
    },
  },
];
