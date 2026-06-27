# Backend Sprint Log

One row per sprint. Each sprint solves exactly one major objective, per `docs/BACKEND_DEVELOPMENT_CHARTER.md` Rule 2.

| Sprint | Objective | Status | Scope boundary |
|---|---|---|---|
| 1 | Cloud Foundation | ✅ Complete | Routing/config/logging/error/DB-connectivity skeleton only. Explicitly excluded: authentication, persistence, invitations, assets, business logic of any kind. |
| 2A | Database Foundation | ✅ Complete | Production D1 schema for `users`/`workspaces`/`workspace_members`/`sessions`/`password_resets` only. Explicitly excluded: authentication, registration, login, sessions logic, invitations, hashing, tokens, API endpoints, Worker business logic. |
| 2B | Security Services | ✅ Complete | PasswordService, TokenService, SessionService, security config, security utilities only. Explicitly excluded: registration, login, logout, Remember Me UI/cookie wiring, invitations, OAuth, workspace creation, API business logic. |
| 2C+ | *(not started)* | — | To be scoped per the charter's one-objective-per-sprint rule. Recommended next: Registration (Workspace Owner self-registration only, per `SAAS_AUTHENTICATION_SPECIFICATION.md` Section 2) — Login, Session Management wiring, and Invitations are each their own subsequent sprint, not bundled in. |

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

## Sprint 2B — Security Services

- **Objective:** implement the production PasswordService, TokenService, and SessionService, plus the security configuration and crypto utilities they depend on — with zero registration/login/invitation/OAuth logic, no UI changes, no API endpoints.
- **Status:** Complete.
- **Delivered:** see `CHANGELOG.md` Sprint 2B entry — 39/39 validation assertions passed, including SessionService tested against a real D1 database via Miniflare (not a mock).
- **Found during this sprint:** one real design question resolved without a schema change (`rememberMe` as an explicit `refreshSession` parameter rather than a stored column, ADR-011) and two non-obvious D1 API facts discovered while building the validation harness (ADR-010) — both logged per charter Rule 1.
- **Explicitly deferred:** registration, login, logout, Remember Me cookie/UI wiring, invitations, OAuth, workspace creation — these begin in Sprint 2C onward, which should wire `AuthService`/`UserRepository`/`WorkspaceRepository` (still Sprint 1 placeholders) to the now-real PasswordService/TokenService/SessionService for Workspace Owner registration specifically.
