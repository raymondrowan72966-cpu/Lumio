# Lumio Backend Development Charter

**Effective from Sprint 2 onward.** This charter governs every backend implementation sprint. It overrides convenience, speed, or unnecessary optimisation. Read this before starting any backend sprint.

---

## 1. The Specifications Are Frozen

`SAAS_MIGRATION_BLUEPRINT.md`, `SAAS_PRODUCT_SPECIFICATION.md`, and `SAAS_AUTHENTICATION_SPECIFICATION.md` (all in this `docs/` folder) are the authoritative source of truth. No implementation may contradict them.

If implementation reveals a flaw in a specification: **stop, document the issue in `backend/DECISIONS.md`, recommend the change to the user, and wait.** Never silently redesign the architecture to route around a discovered problem.

## 2. Sprint Scope

One major objective per sprint. Never combine, e.g., Registration + Login + Invitations + OAuth into one sprint — each is its own sprint.

## 3. Regression Protection

Every sprint ends with: successful build, deployment validation (dry-run at minimum, real deploy when credentials are available), a frontend regression check, a backend regression check, a clean console, no lint failures, no broken imports, no failed migrations. A sprint is not complete until all of these pass.

## 4. Backwards Compatibility

Nothing in the existing Lumio frontend may break. Existing exports must keep working. The backend replaces browser-local storage — it does not change user-visible behaviour.

## 5. No Hidden Architecture Changes

Do not add new user types, change workspace ownership, introduce new permission models, change authentication flows, or introduce new frameworks without explicit approval.

## 6. Database Rules

Every schema change documents: reason, rollback strategy, migration safety, indexes, foreign keys, cascade behaviour. No destructive migration without explicit approval.

## 7. API Rules

Every endpoint includes: input validation, typed errors (from `backend/src/errors/`), structured logging, correct HTTP status codes. No placeholder success responses — an unimplemented endpoint returns 501, never a fake 200.

## 8. Security Rules

Never store plaintext passwords. Hash with a modern algorithm. Never expose secrets. Never log sensitive information. Validate every request. Reject invalid tokens. Fail securely (deny by default, not allow by default).

## 9. Documentation

Every sprint updates three files in `backend/`:
- **`CHANGELOG.md`** — what changed, in standard changelog format.
- **`SPRINTS.md`** — sprint-by-sprint log: objective, status, scope boundary.
- **`DECISIONS.md`** — architecture decision records: what was decided, why, alternatives considered, known limitations, future work.

## 10. Git Discipline

Every sprint ends with: regression pass, review, commit, clean working tree, meaningful commit message. No unfinished work committed.

## 11. Engineering Philosophy

Prefer simple, readable, maintainable, well-tested, well-documented code over clever, complex, prematurely optimised, or over-engineered code. Maintain consistency with the existing codebase wherever possible.
