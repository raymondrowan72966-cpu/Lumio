import { notImplemented } from '../utils/response.js';

export const assetRoutes = [
  { method: 'POST', path: '/assets', handler: () => notImplemented('assets.upload') },
  { method: 'GET', path: '/assets/:id', handler: () => notImplemented('assets.get') },
  { method: 'DELETE', path: '/assets/:id', handler: () => notImplemented('assets.delete') },
];
