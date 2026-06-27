import { notImplemented } from '../utils/response.js';

export const workspaceRoutes = [
  { method: 'GET', path: '/workspaces/:id', handler: () => notImplemented('workspaces.get') },
  { method: 'PATCH', path: '/workspaces/:id', handler: () => notImplemented('workspaces.update') },
  { method: 'DELETE', path: '/workspaces/:id', handler: () => notImplemented('workspaces.delete') },
  { method: 'GET', path: '/workspaces/:id/members', handler: () => notImplemented('workspaces.listMembers') },
  { method: 'POST', path: '/workspaces/:id/invitations', handler: () => notImplemented('workspaces.invite') },
  { method: 'DELETE', path: '/workspaces/:id/members/:userId', handler: () => notImplemented('workspaces.removeMember') },
  { method: 'POST', path: '/invitations/:token/accept', handler: () => notImplemented('invitations.accept') },
];
