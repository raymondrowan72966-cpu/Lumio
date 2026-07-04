# Lumio SaaS Authentication Specification
**Definitive Authentication, Invitation & Cross-Device Behaviour**

Status: design document only. No code, database tables, or Workers were created or modified. This document refines and supersedes the authentication-related sections of `SAAS_PRODUCT_SPECIFICATION.md` (Sections 1–3) — that document's other sections (Projects, Assets, Publishing, Collaboration, AI, Licensing, Notifications, Roadmap) are unaffected and remain authoritative. Where this document and that one ever appear to differ on authentication/invitation/role specifics, **this document wins**.

---

## SECTION 1 — Platform User Types (confirmed, final)

Lumio has **exactly two** account types:

1. **Workspace Owner**
2. **Workspace Administrator**

No other platform account type exists. "Reviewer," "Trainer," "Learner," "Guest," and "Instructional Designer" are **organisational responsibilities**, not account types — they describe what an Owner or Administrator *does* using the platform (personally reviewing a teammate's project, sharing an anonymous link with someone outside the workspace, assigning a published course to staff), never a distinct login, permission tier, or row in a "roles" table. Any future engineering or product proposal to add a third account type is a breaking change to this specification and must be treated as such, not as an incremental addition.

---

## SECTION 2 — Workspace Owner Registration

This is the **only** flow that creates a new workspace. It is fully self-service and public — no invitation or token is involved.

### Available authentication methods
- Google (OAuth)
- Microsoft (OAuth)
- Apple (OAuth)
- Email & Password

### Flow
```
User lands on public registration screen
        │
        ▼
Chooses an authentication method
  ├─ OAuth (Google/Microsoft/Apple): provider round-trip → returns
  │   verified email + name fields directly from the provider
  └─ Email & Password: user enters email, password (min 8 chars,
      recommend a basic strength check), first name, last name
        │
        ▼
Server validates:
  • Email not already registered (normalized: lowercased, trimmed)
  • Password meets minimum strength (Email & Password only)
  • OAuth token/identity verified with the provider (OAuth only)
        │
        ▼
SUCCESSFUL REGISTRATION
        │
        ▼
   Creates User           (id, email, name, auth method, password hash if applicable)
        │
        ▼
   Creates Workspace       (new, empty, named after the user by default — e.g. "Alex's Workspace" — editable immediately after)
        │
        ▼
   Assigns Workspace Owner role   (this user, this workspace — exactly one Owner per workspace, always)
        │
        ▼
   Signs user in           (session/token issued — see Section 5, Session Lifecycle)
        │
        ▼
   Redirects to Projects   (empty state — "Create your first project")
```

### Email verification (Email & Password registrations only)
- OAuth registrations are considered verified immediately — the provider has already proven control of the email.
- Email & Password registrations: a verification email is sent, but **does not block access** (soft gate — a persistent in-app banner until verified, full functionality available immediately). This is a deliberate decision carried over from the product specification: blocking access at signup is a larger commercial-friction risk than a short window of unverified accounts.

---

## SECTION 3 — Administrator Invitation Workflow

This is the **only** way a Workspace Administrator account comes into existence. There is no public "register as an Administrator" entry point anywhere in the product.

### Flow (Owner side)
```
Workspace Owner
        │
        ▼
  Workspace Settings
        │
        ▼
  "Invite Administrator"
        │
        ▼
  Enter:
    • First Name
    • Last Name
    • Email Address
        │
        ▼
  Choose which authentication options to PRESENT to this invitee:
    ☐ Google
    ☐ Microsoft
    ☐ Apple
    ☐ Email & Password
  (Owner selects one or more — e.g. an organisation using only
   Microsoft 365 accounts might present Microsoft only, to keep
   their team's sign-in consistent. At least one option must be
   selected; if none is chosen, default to all four.)
        │
        ▼
  Send Invitation
        │
        ▼
  Server creates an Invitation record:
    { email, firstName, lastName, allowedAuthMethods[],
      workspaceId, invitedBy, token, expiresAt, status: 'pending' }
        │
        ▼
  Invitation email sent to the entered email address,
  containing the invitation link (token embedded) and the
  inviting workspace's name.
```

**Who can do this:** Owner only (confirmed in the product specification — Administrators cannot invite other Administrators).

### Invitation Expiry

Default invitation validity: **7 calendar days** from the moment it is sent.

```
Invitation sent → status: 'pending', expiresAt = sentAt + 7 days
        │
        ▼
   7 days elapse without acceptance
        │
        ▼
   Invitation becomes invalid:
     • Token can never be reused, regardless of who attempts it
     • Workspace membership is NOT created under any circumstance
     • Clicking the link displays:

       "This invitation has expired. Please contact your
        Workspace Owner for a new invitation."

     (distinct from the "invalid/revoked" message in Section 5 —
      both result in the same outcome, but the expired case names
      the specific reason so the invitee knows to go back to their
      Owner rather than assume the link itself was wrong)
```

The 7-day window is never silently extended — an expired invitation must always be explicitly re-sent (below), which issues a brand-new token with a fresh 7-day window, not a renewal of the old one.

### Resending Invitations

A Workspace Owner may resend an invitation at any time — whether the prior one is still pending, already expired, or was sent in error with a typo'd name.

**Rules:**
- **Only one active invitation may exist per email address, per workspace, at any time.** "Active" means `status: 'pending'` and not yet expired.
- **Resending immediately invalidates every previous invitation token for that email within that workspace** — not just the most recent one, and not just expired ones. If three invitations had somehow accumulated for the same email (e.g. from retried clicks before this rule existed), resending invalidates all three at once.
- **Only the newest invitation may ever be accepted.** Any older link for that email+workspace pair, even if it hasn't technically expired yet by its own `expiresAt`, is treated as invalid the instant a newer one is created — the SECOND check in Section 4's "validate invitation token" step must therefore confirm not just "not expired" but "is this the current, latest invitation for this email+workspace," and reject otherwise with the same "invalid or has expired" message from Section 4.

**Complete invitation lifecycle (expiry + resend combined):**
```
                    ┌────────────────────────────────────┐
                    │                                    │
  Owner sends   ──► pending (expiresAt = +7 days) ──┐    │
  invitation         │                               │    │
                     │  Owner resends ───────────────┘    │
                     │  (invalidates this token,           │
                     │   creates a new 'pending' one,       │
                     │   restarts the 7-day window)         │
                     │                                      │
                     ├─► Invitee accepts before expiry  ──► accepted (terminal —
                     │   (Section 4, Scenario A or B)        token dead, cannot
                     │                                        be reused even by
                     │                                        the same invitee)
                     │
                     └─► 7 days elapse, never accepted  ──► expired (terminal —
                                                              must be re-sent to
                                                              produce a new,
                                                              acceptable token)

  Owner may also explicitly revoke a pending invitation at any
  time before acceptance (Section 5) → revoked (terminal, same
  end-state as expired from the invitee's perspective)
```

---

## SECTION 4 — Invitation Acceptance

Clicking the invitation link always performs these two checks **in this exact order**, regardless of which scenario follows:

```
FIRST:  Validate invitation token
          • Exists?
          • Not expired?
          • Not already accepted/revoked?
        → If any check fails: show an explicit error
          ("This invitation link is invalid or has expired.
            Ask the workspace owner to send a new invitation.")
          and stop. Do not proceed to account lookup.

SECOND: Check whether the invited email already has a Lumio account
        (this lookup is informational only at this point — it does
        NOT yet check what email the visitor is about to use; that
        binding check is Section 5, and happens on every subsequent
        action, not just here)
```

### Scenario A — Existing account
```
Existing account found for the invited email
        │
        ▼
  User is prompted to sign in
  (using any authentication method already on that account —
   not necessarily one of the methods the Owner "presented" in
   Section 3, since the account already exists with its own
   established method; the Owner's allowedAuthMethods selection
   only constrains a BRAND NEW registration, Scenario B below)
        │
        ▼
  Invitation re-validated against the now-authenticated identity
  (Section 5 — must match the invited email exactly)
        │
        ▼
  Administrator membership added to the inviting workspace
  (existing User row untouched — no new account, no duplicate
   identity; this person may now belong to multiple workspaces)
        │
        ▼
  Redirect to Projects (now showing the new workspace's projects,
  or a workspace selector if they belong to more than one —
  see Section 8)
```

### Scenario B — No existing account
```
No account found for the invited email
        │
        ▼
  Invitation validated (token only — confirmed already in the
  FIRST check above)
        │
        ▼
  Complete registration — invitee must provide:
    • Authentication method (limited to whichever options the
      Owner selected in Section 3's allowedAuthMethods; methods
      NOT selected by the Owner are not offered on this screen)
    • Password (Email & Password method only)
    • Confirm First Name   (pre-filled from the invitation, editable)
    • Confirm Last Name    (pre-filled from the invitation, editable)
    • Display Name         (defaults to "First Last", editable)
    • Profile Photo         (optional)
        │
        ▼
  Server validates the chosen registration email against the
  invitation's bound email (Section 5) — if the invitee tries to
  use a DIFFERENT email than the one invited, registration is
  rejected with the message specified in Section 5, even though
  the invitation token itself was valid.
        │
        ▼
  Account created
        │
        ▼
  Automatically attached to the inviting workspace
  (NOT a separate, later "join" step — this happens as part of
   the same transaction as account creation)
        │
        ▼
  Workspace Administrator role assigned
        │
        ▼
  Redirect to Projects
```

**The one rule that governs both scenarios, stated explicitly because it is the single most important invariant in this entire document:**

> **The invitation flow never creates a new workspace, under any circumstance.** Only Workspace Owner self-registration (Section 2) creates a workspace. Every Administrator, in every scenario, joins an *existing* workspace — the one whose Owner sent the invitation.

---

## SECTION 5 — Invitation Security

Invitation tokens are **bound to the invited email address**, not merely to the token string. This binding is checked at every step of Section 4, not just once at the start.

### Example
Invitation sent to `tessa@example.com`.

| Attempt | Result |
|---|---|
| Visitor clicks the link, account exists for `tessa@example.com`, signs in as `tessa@example.com` | ✅ Allowed — proceeds per Scenario A |
| Visitor clicks the link, but signs in to an *existing* account under a **different** email (e.g. `tessa.personal@gmail.com`) | ❌ Rejected |
| Visitor clicks the link, no account exists, attempts to **register** using a different email than `tessa@example.com` | ❌ Rejected |
| Visitor clicks the link, registers correctly as `tessa@example.com`, but later that SAME token/link is reused by anyone (including the original invitee, after the invitation's `status` has already flipped to accepted) | ❌ Rejected — single use, regardless of email |
| Visitor clicks a link more than 7 days after it was sent | ❌ Rejected — "This invitation has expired..." (Section 3's Invitation Expiry) |
| Visitor clicks an older link after the Owner has since resent the invitation for that same email | ❌ Rejected — only the newest token for that email+workspace is ever valid (Section 3's Resending Invitations) |

### Required rejection message (verbatim pattern)
> "This invitation was issued to **tessa@example.com**. Please sign in or register using that email address."

This message must always state the literal invited email back to the visitor — never a generic "wrong account" error — so a legitimate invitee who simply used the wrong personal account knows exactly what to do next.

### Additional rules
- Comparison is case-insensitive and whitespace-trimmed (same normalization as registration/login elsewhere in the platform).
- An invitation's token is single-use: once `status` becomes `accepted`, the link is dead — clicking it again shows "This invitation has already been used," distinct from the expired/invalid message above.
- Revoking an invitation (Owner action, not yet specified elsewhere — added here for completeness) immediately invalidates the token, same end-state as expiry.

---

## SECTION 6 — Cross-Device Behaviour

This section exists because the production issue that originally triggered the SaaS migration was a violation of exactly this expectation — it is the primary thing this specification must guarantee.

### Expected behaviour
```
Administrator registers on PC (via invitation, Section 4)
        │
        ▼
   Logs out on PC
        │
        ▼
   Opens Lumio on a laptop, signs in with the SAME email/password
   (or the SAME OAuth account, if that was their method)
        │
        ▼
   SAME account            (one User row, looked up server-side —
                             never a browser-local concept)
        │
        ▼
   SAME workspace           (membership is a server-side record tied
                             to the User's id, not to any device)
        │
        ▼
   SAME permissions         (role is read from the membership record,
                             identical regardless of device)
        │
        ▼
   NO RE-INVITATION REQUIRED
```

This identical guarantee applies uniformly across **every** device, with no exceptions and no special-casing of any one of them:

```
Desktop → Laptop → Tablet → Phone → Any browser, on any of the above
```

Each of these is simply "a device that has never authenticated this session before" — the only thing that ever matters is the credentials/OAuth identity presented, never which device, browser, or browser profile is asking. **Workspace membership must be byte-for-byte identical regardless of which device is asking** — same workspace(s), same role in each, same everything — because membership is read from one server-side record per (user, workspace) pair, never derived from or cached per-device. **No additional invitation is ever required** to use an already-accepted membership from a new device — invitations exist solely to *create* a membership the first time; they are never re-checked or re-required afterward.

**The architectural requirement this implies (already specified in the migration blueprint, restated here because it's the direct cause of the original bug):** authentication state must be resolved against a single, shared, server-side source of truth (Users + Sessions tables), never anything stored only in one browser. A session is *per device* (Section 7), but the *account and its workspace membership* are never per-device.

---

## SECTION 7 — Remember Me / Session Lifecycle

### Remember Me
- Stores **only a session/refresh token**, never the password and never any derivative of it, on the device.
- **Checked**: long-lived refresh token (recommend 30 days, sliding — each use extends the expiry), survives full browser/app close.
- **Unchecked**: session-scoped token only — cleared when the browser session genuinely ends (browser fully closed, not just the tab/refresh).

### Session lifecycle
```
Login succeeds
        │
        ▼
  Session created (one row per device/browser — NOT a single
  global session object; this is what makes Section 6 possible
  at all)
        │
        ├──► Access token issued (short-lived, ~15 min)
        │         │
        │         ▼
        │    Silently refreshed using the refresh token as it nears
        │    expiry — transparent to the user, no re-login prompt,
        │    UNLESS the refresh token itself has also expired/been
        │    revoked, in which case: return to login with
        │    "your session expired, please sign in again"
        │
        ├──► Logout (this device only)
        │         │
        │         ▼
        │    THIS session's refresh token is revoked server-side.
        │    Every other device's session is completely unaffected —
        │    this is the literal fix for "logging out on the laptop
        │    didn't affect the desktop," which a single shared
        │    session object could never represent correctly.
        │
        └──► Password Reset (Section 2/4 of the product spec)
                  │
                  ▼
             EVERY active session for that account, on every device,
             is revoked immediately — this is the one event that
             intentionally affects all devices at once, since a
             password reset implies the account may have been
             compromised and every existing session's continued
             trust should not be assumed. The user who just reset
             the password is, of course, signed in fresh immediately
             after on the device they reset it from.
```

---

## SECTION 8 — Future Multi-Workspace Behaviour (design only — explicitly not implemented)

```
User signs in once
        │
        ▼
  Server resolves ALL workspace memberships for this User
        │
        ▼
  Exactly one membership found?
    ├─ Yes → enter that workspace directly (today's effective
    │         behaviour, preserved as the common case)
    └─ No (zero or multiple) →
              │
              ▼
       Workspace selector shown
       (lists every workspace this User belongs to, with their
        role — Owner or Administrator — shown per workspace)
              │
              ▼
       User chooses a workspace
              │
              ▼
       Enters that workspace (Projects screen, scoped to it)
```

- The selected workspace becomes the "last active" workspace (Section 3 of the product specification already establishes this as the default-workspace rule) — returning users skip the selector and land directly in their last-active workspace, with a visible "Switch workspace" control always available rather than being forced through the selector every time.
- A single sign-in always resolves to a single User identity; *which* workspace context is active is a separate, lightweight selection on top of that identity, never a separate login.
- This section is explicitly **not implemented in Phase 2** — Phase 2 ships with the implicit single-workspace-per-Owner assumption still in effect for newly-registered Owners (which remains accurate, since Owner registration only ever creates one workspace), and the *only* way to reach the multi-membership case in Phase 2 is via Administrator invitations into more than one workspace, which the workspace selector above must already handle correctly even before any further multi-workspace UI is built.

---

## SECTION 9 — Email Change Policy

**Core principle: identity is the account (its internal id), not the email string.** An email address is a contact/login attribute attached to an account — it is never the account itself, and it must never be treated as a stable foreign key anywhere in the system beyond "the current value used to look someone up at login time."

### Example
```
Workspace Owner invites john@company.com
        │
        ▼
   John accepts invitation (Section 4)
        │
        ▼
   Six months pass — John is a normal, active Administrator
        │
        ▼
   John changes his email to john.smith@company.com
   (from his own account settings — a self-service action,
    not something a Workspace Owner does on his behalf)
        │
        ▼
   Nothing about his workspace membership changes
```

### Rules

1. **Email changes are permitted at any time**, self-service, from the user's own account settings. (Recommend, though not mandated by this spec: require re-entering the current password or re-confirming via OAuth before allowing the change, and send a confirmation email to the *new* address before the change takes effect, to prevent account-takeover via a compromised session changing the recovery email silently.)
2. **Changing an email address never changes workspace membership.** John remains an Administrator of exactly the same workspace(s) he was already a member of, with exactly the same role(s) — membership is keyed to the account's internal id, never to the email string.
3. **User identity is the account, not the email.** Every reference elsewhere in this specification to "the invited email," "the registered email," etc. is shorthand for "the email value on the account at that point in time" — never an assumption that the email is permanent or unique-forever.
4. **Future sign-ins use the new email address.** The old address stops working for login immediately once the change is confirmed (no grace-period dual-login window, to avoid the confusion of two valid emails for one account).
5. **Existing sessions remain valid** unless a specific security policy requires re-authentication on email change (a product/security decision left open here — Section 7's password-reset-revokes-all-sessions precedent is the natural model to reuse if a stricter policy is later wanted, but is not assumed by default for an email change alone, since changing an email is a much lower-risk action than resetting a password).
6. **Invitations and historical audit records remain linked to the user account**, not to the email string — an invitation record's `email` field reflects the address *at the time it was sent*, and any audit log entry referencing "John" continues to resolve to the same account and display his current name/email, not a frozen snapshot of the old one.
7. **The previous email address becomes available for reuse** (e.g. by a different person registering with it, or being invited under it) **only after it is no longer attached to any Lumio account** — i.e., once John's change to `john.smith@company.com` is committed, `john@company.com` is immediately free, since exactly one account can ever hold a given email at a time (the uniqueness constraint from Sections 2/4 applies to "currently attached," not "ever used").

---

## Summary — the required lifecycles, cross-referenced

1. **Revised authentication specification** — Sections 2, 3, 4 (registration and invitation flows in full).
2. **Invitation specification** — Section 3 (Owner side, including Expiry and Resending) + Section 4 (acceptance, both scenarios).
3. **Cross-device authentication specification** — Section 6.
4. **Invitation security specification** — Section 5 (now including expiry and resend-invalidation as explicit rejection cases).
5. **Session lifecycle** — Section 7.
6. **Registration lifecycle** — Section 2.
7. **Administrator onboarding lifecycle** — Section 3 + Section 4, Scenario B specifically (the full first-time-Administrator path from invitation to Projects).
8. **Workspace membership lifecycle** — Section 4 (both scenarios' membership-attachment step) + Section 8 (what membership means once a User can hold more than one) + Section 9 (confirming membership survives an email change untouched).
9. **Invitation expiry & resend lifecycle** — Section 3 (the complete pending → accepted/expired/revoked state diagram, plus the resend-invalidates-prior-tokens rule).
10. **Email change lifecycle** — Section 9.

No code, schema, or backend infrastructure was created as part of this sprint. This document is the authoritative authentication specification referenced by `SAAS_MIGRATION_BLUEPRINT.md` (Phase 4) and supersedes `SAAS_PRODUCT_SPECIFICATION.md` Sections 1–3 wherever the two might otherwise be read as being in tension.
