import { notImplemented } from '../utils/response.js';

export const projectRoutes = [
  { method: 'GET', path: '/projects', handler: () => notImplemented('projects.list') },
  { method: 'POST', path: '/projects', handler: () => notImplemented('projects.create') },
  { method: 'GET', path: '/projects/:id', handler: () => notImplemented('projects.get') },
  { method: 'PATCH', path: '/projects/:id', handler: () => notImplemented('projects.update') },
  { method: 'DELETE', path: '/projects/:id', handler: () => notImplemented('projects.delete') },
];
