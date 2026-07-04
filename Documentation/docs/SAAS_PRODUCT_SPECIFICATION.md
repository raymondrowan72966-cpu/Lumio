# Lumio SaaS Product Specification
**User Workflows & Platform Behaviour**

Status: design document only. No code was implemented or modified. This is the functional companion to `SAAS_MIGRATION_BLUEPRINT.md` — that document defines the technical *how*; this one defines the product *what* and *why*, in enough detail that another developer could implement against it.

---

## SECTION 1 — User Types

**Correction from the prior draft of this document:** that draft introduced Instructional Designer, Reviewer, Trainer, Learner, Guest, and Platform Administrator as platform account types. That was incorrect and is withdrawn. Lumio has **exactly two** platform account types, by deliberate product decision — anything resembling "reviewer," "trainer," or "learner" is an *organisational* responsibility (something a Workspace Owner/Administrator manages using the platform — e.g., sharing a review link, assigning a course to staff) and never a distinct Lumio authentication role, account, or login. The codebase today already reflects this correctly (`ROLE_WORKSPACE_OWNER`, `ROLE_ADMINISTRATOR` — confirmed in `app.js`/`workspaceSettings.js`); the two roles below are final, not a Phase 2 subset of a larger future list.

| Role | Permissions | Restrictions | Typical workflows |
|---|---|---|---|
| **Workspace Owner** | Registers directly (Google, Microsoft, Apple, or Email). Owns the workspace and the subscription/billing. Full platform permissions: invite/remove Administrators, all project CRUD, publishing, workspace settings, workspace deletion. | Cannot access other workspaces unless separately invited into one as an Administrator. There is exactly one Owner per workspace. | Registers, workspace is auto-created with them as Owner, invites Administrators, manages billing and subscription, authors and publishes content. |
| **Workspace Administrator** | Full project CRUD, publishing, and day-to-day authoring within the workspace they were invited into. | **Cannot self-register as an Administrator** — this account type only ever comes into existence via an Owner's invitation (see Section 2/3). Cannot delete the workspace, cannot manage billing, cannot remove the Owner. | Receives an email invitation from an Owner → accepts it → (registers first if no account exists, or joins immediately if one does) → authors/publishes content alongside the Owner. |

