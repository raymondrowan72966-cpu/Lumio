/**
 * Skeleton only — Sprint 1 (Cloud Foundation) does not implement any
 * workspace persistence. Shape matches `workspaces`/`workspace_members` in
 * docs/SAAS_MIGRATION_BLUEPRINT.md Phase 7, including the composite-key
 * (workspaceId, userId) membership identity — never a separate surrogate
 * `id` for membership rows (that mistake, and the data-loss bug it caused
 * once, is documented in this project's history; this signature is shaped
 * to make repeating it harder).
 */
export class WorkspaceRepository {
  constructor(db) {
    this.db = db;
  }

  async findById(_id) {
    throw new Error('WorkspaceRepository.findById is not implemented yet (Sprint 1: foundation only).');
  }

  async create(_workspaceFields) {
    throw new Error('WorkspaceRepository.create is not implemented yet (Sprint 1: foundation only).');
  }

  async findMembership(_workspaceId, _userId) {
    throw new Error('WorkspaceRepository.findMembership is not implemented yet (Sprint 1: foundation only).');
  }

  async addMember(_workspaceId, _userId, _role) {
    throw new Error('WorkspaceRepository.addMember is not implemented yet (Sprint 1: foundation only).');
  }

  async removeMember(_workspaceId, _userId) {
    throw new Error('WorkspaceRepository.removeMember is not implemented yet (Sprint 1: foundation only).');
  }
}
