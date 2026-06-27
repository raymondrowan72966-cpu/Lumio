# Backend Sprint Log

One row per sprint. Each sprint solves exactly one major objective, per `docs/BACKEND_DEVELOPMENT_CHARTER.md` Rule 2.

| Sprint | Objective | Status | Scope boundary |
|---|---|---|---|
| 1 | Cloud Foundation | ✅ Complete | Routing/config/logging/error/DB-connectivity skeleton only. Explicitly excluded: authentication, persistence, invitations, assets, business logic of any kind. |
| 2A | Database Foundation | ✅ Complete | Production D1 schema for `users`/`workspaces`/`workspace_members`/`sessions`/`password_resets` only. Explicitly excluded: authentication, registration, login, sessions logic, invitations, hashing, tokens, API endpoints, Worker business logic. |
| 2B | Security Services | ✅ Complete | PasswordService, TokenService, SessionService, security config, security utilities only. Explicitly excluded: registration, login, logout, Remember Me UI/cookie wiring, invitations, OAuth, workspace creation, API business logic. |
| 2C | Workspace Owner Registration (Email & Password) | ✅ Complete | `POST /auth/register` only — Email & Password self-registration. Explicitly excluded: login, logout, Remember Me, password reset, invitations, Administrator registration, OAuth, projects, assets, workspace switching. |
| 2D+ | *(not started)* | — | To be scoped per the charter's one-objective-per-sprint rule. Recommended next: Email & Password Login. |

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

## Sprint 2C — Workspace Owner Registration (Email & Password)

- **Objective:** implement `POST /auth/register` for Workspace Owner self-registration via Email & Password only — validate, hash, create User + Workspace + Owner membership + initial session in one atomic transaction, return a clean authentication response.
- **Status:** Complete.
- **Delivered:** see `CHANGELOG.md` Sprint 2C entry — 28/28 end-to-end assertions passed against the real Worker fetch handler + real D1 (Miniflare), plus a 4-assertion SessionService regression check confirming no behavior change from the refactor this sprint needed.
- **Found during this sprint:** D1's actual transaction primitive (`db.batch()`) constrains exactly which steps can be "in the transaction" (no async work between statements) — documented as the deliberate, correct design rather than a shortcut (ADR-014), plus the necessarily-string-based UNIQUE-constraint race detection this implies (ADR-013).
- **Explicitly deferred:** login, logout, Remember Me, password reset, invitations, Administrator registration, OAuth, projects, assets, workspace switching — Sprint 2D should implement Email & Password Login only.