**What this means for everything else in this document:** any workflow elsewhere that referred to a "Reviewer" approving content, a "Trainer" assigning courses, or a "Learner" account is now reframed as something a Workspace Owner or Administrator *does within the platform* (e.g., they personally review and approve a project, they personally share a published export with whoever needs to take it) — not a separate login or permission tier. Sections 6, 7, 9, and 11 below have been revised accordingly. There is no "Guest" or "Platform Administrator" account type either; external stakeholder access (Section 4's link-sharing) is anonymous and unauthenticated, not a third account tier, and Lumio's own internal support access (if ever needed) is an operational/infrastructure concern, not a platform role to design here.

---

## SECTION 2 — Authentication Journey

### Registration — Workspace Owner (self-service, public)
1. User submits email/password (or OAuth: Google, Microsoft, Apple) on the public marketing/login page. This is the **only** path that creates a new workspace.
2. Server validates email format + uniqueness (normalized lowercase), password strength (today's "min 6 characters" is too weak for a real SaaS — recommend min 8 + a basic strength check, not a Phase 2 blocker but worth deciding before launch).
3. Account created in `unverified` state. Workspace auto-created, user becomes its Owner (mirrors today's `_bindNewUserToWorkspace` exactly).
4. Verification email sent. **Product decision, not yet made**: should unverified accounts be allowed to use the product immediately (soft gate, banner reminder) or blocked until verified (hard gate)? Recommend **soft gate** for Phase 2 — friction at signup is a bigger commercial risk than a few unverified accounts poking around a free trial.

### Registration — Workspace Administrator (invitation-only, never public)
There is no public "create an Administrator account" path anywhere in the product — this account type exists exclusively as the result of an Owner's invitation (Section 3 has the full Workspace-side flow; this is the account-creation half of it):
1. Owner invites by email from within their workspace. An invitation record is created and an email sent.
2. Invitee clicks the link. Server checks whether that email already has a Lumio account:
   - **Account exists**: invitee authenticates (login, same as any normal login) and the workspace membership is attached immediately — no new account is created, no duplicate identity, mirrors today's `acceptInvitation` exactly.
   - **No account exists**: invitee is taken through the same registration form as Owner self-service (email/password or OAuth), but completing it **does not** auto-create a new workspace the way Owner self-registration does — it instead completes the pending invitation and attaches them to the inviting Owner's workspace as an Administrator. This is the one branch point in the registration flow: *was this registration reached via an invitation token, or not* — that token's presence is what decides "new workspace + Owner" vs. "join existing workspace + Administrator," not anything the user chooses themselves.

### Email Verification
- Token-based link (same TTL pattern as password reset — 1 hour is too short for *email* verification specifically; recommend 24–48 hours, since people don't always check email immediately).
- Resend-verification action available from the in-app banner, rate-limited (e.g., 1 per 5 minutes) to prevent email-bombing abuse.

### Login
- Email + password, or OAuth. Same UI as today, server-backed instead of `LumioState.users.find(...)`.
- **Locked Accounts**: after N consecutive failed attempts (recommend 5) within a window (recommend 15 minutes), lock the account for a cooldown period and notify the user by email ("a sign-in attempt failed repeatedly"). This does not exist today and is a Phase 2 requirement — it's the most basic brute-force defense and currently has zero protection (client-side comparison can't rate-limit anything).

### Remember Me
- Checked: long-lived refresh token (30 days, sliding — each use extends it), survives full browser close.
- Unchecked: session-only token, cleared when the browser actually closes (this is the literal behavior the current `sessionStorage` tab-marker hack approximates locally; server-side this becomes a real short-lived session cookie).

### Forgot Password / Reset Password
- Same flow as today (request → emailed link → set new password), with a *real* email send instead of a console.log. No behavioral change needed beyond that — this flow is already correctly designed.
- On successful reset: **all other active sessions for that account are revoked** (a security best practice absent today, since today there's only one session object to begin with). The user is shown "you've been signed out of all other devices."

### Logout
- Revokes that one session's refresh token server-side. Other devices' sessions are unaffected (this is the literal fix for "logout on laptop didn't affect desktop," which the current single-`session`-object model cannot represent at all).

### Expired Sessions
- Access token expires (~15 min) → silent refresh using the refresh token, transparent to the user, unless the refresh token is also expired/revoked, in which case the user is returned to login with a "your session expired, please sign in again" message — never a silent blank screen or a confusing error.

### Multiple Devices / Session Management
- New "Active Sessions" panel in account settings (does not exist today): lists device/browser, location (coarse, IP-based), last active time, with a "Sign out" button per session and a "Sign out of all other devices" bulk action. This is the user-facing surface for the `sessions` table designed in the migration blueprint.

### OAuth (future)
- Same abstraction as today's mock (`loginWithProvider`/`_mockProviderPayload`/`_fieldsFromPayload`) — swap the mock payload for a real provider callback. No workflow change for the user; "Continue with Google/Microsoft/Apple" behaves identically to today's mock, just backed by a real account.

### Account Deletion
- User-initiated from account settings, requires password re-entry (or re-auth via OAuth) as a confirmation step — never a single click.
- If the user is the **sole Owner** of one or more workspaces with other members in them: block deletion, require ownership transfer first (Section 3) — never silently orphan a workspace's content.
- If the user is the sole member of their own workspace: deletion cascades per the schema in the migration blueprint (workspace, projects, everything) after a confirmation showing exactly what will be lost, plus a short "grace period" (recommend 14 days, soft-deleted, recoverable) before permanent purge — mirrors the existing Trash pattern already used for projects today, just applied one level higher.

---

## SECTION 3 — Workspace Behaviour

- **Creation**: automatic at registration (today's behavior, unchanged) — every self-registering user gets exactly one workspace and is its Owner. No separate "create a workspace" flow needed for Phase 2.
- **Ownership**: exactly one Owner per workspace at any time (today's model — confirmed, no co-ownership exists). Owner is the only role that can delete the workspace or change billing.
- **Workspace Switching**: once a user can belong to >1 workspace (via invitations), a workspace switcher appears in the top nav (new UI — doesn't exist today, since today's model assumes exactly one workspace per user). Switching changes the active `workspaceId` context for every subsequent screen; recommend persisting "last active workspace" so a returning user lands where they left off, not a workspace picker every time.
- **Invitations**: **Owner-only** action (Administrators cannot invite other Administrators — only the Owner can grow the workspace's membership). There is only one invitable role, since Administrator is the only role that can be invited into an existing workspace. Invitee who already has a Lumio account: invitation appears as a notification + in an "Invitations" inbox; accepting adds a `workspace_members` row without creating a new user (mirrors today's `acceptInvitation`, which already gets this right). Invitee without an account: invitation link leads to registration (Section 2's invitation-token branch), then auto-accepts into that workspace as an Administrator.
- **Removing Users**: **Owner-only** — removes an Administrator's membership; that person's *personal* account is untouched, only the membership row is deleted. Their authored content stays in the workspace (ownership of content is workspace-level, not personal — already true today since Projects belong to a workspace, not directly to a user).
- **Transferring Ownership**: Owner selects an existing Administrator and confirms transfer; old Owner becomes an Administrator, never removed automatically. Required precondition for an Owner to delete their own account while others remain in the workspace (Section 2).
- **Deleting Workspaces**: Owner-only, requires typing the workspace name to confirm (standard "destructive confirmation" pattern), soft-deleted with a grace period before permanent purge, same as account deletion above.
- **Leaving Workspaces**: any non-Owner member can leave voluntarily; Owner cannot leave without transferring ownership first.
- **Default Workspace**: for a user in multiple workspaces, "default" = last active, not a separately-configured setting — simpler, and matches how most multi-tenant SaaS products actually behave (Slack, Notion, etc.).
- **Multiple Workspaces**: explicitly supported once invitations are real (Phase 2/3 boundary — see Section 11) — e.g., a person could be the Owner of their own workspace and also an Administrator inside someone else's. A user's identity (login, profile) is global; their role (Owner or Administrator) is always evaluated per-workspace, never global.

---

## SECTION 4 — Project Behaviour

- **Creation**: unchanged from today — Owner or Administrator creates a project inside a workspace, optionally inside a folder.
- **Folders**: unchanged — simple, single-level-or-shallow organizational containers, exactly as they exist today (`projects.js`).
- **Moving Projects**: drag-and-drop or explicit "Move to folder" action between folders within the same workspace; moving a project *between workspaces* is explicitly **not supported** (would require copying every asset reference and re-checking permissions — treat as Future, achievable today only via export-`.lumio`-then-import as a manual workaround, which already exists).
- **Deleting**: soft delete into Trash (today's `project.deleted`/`deletedAt` pattern, unchanged), workspace-scoped — any member with delete permission can restore from Trash within a retention window (recommend 30 days), after which it's permanently purged by a scheduled job.
- **Recovering**: restore from Trash, full-fidelity (today's soft-delete-and-filter approach already supports this trivially).
- **Sharing**: new capability. Two tiers: (1) **internal** — share with specific Administrators beyond the default "everyone in the workspace can see every project" assumption, useful once workspaces grow large; (2) **external link** — read-only, time-boxed, optionally password-protected, for a stakeholder (a reviewer, a trainer, anyone outside the workspace) to view without ever needing a Lumio account at all. This is purely an anonymous, unauthenticated link — not a third account type; the Owner/Administrator who generates the link is fully responsible for who they send it to, the same way sharing a Google Doc link doesn't require the recipient to have a Google account. Internal sharing is Phase 2/3-reasonable; external link sharing is Phase 3.
- **Permissions**: project-level permission overrides (e.g., "only these 3 people can edit this specific project") are explicitly **Future**, not Phase 2/3 — start with workspace-level roles only (everyone with edit rights in the workspace can edit every project) and only add per-project ACLs if real customer demand appears; this avoids building a permissions system nobody asked for yet.
- **Duplicating**: clone a project (deep-copy all lessons/blocks, re-pointing asset references to the *same* underlying assets, not copying binary data — directly reuses the existing content-addressed asset model).
- **Templates**: a project can be marked "Template" (workspace-scoped); creating from a template is the same as duplicating, just sourced from a flagged project rather than an arbitrary one. No new technical mechanism needed — this is a UI/flagging feature on top of Duplicating.
- **Archiving**: distinct from deleting — an Archived project is hidden from default views but not soft-deleted/Trash-bound, and (unlike Trash) has no auto-purge timer. Useful for "this course is retired but we want to keep it forever for compliance," a different intent than "I deleted this by mistake."

---

## SECTION 5 — Asset Library

- **Uploading**: unchanged in spirit from today's `AssetStore.put` — content-addressed by hash, deduplicated automatically. Server-side adds MIME validation and size limits (tied to the plan limits in Section 9).
- **Replacing**: "Replace image" on an existing block uploads a new asset and re-points that block's reference; the *old* asset is not deleted immediately — its `ref_count` simply drops, and it's only eligible for cleanup once no block anywhere references it (already the correct mental model from the migration blueprint's schema).
- **Deleting**: only ever a "remove this reference" action from the author's point of view; actual deletion of the underlying binary happens automatically once `ref_count` hits zero — never a direct, explicit "delete this asset" action that could break another lesson silently.
- **Unused Assets**: a new "Unused Assets" view (does not exist today) lists assets with `ref_count = 0` that haven't yet been garbage-collected, with a manual "clean up now" action — useful for workspaces near their storage limit (Section 9).
- **Shared Assets / Workspace Assets**: every asset is workspace-scoped (not project-scoped) today via the dedup model, which already means an image uploaded in Project A is reusable in Project B without re-uploading — this is a feature, not a gap, and should be made *visible* to authors via a proper Asset Library browser/picker (new UI, not new architecture).
- **Versioning**: explicitly **not** content-addressed history (that's what "Replace" does — it's a new asset, old one fades out via ref-counting). True version history (keep old versions browsable/revertible) is Future — Phase 2/3 only needs "replace creates a new asset," not "see asset version 1 vs version 2."
- **Large Files**: enforce size limits per plan tier (Section 9) at upload time with a clear error, not a silent failure; large video in particular should support chunked/resumable upload (R2 supports multipart upads) rather than a single request that times out.
- **Duplicate Detection**: already solved by the existing SHA-256 content-addressing — uploading the exact same file twice (even across different projects) is automatically deduplicated. The only thing missing today is *visibility* — the author doesn't currently see "this image already exists in your library," which is worth surfacing in the upload UI (e.g., a checksum check client-side before upload, with a "this asset already exists, reuse it?" prompt) to save upload bandwidth, not just storage.

---

## SECTION 6 — Publishing

### Lifecycle states
```
Draft → In Review → Approved → Published → Archived
              ↑___________________|
            (Rejected → back to Draft)
```
- **Draft**: default state, freely editable, not visible to learners.
- **In Review**: author (Owner or Administrator) requests review from another Owner/Administrator in the same workspace (Section 7); content is editable but flagged.
- **Approved**: another Owner/Administrator in the workspace has signed off; content is still not yet exported/distributed — this is an internal sign-off state, distinct from actually publishing. There is no separate Reviewer account — review is just one Owner/Administrator looking at another's work, the same permission tier reviewing itself, not a distinct role.
- **Published**: an export (HTML/SCORM/xAPI/PDF) has been generated and is the "live" version; further edits move the project back toward Draft *for the next version* without affecting the already-published package (see Version History below).
- **Archived**: explicitly retired (Section 4) — typically only reachable from Published, not from Draft, since you don't usually archive something that was never live.

This already matches today's `project.status` field (`draft`/`in_review`/`approved`) almost exactly — Phase 2 just needs to add `published` and `archived` as real states and wire the publish action to set them, rather than treating "Approved" as the final state as it loosely is today.

### Export formats
- HTML, SCORM 1.2, SCORM 2004 (2nd/3rd/4th), xAPI, PDF — unchanged from today's existing, already-validated export pipeline (`publish*Package` functions). The only architectural change (per the migration blueprint) is *where* generation happens (Worker instead of browser) and that the resulting package is stored (R2) rather than only downloaded once.

### Version History
- Each "Publish" action creates an immutable snapshot (new capability — `course.publishHistory[]` today only records lightweight metadata, not full content snapshots). Authors can view past published versions and **roll back** (re-publish an old snapshot as the new live version) without losing the in-progress Draft work sitting on top of it. This is a meaningfully new capability worth scoping carefully — recommend Phase 3, not Phase 2, since it requires real storage of full snapshots, not just metadata.

### Rollback
- A rollback creates a *new* publish event pointing at old content, rather than mutating history — version history should always be append-only, exactly like the audit log philosophy in the migration blueprint.

---

## SECTION 7 — Collaboration

Collaboration here is entirely between Owners and Administrators of the *same* workspace — there is no separate Reviewer/Trainer account on the other side of any of this. "Review" means one teammate looking at another teammate's work using the exact same platform permissions.

- **Review Workflow**: author (Owner or Administrator) moves a project to "In Review," optionally tagging a specific teammate (any other Owner/Administrator in the workspace) to look at it; that person sees it in a "Needs My Review" queue alongside their normal authoring work.
- **Comments**: new capability (schema already defined in the migration blueprint — `comments` table). Comments attach to a project, optionally scoped to a specific lesson/block, with resolve/unresolve state.
- **Approvals / Rejections**: the tagged teammate's terminal action on a review — Approve moves the project to "Approved" (Section 6); Reject moves it back to "Draft" with the rejection comment highlighted/pinned so the author knows exactly what to address.
- **Notifications**: every state transition above (review requested, comment added, approved, rejected) generates a notification (Section 10).
- **Mentions**: `@name` inside a comment notifies that specific teammate directly, in addition to the general "new comment" notification — a small but high-value feature once comments exist; can ship in the same release as Comments rather than as a separate phase.
- **Assignments**: explicit "assign this project/review to [teammate]" action, distinct from just having them in the workspace — surfaces in their "Needs My Review" / "Assigned to Me" queues. This is a lightweight, per-project pointer (who's currently responsible for acting on this), not a permission change — the assignee already had full access as an Administrator/Owner regardless.
- **Activity History**: a per-project timeline (created, edited by whom, status changes, comments, publishes) — this is a *read* view over the same `audit_logs` table from the migration blueprint, scoped to one project, not a separate subsystem.

---

## SECTION 8 — AI Behaviour

Today's "AI Assistant" is a UI-only panel (`BuilderUI.aiOpen`) with no real model call and no persisted history — everything below is genuinely greenfield, not a migration.

- **AI Permissions**: workspace-level toggle (Owner can enable/disable AI features for the whole workspace — relevant for organisations with content-policy concerns) plus a per-plan-tier gate (Section 9).
- **Usage Tracking**: every AI call logged (workspace, user, timestamp, token count) — required for both billing (Credits, below) and abuse monitoring.
- **Credits**: AI usage consumes a metered credit pool, reset monthly per plan tier; clear in-UI indicator of remaining credits, with a graceful "you're out of AI credits this month, upgrade or wait until [date]" state rather than a silent failure.
- **Prompt History**: persisted per-project (new capability) — "what did I ask the AI about this lesson" should be reviewable later, not lost on tab close as it would be today.
- **Workspace AI**: shared context option — AI suggestions can optionally draw on the workspace's existing course library for tone/style consistency (Future — meaningfully more complex, needs its own data-handling/privacy review before committing to a phase).
- **Private AI**: a user's own prompts/drafts are visible only to them until/unless explicitly shared into a project's comment thread or similar — default to private, not workspace-visible, to avoid surprising authors.
- **Future Billing**: AI credits are the natural metered-billing hook (Section 9) — usage-based add-on pricing on top of the flat per-seat tiers, common in this product category.

---

## SECTION 9 — Licensing

| | Free | Professional | Enterprise |
|---|---|---|---|
| **Workspaces** | 1 | 1 (multiple = add-on) | Multiple, included |
| **Users per workspace** | 2 | 10 | Unlimited (or large fixed cap, negotiated) |
| **Storage** | 500MB | 25GB | Custom/negotiated |
| **AI credits/month** | Small fixed trial amount | Moderate fixed amount, top-ups available | Custom/negotiated, or unmetered |
| **Exports/month** | Limited (e.g., 10) | Unlimited | Unlimited |
| **Support** | Community/self-serve | Email | Dedicated/SLA |
| **SSO/OAuth** | Personal Google/Microsoft/Apple only | Same | Real enterprise SSO (SAML/OIDC) — Future, not Phase 2/3 |
| **Audit log retention** | None visible to customer | 30 days | 1 year+ |

This table is a starting *shape*, not final pricing — the numbers are illustrative placeholders for engineering to build limit-checking against, not a finalized commercial decision (that's a business/product call outside this document's scope). What **is** an architectural requirement regardless of final numbers: every limit above (seats, storage, AI credits, exports) needs a single, server-enforced check point per workspace — never a client-side count, for the same reason permissions can't be client-enforced (Phase 4 of the migration blueprint).

---

## SECTION 10 — Notifications

| Trigger | Email | In-app |
|---|---|---|
| Workspace invitation received | Yes | Yes |
| Invitation accepted (to the inviter) | Optional (digest-friendly) | Yes |
| Review requested (to assigned teammate) | Yes | Yes |
| Comment added (to mentioned/assigned users) | Optional (digest-friendly) | Yes |
| Project approved/rejected (to author) | Yes | Yes |
| Publish succeeded/failed | Yes (failure especially) | Yes |
| Password changed/reset | Yes (security-relevant, always) | No (already acted on) |
| New device login (Section 2) | Yes (security-relevant, always) | No |
| AI credits running low | Optional | Yes |
| Storage approaching limit | Yes | Yes |

General rule: **security-relevant notifications (password change, new device, account deletion) are always emailed, never optional, never digest-batched.** Everything else can reasonably be digest-batched (e.g., hourly/daily) once volume grows, to avoid notification fatigue — but Phase 2 can ship immediate-send for everything and add digesting later without any architectural rework, since it's purely a delivery-timing decision on top of the same `notifications` table already designed.

---

## SECTION 11 — Future Roadmap

| Phase 2 (ship with initial SaaS launch) | Phase 3 (next 1–2 releases after launch) | Future (no committed timeline) |
|---|---|---|
| Real auth (Section 2, minus locked-account email and active-sessions UI if time-constrained) | Active Sessions management UI | External link sharing (anonymous, unauthenticated) |
| Workspaces, Owner-only invitations of Administrators (the two-role model is final, not a Phase 2 subset) | Project Sharing (internal, within the workspace) | Asset versioning (true multi-version history) |
| Projects, Folders, Trash, Duplicate | Templates, Archiving | Full Publish Version History + Rollback |
| Lessons/Blocks/Assets on the new backend (parity with today, not new features) | Asset Library browser UI, Unused Assets view | Workspace AI (shared-context suggestions) |
| Publishing (existing 7 export formats, same fidelity) | Review workflow (Owner↔Administrator), Comments, Approvals/Rejections, Activity History | Enterprise SSO (SAML/OIDC), custom contracts |
| Notifications (immediate-send, the table above) | Mentions, Assignments, digest batching | Per-project permission overrides (ACLs beyond the Owner/Administrator split) |
| Licensing limit *enforcement* scaffolding (even if Free-tier-only at first) | AI Assistant real implementation (prompts, credits, history) | |
| | Multiple workspaces per user + workspace switcher | |

**Explicit non-goals — not just for Phase 2, but indefinitely unless the product decision changes:** introducing any account type beyond Workspace Owner and Workspace Administrator (no Reviewer, Trainer, Learner, Guest, or Platform Administrator logins — those remain organisational uses of the existing two roles, e.g. an Administrator personally reviewing a teammate's work, or an Owner sharing an anonymous link with a trainer). **Other non-goals for Phase 2 specifically:** real-time multi-user co-editing (operational transform/CRDT), enterprise SSO, per-project ACLs, asset version history, AI shared-context features. Each either depends on something earlier in this table not existing yet, or represents a level of investment that should only happen once there's committed customer demand, not speculatively.

---

## Diagrams

### Authentication Lifecycle
```
Register → Unverified → (soft gate: full access with banner)
                 │
                 ▼
         Verify Email → Verified
                 │
    ┌────────────┴────────────┐
    ▼                         ▼
  Login                  OAuth Login
    │                         │
    └────────────┬────────────┘
                 ▼
         Session Established
         (one row per device)
                 │
        ┌────────┼─────────┐
        ▼        ▼         ▼
    Refresh   Logout    Expire/Revoke
   (sliding)  (this      (re-auth
              device      required)
              only)
```

### Workspace Lifecycle
```
Auto-created at Registration → Owner assigned
        │
        ├─→ Invite members → Accept → Membership created
        ├─→ Remove member → Membership deleted (content stays)
        ├─→ Transfer ownership → old Owner becomes Administrator
        └─→ Delete (Owner only) → Soft-deleted (grace period) → Purged
```

### Project Lifecycle
```
Created → Draft ⇄ In Review ⇄ Approved → Published ⇄ (re-edit → new Draft) 
                                              │
                                              ▼
                                          Archived
   (any state) → Deleted (Trash, recoverable) → Purged (after retention window)
```

### Publishing Lifecycle
```
Draft → In Review → Approved → Publish Action → Snapshot stored (Version N)
                                                        │
                                          ┌─────────────┴─────────────┐
                                          ▼                           ▼
                                   Export generated            Available for Rollback
                                (HTML/SCORM/xAPI/PDF)           (re-publish old snapshot)
```

### Review Lifecycle
```
Author (Owner/Administrator) requests review →
   assigned teammate (another Owner/Administrator) notified → "Needs My Review" queue
        │
        ▼
   Teammate reads + comments
        │
   ┌────┴────┐
   ▼         ▼
Approve   Reject
   │         │
   ▼         ▼
Approved   Draft (rejection comment pinned)
```

---

## Permission Matrix (final — Owner and Administrator are the only two platform roles)

| Action | Workspace Owner | Workspace Administrator |
|---|---|---|
| Manage billing | ✅ | ❌ |
| Delete workspace | ✅ | ❌ |
| Invite Administrators | ✅ | ❌ |
| Remove Administrators | ✅ | ❌ |
| Transfer ownership | ✅ (initiates) | — (becomes new Owner if accepted) |
| Create/edit/delete projects | ✅ | ✅ |
| Publish | ✅ | ✅ |
| Comment / Approve / Reject (Section 7) | ✅ | ✅ |
| Manage AI settings | ✅ | ✅ (if granted by Owner) |
| Generate an external share link (Section 4) | ✅ | ✅ |

Anonymous viewers of an external share link have no row here — they are not authenticated, not a role, and have exactly the access the link itself grants (read-only, time-boxed), nothing more.

---

## Product Recommendations

1. **Keep the two-role model exactly as specified — do not introduce a third account type later without a deliberate, separate product decision.** It is tempting, once review/comment workflows exist, to want a lighter-weight "Reviewer" login for someone who only ever approves/rejects. Resist this: per this sprint's explicit correction, that responsibility belongs to an Administrator using the platform, not a new account tier, and introducing one later would be a real breaking change to the permission model documented here, not an additive one.
2. **Ship Comments/Review before AI.** The AI Assistant is currently a non-functional placeholder with no real product validation yet; Collaboration (Section 7) is a more concrete, lower-risk win that several Sections (Notifications, Activity History) already depend on conceptually.
3. **Keep "Replace asset" simple in Phase 2 — resist building version history early.** It's tempting to bundle real asset versioning with the Asset Library work in Phase 3, but it's a meaningfully larger feature (storage cost, UI for browsing versions, rollback semantics) than the ref-counted replace model the current architecture already supports almost for free.
4. **Decide the licensing numbers before Phase 2 engineering starts, not during.** The limit-*enforcement* scaffolding (server-side seat/storage/export/AI-credit checks) needs to exist in Phase 2 regardless of what the final numbers are — but the numbers themselves are a business decision that shouldn't block engineering from building the check itself against placeholder values.
5. **Do not build external-link sharing until internal Project Sharing has shipped and been used.** External sharing inherits every security consideration of internal sharing plus link-based access risk (anyone with the link can view, regardless of account) — sequencing it after, not alongside, reduces the surface area to get right at once.
