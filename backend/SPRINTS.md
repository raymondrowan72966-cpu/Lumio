# Backend Sprint Log

One row per sprint. Each sprint solves exactly one major objective, per `docs/BACKEND_DEVELOPMENT_CHARTER.md` Rule 2.

| Sprint | Objective | Status | Scope boundary |
|---|---|---|---|
| 1 | Cloud Foundation | ✅ Complete | Routing/config/logging/error/DB-connectivity skeleton only. Explicitly excluded: authentication, persistence, invitations, assets, business logic of any kind. |
| 2A | Database Foundation | ✅ Complete | Production D1 schema for `users`/`workspaces`/`workspace_members`/`sessions`/`password_resets` only. Explicitly excluded: authentication, registration, login, sessions logic, invitations, hashing, tokens, API endpoints, Worker business logic. |
| 2B+ | *(not started)* | — | To be scoped per the charter's one-objective-per-sprint rule. Recommended next: Registration (Workspace Owner self-registration only, per `SAAS_AUTHENTICATION_SPECIFICATION.md` Section 2) — Login, Session Management, and Invitations are each their own subsequent sprint, not bundled in. |

## Sprint 1 — Cloud Foundation

- **Objective:** establish a clean, production-ready backend skeleton that every future sprint builds on, with zero business logic.
- **Status:** Complete.
- **Delivered:** see `CHANGELOG.md` Sprint 1 entry.
- **Explicitly deferred:** every concrete capability (auth, persistence, invitations, assets) — these begin in Sprint 2 onward, one objective per sprint, per the charter.

## Sprint 2A — Database Foundation

- **Objective:** implement the production D1 schema for the five core tables required by the authentication specification, with zero business logic, hashing, tokens, or API endpoints.
- **Status:** Complete.
- **Delivered:** see `CHANGELOG.md` Sprint 2A entry — full create/apply/rollback/reapply validation, constraint and cascade testing with real data.
- **Found during this sprint:** a Wrangler tooling gotcha (migration-folder scanning, see `DECISIONS.md` ADR-007) and one schema judgment call requiring a documented decision rather than a silent deviation (`avatar_url`, ADR-006) — both logged per charter Rule 1.
- **Explicitly deferred:** authentication, registration, login, session-issuing logic, password hashing, token generation, invitations, API endpoints — these begin in Sprint 2B onward.
