/**
 * Minimal hand-rolled router — no external routing dependency, matching the
 * rest of this project's preference for plain, dependency-light code over
 * a framework. Supports static segments and `:param` segments only, which
 * is all the routes in this sprint (and the API blueprint in
 * docs/SAAS_MIGRATION_BLUEPRINT.md Phase 6) need.
 */
export function createRouter(routeDefs) {
  const routes = routeDefs.map(({ method, path, handler }) => ({
    method,
    handler,
    segments: path.split('/').filter(Boolean),
  }));

  function match(method, pathname) {
    const segments = pathname.split('/').filter(Boolean);
    for (const route of routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== segments.length) continue;

      const params = {};
      let matched = true;
      for (let i = 0; i < segments.length; i++) {
        const routeSeg = route.segments[i];
        const actualSeg = segments[i];
        if (routeSeg.startsWith(':')) {
          params[routeSeg.slice(1)] = decodeURIComponent(actualSeg);
        } else if (routeSeg !== actualSeg) {
          matched = false;
          break;
        }
      }
      if (matched) return { handler: route.handler, params };
    }
    return null;
  }

  return { match };
}
