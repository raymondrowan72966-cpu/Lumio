import { createRouter } from './router.js';
import { healthRoutes } from './health.js';
import { authRoutes } from './auth.js';
import { userRoutes } from './users.js';
import { workspaceRoutes } from './workspaces.js';
import { projectRoutes } from './projects.js';
import { assetRoutes } from './assets.js';
import { workspaceResourceRoutes } from './workspaceResources.js';
import { brandingRoutes } from './branding.js';
import { reviewRoutes } from './review.js';

/**
 * Single assembly point for every route group — adding a new resource means
 * adding one import + one spread here, nowhere else.
 */
export function createAppRouter() {
  return createRouter([
    ...healthRoutes,
    ...authRoutes,
    ...userRoutes,
    ...workspaceRoutes,
    ...projectRoutes,
    ...assetRoutes,
    ...workspaceResourceRoutes,
    ...brandingRoutes,
    ...reviewRoutes,
  ]);
}
