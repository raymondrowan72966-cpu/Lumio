# Architecture Decision Records

One entry per significant decision. Newest first.

---

## ADR-007: Local rollback/test scripts live in `backend/scripts/`, never `backend/migrations/`

**Decision:** any `.sql` file used only for local validation (e.g. a manual rollback script) is stored outside the `migrations/` directory entirely.
**Why:** discovered live during Sprint 2A's required rollback test — Wrangler's D1 migration scanner treats *every* `.sql` file in `migrations/` as a real, trackable migration regardless of filename. A rollback script placed there was applied as if it were migration 0001 itself, and out of order (alphabetically before the real migration, since `...down.sql` sorts before the bare filename). This is now documented prominently in `migrations/README.md` so it isn't rediscovered the hard way again.
**Alternatives considered:** naming the file so it sorts after 0001 and hoping Wrangler ignores non-numbered files. Rejected — Wrangler's scanner has no such filtering; the only reliable fix is keeping the directory's contents to exactly what's meant to be migrated.
**Known limitations:** none — this is a tooling fact, not a tradeoff.

## ADR-006: `users.avatar_url` is a plain URL column, not a foreign key to an assets table

**Decision:** `users.avatar_url TEXT` (nullable), with no foreign key constraint, instead of the `avatar_asset_id` FK to an `assets` table sketched in `SAAS_MIGRATION_BLUEPRINT.md` Phase 7.
**Why:** the `assets` table does not exist yet (out of scope for both the Cloud Foundation and Database Foundation sprints — assets are a later sprint), and OAuth providers (Google/Microsoft/Apple) supply avatar photos as external URLs at the identity-payload level, not as Lumio-managed uploads — a plain URL column is the correct *eventual* shape for at least the OAuth case regardless of when the assets table arrives. Self-uploaded avatars (Email & Password accounts choosing their own photo) may want to point at a real Lumio asset later; that can be added as a new, separate nullable column in a future migration without touching this one.
**Alternatives considered:** blocking this column until the assets table exists. Rejected — `avatar_url` is explicitly listed in this sprint's required `users` fields ("Profile … Avatar"), and OAuth-sourced avatars genuinely are just URLs, so deferring the column entirely would under-deliver the sprint's actual requirement, not just delay an implementation detail.
**Known limitations:** no validation of URL format or reachability at the database layer — that's an application-level concern for whichever future sprint implements avatar handling.

## ADR-005: Wrangler v4, not v3

**Decision:** `package.json` pins `wrangler: ^4.0.0`.
**Why:** Sprint 1 initially used v3.78; Wrangler itself flagged that version as out-of-date during validation. Re-verified `wrangler deploy --dry-run` against all three environments under v4 before committing — clean builds, no behavior change needed in any source file.
**Alternatives considered:** staying on v3 for stability. Rejected — no concrete reason to pin an outdated tool this early, before any real deploy has happened.
**Known limitations:** none identified.

## ADR-004: No custom D1 migration runner

**Decision:** Use Wrangler's built-in `d1 migrations` feature (`migrations/` folder + `wrangler d1 migrations apply`) instead of writing a custom migration-runner module inside the Worker.
**Why:** A correct, maintained migration runner already exists as part of the tooling; building another one would be unnecessary abstraction (charter Rule 11) and a second, divergent way to do the same job. `src/database/schemaVersion.js` only *reads* the `d1_migrations` table Wrangler maintains — it never writes to it.
**Alternatives considered:** an in-Worker migration runner triggered via an admin endpoint. Rejected — Workers have no filesystem access to read `.sql` files at runtime anyway, making this approach a dead end architecturally, not just a style preference.
**Known limitations:** migrations must be applied via the Wrangler CLI (locally or in CI), not via any application API. This is the standard, expected D1 workflow.

## ADR-003: Hand-rolled router, no routing framework dependency

**Decision:** `src/routes/router.js` is a ~40-line dependency-free router supporting static and `:param` segments only.
**Why:** matches the existing frontend's deliberate no-framework, no-build-step philosophy, translated to the Worker context. The route surface needed for Sprint 1 (and the full API blueprint in `SAAS_MIGRATION_BLUEPRINT.md` Phase 6) does not need wildcard routes, regex segments, or middleware chaining beyond what's already built — a routing library would add a dependency and an upgrade-tracking burden for capability this project doesn't use.
**Alternatives considered:** `itty-router`, `hono`. Rejected for now — both are reasonable, lightweight choices, but neither is *needed* yet; revisit only if a real requirement (e.g. wildcard asset-streaming routes) appears that the hand-rolled router can't express cleanly.
**Known limitations:** no support for wildcard/catch-all segments or regex constraints. Acceptable today; would need either an extension to this router or a switch to a library if a future sprint needs that.

## ADR-002: `backend/` as a sibling directory, not nested inside `Lumio Prototype/`

**Decision:** the new backend lives at the repo root (`backend/`), not inside the existing frontend's folder.
**Why:** the existing frontend has no build step and is (per the Sprint 1 repository audit) most likely served by Cloudflare Pages directly from its own directory with no build command. Nesting the backend inside it would risk Pages' static file server inadvertently exposing backend source files, or a future Pages build-command change accidentally trying to process `backend/`. A sibling directory makes the separation structurally obvious, not just a documented convention.
**Alternatives considered:** a monorepo tool (Turborepo/Nx) to formally manage the two projects. Rejected as premature — two independently-deployed projects with no shared build step or shared dependencies do not yet need a monorepo tool; revisit only if real cross-project tooling pain appears.
**Known limitations:** none identified.

## ADR-001: `workspace_members` composite key, no surrogate id

**Decision:** `WorkspaceRepository`'s skeleton methods key membership by `(workspaceId, userId)`, matching the D1 schema design in `SAAS_MIGRATION_BLUEPRINT.md` Phase 7 — never a separate auto-generated `id` for membership rows.
**Why:** documented project history (the Authentication Functional Validation sprint, prior to this backend work) found a real, shipped bug where a client-side merge utility assumed every record had an `.id` field; `workspaceMemberships` records didn't, and the assumption silently destroyed membership data. Keying by the natural composite identity from the start, in the repository's method signatures, makes that specific class of mistake structurally harder to repeat in the new backend.
**Alternatives considered:** a surrogate `id` column for convenience (e.g. easier ORM tooling later). Rejected — the composite key is already the correct, sufficient identity; adding a redundant surrogate key would just reintroduce two ways to identify the same row, which is exactly the kind of inconsistency that caused the original bug.
**Known limitations:** none identified — this is a skeleton-stage decision, to be confirmed unchanged when the real migration is written in a future sprint.
