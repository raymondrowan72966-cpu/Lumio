import { notImplemented } from '../utils/response.js';

export const userRoutes = [
  { method: 'GET', path: '/users/me', handler: () => notImplemented('users.me') },
  { method: 'PATCH', path: '/users/me', handler: () => notImplemented('users.updateMe') },
  { method: 'DELETE', path: '/users/me', handler: () => notImplemented('users.deleteMe') },
];
