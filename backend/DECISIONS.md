# Architecture Decision Records

One entry per significant decision. Newest first.

---

## ADR-015: Database Concurrency Rule — uniqueness constraints are the authoritative source of truth, never the pre-check

**Decision:** for every uniqueness requirement (starting with `users.email`, and binding for every future case — invitation tokens, etc.), the database's UNIQUE constraint is the sole authoritative enforcement. A "does this already exist?" read before an INSERT may exist *only* to improve the common-case error message/latency; it must never be the thing application correctness relies on. Added `DuplicateEmailError` (a distinct `ValidationError` subclass, `code: 'DUPLICATE_EMAIL'`) so this specific case is identifiable by type, not by string-matching a message.
**Why:** a pre-check-then-insert pattern has an inherent TOCTOU (time-of-check-to-time-of-use) race: two concurrent requests for the same email can both pass the pre-check (neither sees the other's row yet) and both proceed to insert, with only the database's own constraint actually able to stop the second one. Sprint 2C's `registerOwner` already had this right by construction — the `db.batch()` catch block was already independently detecting the UNIQUE violation and mapping it to a duplicate-email error, completely independent of whether the pre-check ran first — but this review made it explicit, named, and *proven*, rather than leaving it as an implicit property of the code.
**Verification performed:** wrote a throwaway test that monkey-patches `UserRepository.findByEmail` to unconditionally return `null` (simulating the pre-check missing every duplicate, exactly as a real race would) and confirmed registering the same email twice still correctly throws `DuplicateEmailError` with zero extra rows created, the database constraint catching it alone. Also confirmed a genuinely new email still registers successfully with the pre-check disabled, and that the normal (pre-check-enabled) path throws the identical error type — both code paths now visibly converge on one outcome.
**Alternatives considered:** removing the pre-check entirely, relying only on the in-batch constraint. Rejected — the rule explicitly permits keeping it for UX (faster, cleaner rejection without computing a password hash and attempting a doomed transaction first), as long as correctness doesn't depend on it, which is now proven, not assumed.
**Known limitations:** this ADR sets the rule for all *future* uniqueness checks (invitation tokens, etc.) as well — any new pre-check pattern introduced later must follow the same shape (pre-check for UX only, constraint catch as the real enforcement) or be flagged as a deviation.

---

## ADR-014: D1's `db.batch()` is the transaction boundary; pre-batch steps (validation, password hashing, the duplicate-email read) are necessarily outside it

**Decision:** registration's "single database transaction" is implemented as exactly one `db.batch([userStatement, workspaceStatement, membershipStatement, sessionStatement])` call. Input validation, email normalization, the duplicate-email pre-check (a `SELECT`), and password hashing all happen *before* the batch is assembled, not inside it.
**Why:** this is a hard constraint of the actual D1 API, not a design preference — every statement in a `db.batch()` call must already be fully built and bound (synchronous) before the call executes; there is no way to `await` something (like `crypto.subtle` password hashing, which is genuinely async) *between* two statements in the same batch. The only physically correct design is: do every async/conditional step first, build the four INSERT statements from the now-known values, then commit them together atomically. The atomicity guarantee that actually matters — "if user/workspace/membership/session creation can't all succeed together, none of them happen" — is fully satisfied by this design; it's the read-then-decide steps beforehand that were never going to be transactional in the relational-database sense, since they're not writes.
**Alternatives considered:** moving the duplicate-email check to rely solely on the UNIQUE constraint inside the batch (skip the pre-check entirely). Rejected — the pre-check gives a clean `ValidationError` with a specific message for the overwhelmingly common case; the in-batch UNIQUE constraint is kept anyway as the actual race-safe enforcement (see ADR-013) and only matters for the rare concurrent-registration-with-the-same-email case, which is correctly handled by mapping that specific constraint failure to the same `ValidationError`.
**Known limitations:** none — this is the correct, complete transactional guarantee D1 can offer for this operation.

## ADR-013: Detecting a UNIQUE-constraint race via string-matching the D1 error message

**Decision:** when `db.batch()` throws (wrapped as a `DatabaseError` by `createDbClient`), `AuthService.registerOwner` inspects `err.details.cause` for the substrings `"UNIQUE"` and `"users.email"` to distinguish "someone registered with this exact email a few milliseconds ago" (map to `ValidationError`, same message as the pre-check) from any other database failure (re-thrown as `DatabaseError`).
**Why:** D1/SQLite's constraint-violation errors are plain strings, not a structured, typed exception with a machine-readable constraint name — string-matching the message is the only mechanism available without adding a SQL-error-parsing library for a single call site.
**Alternatives considered:** a SELECT-then-INSERT-only design with no UNIQUE-constraint fallback (accept the rare race as "the second request gets a confusing 500 instead of a clean 400"). Rejected — the fallback is cheap, already-tested code, and the alternative is a worse user experience for a real (if rare) case.
**Known limitations:** if D1's error message format for constraint violations ever changes upstream, this detection silently stops matching and such a race would surface as a generic `DatabaseError` (500) instead of the intended `ValidationError` (400) — a behavior degradation, not a crash, and worth revisiting if D1's error format is ever documented/stabilized differently.



## ADR-012: Concrete defaults chosen for every TTL the specs left as a range or didn't number

**Decision:** `src/config/security.js` picks one concrete number for each token type's default TTL: 15 min access tokens, 30-day sliding refresh for Remember Me, 24h refresh for non-Remember-Me sessions, 1h password reset, 48h email verification, 7-day invitations.
**Why:** `SAAS_AUTHENTICATION_SPECIFICATION.md` Section 7 specifies access/refresh/invitation numbers exactly; `SAAS_PRODUCT_SPECIFICATION.md` Section 2 gives email verification as a range ("24-48 hours") rather than one number — 48 (the upper end) was chosen for friction tolerance, since people don't always check email immediately. The non-Remember-Me session TTL (24h) is not specified anywhere in either document — the specs only say the *cookie* should be session-scoped, which a server-side TTL can't literally replicate (the server can't know when a browser closes); 24h is a defense-in-depth bound documented as a judgment call, not as fulfilling an explicit numeric requirement. The 1-hour password reset TTL is *not new* — it carries forward the original prototype's `PASSWORD_RESET_TTL_MS`, since neither spec document restates a different number, so the existing, already-validated value was kept rather than invented fresh.
**Alternatives considered:** leaving these as TODOs requiring product sign-off before any code used them. Rejected — every value is overridable via an environment variable (`EMAIL_VERIFICATION_TTL_HOURS`, etc.) with zero code change required, so shipping a documented, sensible default now does not foreclose adjusting it later.
**Known limitations:** none of these defaults have been validated against real user behavior (e.g. actual email-open-rate data) — they are reasoned defaults, not data-driven ones.

## ADR-011: `refreshSession` takes `rememberMe` as an explicit parameter, not a stored column

**Decision:** the `sessions` table (Sprint 2A) has no column recording whether a session was created with "Remember Me" enabled. `SessionService.refreshSession` requires the caller to supply `rememberMe` on every call, exactly as `createSession` does, rather than reading a stored flag.
**Why:** Remember Me is fundamentally about how the refresh token is *delivered and stored client-side* (a persistent cookie vs. a session-only cookie) — the server only ever needs to enforce `expires_at`, which is already a column. A future login/refresh endpoint already knows this from the request context (which cookie type it's issuing/honoring), so storing a redundant flag server-side would just be a second source of truth for something the HTTP layer already encodes. This was treated as a real open question during this sprint (could the schema need a column?) and deliberately resolved without a schema change, per charter Rule 1 — not a silent gap.
**Alternatives considered:** adding a `remember_me INTEGER` column to `sessions` via a new migration. Rejected for this sprint — schema changes are out of Sprint 2B's scope (Database Foundation was Sprint 2A), and the parameter-based design is sufficient and arguably more correct anyway.
**Known limitations:** if a future requirement needs to *query* "show me all of this user's Remember-Me sessions" without the caller already knowing which is which, a column would become necessary. Not a current requirement.

## ADR-010: D1's `.exec()` is line-based, not statement-based — migrations apply via `.prepare().run()` per statement in tooling

**Decision:** when this sprint needed to apply the Sprint 2A migration programmatically (for Miniflare-backed validation, not production), it did so by splitting the SQL into individual statements and running each via `db.prepare(stmt).run()`, not via `db.exec(wholeFile)`.
**Why:** discovered live — `d1.exec()` splits its input on newlines and attempts to run *each line* as an independent statement, which breaks immediately on a multi-line `CREATE TABLE` or a comment-only line. This is not how `wrangler d1 migrations apply`/`wrangler d1 execute --file=` behave (they handle a full multi-statement file correctly) — it is specific to calling the D1 binding's `.exec()` method directly. Production migrations still go through Wrangler's CLI exactly as documented in `migrations/README.md`; this ADR only concerns code that talks to a D1 binding directly (this sprint's validation harness, and potentially a future in-Worker admin/debug tool).
**Alternatives considered:** none — once the actual behavior was understood, the fix was immediate and the only sane option.
**Known limitations:** any future code that applies raw SQL via a D1 binding's `.exec()` method (rather than the CLI) must be aware of this line-splitting behavior.

## ADR-009: Token hashing uses fast SHA-256, password hashing uses slow PBKDF2 — deliberately different algorithms for different threat models

**Decision:** `TokenService` hashes high-entropy random tokens with a single fast SHA-256 pass (`utils/crypto.js#sha256Hex`). `PasswordService` hashes human-chosen passwords with PBKDF2-SHA256 at 600,000 iterations, a deliberately slow, salted KDF.
**Why:** these are different threat models, not "the same problem solved two ways for no reason." A token is already 256 bits of cryptographically random data — there is nothing to brute-force; the only goal of hashing it before storage is "don't leave the literal usable secret sitting in the database if it leaks," which a fast hash satisfies completely. A password is low-entropy, human-chosen input that absolutely can be brute-forced or dictionary-attacked once an attacker has the hash, which is exactly what a slow KDF with a per-record salt defends against. Using PBKDF2 for tokens too would just be wasted CPU on every single request (every session validation hashes the presented token); using a fast hash for passwords would be a real, serious security regression. Both choices come directly from `docs/SAAS_MIGRATION_BLUEPRINT.md` Phase 9's distinction between these two cases.
**Alternatives considered:** HMAC with a server-side secret key instead of a plain hash, for tokens. Rejected for this sprint — would require a new secret to manage (`SESSION_SECRET` already exists as a placeholder in `wrangler.toml`'s commented-out secrets section but isn't used anywhere yet) and adds complexity with no concrete threat it defends against beyond what a fast hash of a 256-bit random value already provides; worth revisiting if a real reason emerges (e.g. needing to invalidate all outstanding tokens of a type at once by rotating a key).
**Known limitations:** none identified for the stated threat models.

## ADR-008: 600,000 PBKDF2 iterations, self-describing stored hash format

**Decision:** `PasswordService` uses PBKDF2-SHA256 with 600,000 iterations (OWASP's 2023+ recommended floor), and stores hashes as `pbkdf2$<iterations>$<salt>$<hash>` rather than just the raw derived bytes.
**Why:** the iteration count is read from config (`security.password.pbkdf2Iterations`), so it can be raised over time as hardware gets faster, without a code change — but the iteration count used for a *given* password must also be remembered per-row, since raising the default later must not invalidate every existing password. Embedding it directly in the stored string (rather than a separate column) means `verify()` always knows exactly how that specific hash was produced, even if today's default has since changed. The `pbkdf2$` prefix also future-proofs a possible algorithm change (e.g. if Argon2 becomes available in the Workers runtime) — `verify()` can recognize and reject/migrate an old-format hash explicitly rather than guessing.
**Alternatives considered:** a fixed, hardcoded iteration count with no versioning. Rejected — would make raising the iteration count later either impossible (without invalidating every password) or require a separate migration/versioning scheme bolted on afterward; building the self-describing format in from the start is barely more code.
**Known limitations:** this sprint explicitly does not implement an actual re-hash-on-login upgrade path (rehashing an old, lower-iteration hash transparently the next time a user logs in with the correct password) — that's a natural, small addition for whichever future sprint implements login itself, flagged here so it isn't forgotten.

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
