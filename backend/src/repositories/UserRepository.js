/**
 * Skeleton only — Sprint 1 (Cloud Foundation) does not implement any user
 * persistence. Method signatures are fixed here so the Authentication
 * sprint implements against an already-agreed shape (matching the `users`
 * table design in docs/SAAS_MIGRATION_BLUEPRINT.md Phase 7) rather than
 * inventing one mid-sprint.
 */
export class UserRepository {
  constructor(db) {
    this.db = db;
  }

  async findById(_id) {
    throw new Error('UserRepository.findById is not implemented yet (Sprint 1: foundation only).');
  }

  async findByEmail(_email) {
    throw new Error('UserRepository.findByEmail is not implemented yet (Sprint 1: foundation only).');
  }

  async create(_userFields) {
    throw new Error('UserRepository.create is not implemented yet (Sprint 1: foundation only).');
  }

  async update(_id, _patch) {
    throw new Error('UserRepository.update is not implemented yet (Sprint 1: foundation only).');
  }
}
