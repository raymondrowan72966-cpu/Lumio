/* ============================================================
   LUMIO PROTOTYPE — APP SHELL, ROUTER, STATE
   ============================================================ */

/* ============================================================
   LUMIO SESSION — server-authenticated state (Step 5)

   In-memory only — never written to localStorage. Populated by
   LumioAPI.auth.session() on page load, LumioAPI.auth.login() on
   sign-in, and LumioAPI.auth.register() on registration. Cleared by
   LumioAPI.auth.logout() on sign-out.

   getCurrentUser() and getCurrentWorkspace() read from here first;
   they fall back to the legacy LumioState.session + LumioState.users[]
   path so existing prototype users (stored in localStorage from before
   the real backend existed) continue to work without any data migration.
   ============================================================ */
const LumioSession = (function () {
  var _auth = { isAuthenticated: false, user: null, workspace: null, membership: null };

  return {
    get: function () { return _auth; },
    set: function (data) {
      _auth = {
        isAuthenticated: !!(data && data.user),
        user: data ? data.user : null,
        workspace: data ? data.workspace : null,
        membership: data ? data.membership : null,
      };
    },
    clear: function () {
      _auth = { isAuthenticated: false, user: null, workspace: null, membership: null };
    },
  };
})();

const LumioState = {
  projects: JSON.parse(JSON.stringify(LumioData.projects)),
  folders: JSON.parse(JSON.stringify(LumioData.folders)),
  currentFolder: null, // null = All Projects
  searchQuery: '',
  typeFilter: 'All',

  // wizard draft
  wizard: null,

  // courses created (id -> course object)
  // c1 is the default "scratch" course used by the Course Wizard; p1/p2/p7
  // are the pre-populated client demonstration courses (see
  // LumioData.demoCourses) so opening those projects shows full content
  // instead of a generic clone of courseTemplate.
  courses: {
    c1: JSON.parse(JSON.stringify(LumioData.courseTemplate)),
    p1: JSON.parse(JSON.stringify(LumioData.demoCourses.p1)),
    p2: JSON.parse(JSON.stringify(LumioData.demoCourses.p2)),
    p7: JSON.parse(JSON.stringify(LumioData.demoCourses.p7)),
  },

  // lessons content store (lessonId -> blocks array)
  lessons: {
    l1: JSON.parse(JSON.stringify(LumioData.sampleLessonBlocks)),
    l2: JSON.parse(JSON.stringify(LumioData.demoLessons.l2)),
    l3: JSON.parse(JSON.stringify(LumioData.demoLessons.l3)),
    // p1 (New Hire Onboarding) previously aliased course c1's l1/l2/l3 content
    // directly — a confirmed id collision (Identity & Entity Integrity Audit).
    // p1 now owns its own independent clone of the same starting content
    // under its own ids, so editing one course's lessons never touches the
    // other's.
    'p1-l1': JSON.parse(JSON.stringify(LumioData.sampleLessonBlocks)),
    'p1-l2': JSON.parse(JSON.stringify(LumioData.demoLessons.l2)),
    'p1-l3': JSON.parse(JSON.stringify(LumioData.demoLessons.l3)),
    ws1: JSON.parse(JSON.stringify(LumioData.demoLessons.ws1)),
    ws2: JSON.parse(JSON.stringify(LumioData.demoLessons.ws2)),
    ws3: JSON.parse(JSON.stringify(LumioData.demoLessons.ws3)),
    f1a: JSON.parse(JSON.stringify(LumioData.demoLessons.f1a)),
    f1b: JSON.parse(JSON.stringify(LumioData.demoLessons.f1b)),
    f1c: JSON.parse(JSON.stringify(LumioData.demoLessons.f1c)),
  },

  currentCourseId: 'c1',
  currentLessonId: 'l1',

  // learner preview runtime state
  learnerProgress: {}, // courseId -> { completedLessons, kcAnswers, score, courseStatus, ... }
  learnerPreview: null, // { returnTo } — set when entering preview, used by Exit Preview

  // learner identity — who is taking courses in this browser/session. Generated
  // locally until a real LMS/SCORM/xAPI launch supplies a real identity.
  learnerProfile: null, // { learnerId, learnerName, startedAt, lastAccessedAt }

  // last-known learner position, independent of any single course's progress
  // record — used to resume "where they left off" across sessions.
  resume: null, // { courseId, lessonId, blockIndex, scrollY, timestamp }

  // Append-only interaction ledger — every knowledge check submission adds a
  // new entry here; nothing is ever overwritten. courseId -> lessonId ->
  // blockId -> [{ timestamp, attemptNumber, interactionType, learnerResponse,
  // correctResponse, result, score }]. blockId is currently "lessonId:index"
  // (blocks have no stable id yet — see Interaction History audit).
  interactionHistory: {},

  // Append-only per-assessment attempt ledger. assessmentId ->
  // [{ attemptNumber, timestamp, score, maxScore, passed, answers }]
  assessmentAttempts: {},

  // Account Persistence, User Management & Invitation System Correction
  // Sprint: Lumio now boots to a true first-run state — NO seeded identity.
  // currentUser is null until a real login/registration populates it via
  // LumioAuth; the central route guard in render() (below) refuses to
  // render any protected screen while it's null, sending the visitor to
  // #/login instead. Nothing here is ever read by a screen the guard
  // hasn't already gated.
  currentUser: null,

  // Workspace Identity resource — platform skin owned by the workspace.
  // null until first cloud load or explicit save. Managed exclusively through
  // the generic Workspace Resource architecture (cloudSyncWorkspace / _loadCloudWorkspace).
  // applyWorkspaceIdentity() reads this field and writes --ws-* CSS tokens.
  workspaceIdentity: null,

  // workspace system info (Workspace Owner only) — populated per-workspace
  // once a real workspace exists; never pre-seeded.
  workspace: {
    systemInfo: {
      platformVersion: '1.0.0',
      buildNumber: '2026.06.15',
      databaseVersion: 'Prototype (local storage)',
      installationDate: Date.now(),
      licenseInfo: 'Unlicensed (prototype)', // future-ready: license key/plan details
    },
  },

  // other workspace members managed alongside the signed-in user (any role)
  // — no seeded admin user; populated by invitation acceptance only.
  adminUsers: [],

  // pending workspace invitations
  invitations: [],

  // Forgot Password requests (Account Management Finalization Sprint,
  // Phase 4) — { id, token, userId, email, createdAt, expiresAt, used }.
  // No real email delivery exists (same as invitations) — the reset link is
  // shown directly on screen instead of being emailed.
  passwordResets: [],

  // in-platform notification ledger (Governance & Review Workflow
  // Hardening Sprint, Phase 7) — { id, userId, message, projectId,
  // createdAt, read }, newest first.
  notifications: [],

  // ---- SaaS foundation entities (additive — see ROLES & PERMISSIONS
  // section below for the full design note). Populated by the v16
  // migration from the legacy fields above; not yet read by any existing
  // screen. ----
  users: [],
  workspaces: [],
  workspaceMemberships: [],
  session: { currentUserId: null, currentWorkspaceId: null },
};

/* ---------------- ROLES & PERMISSIONS ---------------- */
const ROLE_LABELS = { owner: 'Workspace Owner', admin: 'Administrator' };
const AUTH_PROVIDER_LABELS = { local: 'Lumio Account', microsoft: 'Microsoft SSO', google: 'Google SSO' };

function isWorkspaceOwner() {
  const u = getCurrentUser();
  return !!u && u.role === ROLE_WORKSPACE_OWNER;
}
function canAccessWorkspaceSettings() { return isWorkspaceOwner(); }
function canManageUsers() { return isWorkspaceOwner(); }
function canInviteAdministrators() { return isWorkspaceOwner(); }

/* ============================================================
   SAAS WORKSPACE/AUTH FOUNDATION (Workspace & Authentication
   Foundation Sprint)

   New canonical entities — User / Workspace / WorkspaceMembership /
   session — are introduced ADDITIVELY here, alongside (not replacing)
   the legacy currentUser/adminUsers/workspace/invitations fields that
   every existing screen (courseLanding.js, projects.js, lessonBuilder.js,
   profile.js, workspaceSettings.js) already reads directly. This is a
   deliberate scope boundary for this sprint: build the real foundation,
   keep zero regression risk to existing UI, and leave "cut the UI over
   to the new model" for a dedicated follow-up sprint once an auth
   provider is actually wired in.

   Canonical role values used by the NEW entities only:
     'workspace_owner' | 'administrator'
   Legacy fields (currentUser.role, adminUsers[].role) keep their
   existing values ('owner' | 'admin') unchanged — toCanonicalRole()/
   toLegacyRole() bridge the two where a function needs to cross from
   one model into the other.
   ============================================================ */
const ROLE_WORKSPACE_OWNER = 'workspace_owner';
const ROLE_ADMINISTRATOR = 'administrator';
const CANONICAL_ROLE_LABELS = { [ROLE_WORKSPACE_OWNER]: 'Workspace Owner', [ROLE_ADMINISTRATOR]: 'Administrator' };

// Supported authProvider values for the new User entity. 'local_demo'
// marks the prototype's simulated accounts — distinct from a future real
// 'email' (password) provider, so migrated demo data is never confused
// with a real email/password signup once that exists.
const AUTH_PROVIDERS = ['google', 'microsoft', 'apple', 'email', 'local_demo'];

function toCanonicalRole(legacyRole) {
  return legacyRole === 'owner' ? ROLE_WORKSPACE_OWNER : ROLE_ADMINISTRATOR;
}
function toLegacyRole(canonicalRole) {
  return canonicalRole === ROLE_WORKSPACE_OWNER ? 'owner' : 'admin';
}
function toCanonicalAuthProvider(legacyProvider) {
  if (legacyProvider === 'microsoft') return 'microsoft';
  if (legacyProvider === 'google') return 'google';
  if (legacyProvider === 'apple') return 'apple';
  if (legacyProvider === 'email') return 'email'; // a real, permanent email/password account — not a demo identity
  return 'local_demo'; // 'local' and any unrecognized legacy value
}

// Single source of truth for "who is acting right now" going forward —
// today this only ever points at the one migrated demo identity, but the
// shape is real: a future login flow sets these two ids, nothing else.
function getCurrentUser() {
  // Server session takes precedence (real backend auth via cookie).
  const s = LumioSession.get();
  if (s.isAuthenticated && s.user) {
    // Merge role from membership so legacy callers (isWorkspaceOwner etc.)
    // that read user.role directly continue to work without change.
    return s.membership ? Object.assign({}, s.user, { role: s.membership.role }) : s.user;
  }
  // Fall back to legacy localStorage session for prototype demo users.
  return (LumioState.users || []).find(u => u.id === LumioState.session?.currentUserId) || null;
}
function getCurrentWorkspace() {
  const s = LumioSession.get();
  if (s.isAuthenticated && s.workspace) return s.workspace;
  return (LumioState.workspaces || []).find(w => w.id === LumioState.session?.currentWorkspaceId) || null;
}
function getWorkspaceMembership(userId, workspaceId) {
  return (LumioState.workspaceMemberships || []).find(m => m.userId === userId && m.workspaceId === workspaceId) || null;
}
// Canonical-role equivalents of isWorkspaceOwner()/etc., reading the NEW
// entities via the current session — kept side-by-side with the legacy
// functions above (which remain the ones every existing screen actually
// calls today). Future auth-cutover work re-points the legacy functions
// at these instead of at currentUser.role directly.
function isWorkspaceOwnerCanonical() {
  const ws = getCurrentWorkspace();
  const user = getCurrentUser();
  if (!ws || !user) return false;
  const membership = getWorkspaceMembership(user.id, ws.id);
  return !!membership && membership.role === ROLE_WORKSPACE_OWNER;
}

/* ============================================================
   LUMIO AUTH — provider abstraction (Google/Microsoft/Apple/Email
   Authentication Architecture Sprint)

   login(provider, opts) / logout() / restoreSession() are the only
   entry points every future real OAuth integration needs to call into —
   today they're backed by mock providers (Phase 8); a future sprint
   swaps _mockProviderPayload() for a real SDK callback and nothing else
   in this module, or any of its callers, needs to change.

   Design note: LumioState.currentUser/adminUsers (the legacy fields every
   existing screen reads directly) are kept in sync with the canonical
   users[]/session by _syncLegacyCurrentUser() on every login/restore —
   same additive-foundation approach as the prior two sprints. No existing
   screen needed to change to benefit from real authentication once it
   lands.
   ============================================================ */
const LumioAuth = (function () {
  const SESSION_TAB_MARKER = 'lumio.session.activeTab';

  // Deterministic, NOT cryptographically secure — a real backend would
  // hash passwords server-side (bcrypt/argon2). This exists only so a
  // raw password is never the literal string compared/stored client-side.
  function _hashPassword(pw) {
    let h = 0;
    const s = String(pw || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return 'h_' + Math.abs(h).toString(36);
  }

  // Realistic shapes for what each provider's identity payload actually
  // looks like, so a future real integration's field-mapping code can be
  // written and tested against something structurally honest today.
  function _mockProviderPayload(provider) {
    const uid = generateUniqueId('mock');
    if (provider === 'google') {
      return { sub: 'google-' + uid, email: 'demo.user@gmail.com', given_name: 'Alex', family_name: 'Morgan', picture: null, email_verified: true };
    }
    if (provider === 'microsoft') {
      return { oid: 'ms-' + uid, mail: 'demo.user@outlook.com', givenName: 'Alex', surname: 'Morgan', userPrincipalName: 'demo.user@outlook.com' };
    }
    if (provider === 'apple') {
      return { sub: 'apple-' + uid, email: 'demo.user@icloud.com', name: { firstName: 'Alex', lastName: 'Morgan' }, is_private_email: false };
    }
    return null;
  }

  function _fieldsFromPayload(provider, payload) {
    if (provider === 'google') return { email: payload.email, firstName: payload.given_name, lastName: payload.family_name };
    if (provider === 'microsoft') return { email: payload.mail, firstName: payload.givenName, lastName: payload.surname };
    if (provider === 'apple') return { email: payload.email, firstName: payload.name.firstName, lastName: payload.name.lastName };
    return null;
  }

  // Creates the membership for a newly-created user — if no workspace
  // exists yet, this user becomes its Workspace Owner (Phase 5 rule:
  // "Workspace Owner creates workspace"); otherwise they join the existing
  // single workspace as an Administrator ("Administrators join workspace").
  // Ownership Correction Sprint: every self-registering user (Google,
  // Microsoft, Apple, Email) is a SaaS account holder, not a teammate —
  // they always get their OWN new workspace and become its
  // workspace_owner. The only way to ever become an 'administrator' is
  // accepting someone else's invitation into THEIR workspace (see
  // acceptInvitation in workspaceSettings.js, which builds its own
  // membership directly and never calls this function). Name follows the
  // existing Workspace Settings default-naming pattern (ensureSaasFoundation
  // uses the same literal 'My Workspace' for the seeded demo workspace) —
  // not invented for this sprint.
  function _bindNewUserToWorkspace(user) {
    const workspace = { id: generateUniqueId('ws'), name: 'My Workspace', ownerId: user.id, createdAt: Date.now() };
    LumioState.workspaces.push(workspace);
    user.role = ROLE_WORKSPACE_OWNER;
    LumioState.workspaceMemberships.push({ workspaceId: workspace.id, userId: user.id, role: user.role, joinedAt: Date.now() });
    return workspace;
  }

  function _createUser(fields, authProvider, extra) {
    const user = Object.assign({
      id: generateUniqueId('u'),
      email: fields.email,
      firstName: fields.firstName,
      lastName: fields.lastName,
      displayName: `${fields.firstName} ${fields.lastName}`.trim(),
      avatar: null,
      role: ROLE_WORKSPACE_OWNER, // _bindNewUserToWorkspace always sets this for self-registration — see note there
      status: 'active',
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
      authProvider,
    }, extra || {});
    LumioState.users.push(user);
    _bindNewUserToWorkspace(user);
    return user;
  }

  // Account Management Finalization Sprint, Phase 2: _syncLegacyCurrentUser
  // (which used to build a parallel legacy-shaped LumioState.currentUser
  // object and mirror non-primary users into LumioState.adminUsers[]) has
  // been removed entirely. users[] is now the only authoritative user
  // record — getCurrentUser() resolves "who is signed in" directly from
  // users[] + session.currentUserId, with no separate mirror to keep in
  // sync (and thus no way for it to drift out of sync, which is exactly
  // what produced duplicate-looking rows on the Workspace Users screen).

  function _establishSession(user, rememberMe) {
    // A user now belongs to exactly the workspace(s) they own or were
    // invited into — no longer assume "workspace 0" is theirs.
    const membership = (LumioState.workspaceMemberships || []).find(m => m.userId === user.id);
    LumioState.session = {
      currentUserId: user.id,
      currentWorkspaceId: membership ? membership.workspaceId : null,
      rememberMe: rememberMe !== false,
    };
    // Marks this browser TAB as having an active session — present for the
    // life of the tab, cleared when the tab/browser closes. Used by
    // restoreSession() to distinguish "still the same tab, just refreshed"
    // from "a brand new browser session", which is exactly what "Remember
    // me" needs to decide whether to honor a persisted-but-not-remembered session.
    try { sessionStorage.setItem(SESSION_TAB_MARKER, '1'); } catch (e) {}
    // Session/auth transitions flush immediately rather than going through
    // the normal 400ms scheduleLumioSave() debounce — confirmed live that a
    // second tab reading localStorage inside that debounce window would
    // otherwise see a stale session (e.g. still-logged-out right after
    // login, or still-logged-in right after logout).
    saveLumioState();
  }

  // Mock SSO login — simulates a successful provider round-trip and
  // returns/creates the canonical User exactly as a real OAuth callback
  // would, just without ever leaving the browser.
  function loginWithProvider(provider, rememberMe) {
    const payload = _mockProviderPayload(provider);
    if (!payload) return { ok: false, reason: `Unsupported provider "${provider}".` };
    const fields = _fieldsFromPayload(provider, payload);
    let user = LumioState.users.find(u => u.email.toLowerCase() === fields.email.toLowerCase());
    if (user) {
      user.lastLoginAt = Date.now();
    } else {
      user = _createUser(fields, provider);
    }
    _establishSession(user, rememberMe);
    return { ok: true, user, payload };
  }

  function registerEmail(email, password, firstName, lastName, rememberMe) {
    if (!email || !password || !firstName) return { ok: false, reason: 'Please fill in all required fields.' };
    if (LumioState.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, reason: 'An account with this email already exists.' };
    }
    if (password.length < 6) return { ok: false, reason: 'Password must be at least 6 characters.' };
    const user = _createUser({ email, firstName, lastName: lastName || '' }, 'email', { passwordHash: _hashPassword(password) });
    _establishSession(user, rememberMe);
    return { ok: true, user };
  }

  function loginWithEmail(email, password, rememberMe) {
    const user = LumioState.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase() && u.authProvider === 'email');
    if (!user) return { ok: false, reason: 'No account found with that email and password provider.' };
    if (user.passwordHash !== _hashPassword(password)) return { ok: false, reason: 'Incorrect password.' };
    user.lastLoginAt = Date.now();
    _establishSession(user, rememberMe);
    return { ok: true, user };
  }

  function logout() {
    // getCurrentUser() resolves purely from session.currentUserId — clearing
    // it here is the ONLY thing "signed out" needs to mean now that there is
    // no separate LumioState.currentUser mirror that could otherwise hold
    // stale data in the window before the next login.
    LumioState.session = { currentUserId: null, currentWorkspaceId: null, rememberMe: false };
    try { sessionStorage.removeItem(SESSION_TAB_MARKER); } catch (e) {}
    saveLumioState(); // immediate flush — see _establishSession for why logout can't wait on the debounce
  }

  // Called once at boot, after loadLumioState()/ensureSaasFoundation(). If
  // a session was persisted with rememberMe === false and this is a brand
  // new browser tab/session (no sessionStorage marker — meaning the
  // browser was actually closed and reopened, not just refreshed), the
  // session is cleared and the learner/author is sent back to login.
  function restoreSession() {
    const s = LumioState.session;
    if (!s || !s.currentUserId) return false;
    let activeTab = false;
    try { activeTab = sessionStorage.getItem(SESSION_TAB_MARKER) === '1'; } catch (e) {}
    if (s.rememberMe === false && !activeTab) {
      logout();
      return false;
    }
    const user = LumioState.users.find(u => u.id === s.currentUserId);
    if (!user) { logout(); return false; }
    try { sessionStorage.setItem(SESSION_TAB_MARKER, '1'); } catch (e) {}
    return true;
  }

  // Forgot Password (Account Management Finalization Sprint, Phase 4).
  // No real email provider exists (same documented limitation as
  // invitations) — the reset link is generated and returned/displayed
  // directly instead of being emailed.
  const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
  function requestPasswordReset(email) {
    const user = LumioState.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase() && u.authProvider === 'email');
    if (!user) return { ok: false, reason: 'No account found with that email address.' };
    const token = generateUniqueId('reset');
    const link = `${location.origin}${location.pathname}#/reset-password/${token}`;
    LumioState.passwordResets.push({
      id: generateUniqueId('pr'), token, userId: user.id, email: user.email,
      createdAt: Date.now(), expiresAt: Date.now() + PASSWORD_RESET_TTL_MS, used: false,
    });
    console.info(`[Lumio] Password reset email would be sent to ${user.email}:\n  Reset link: ${link}`);
    scheduleLumioSave();
    return { ok: true, link };
  }
  function validateResetToken(token) {
    const reset = LumioState.passwordResets.find(r => r.token === token);
    if (!reset || reset.used) return { ok: false, reason: 'This reset link is invalid or has already been used.' };
    if (Date.now() > reset.expiresAt) return { ok: false, reason: 'This reset link has expired. Please request a new one.' };
    return { ok: true, reset };
  }
  function resetPassword(token, newPassword) {
    const check = validateResetToken(token);
    if (!check.ok) return check;
    if (!newPassword || newPassword.length < 6) return { ok: false, reason: 'Password must be at least 6 characters.' };
    const user = LumioState.users.find(u => u.id === check.reset.userId);
    if (!user) return { ok: false, reason: 'This account no longer exists.' };
    user.passwordHash = _hashPassword(newPassword);
    check.reset.used = true;
    scheduleLumioSave();
    return { ok: true };
  }

  return {
    loginWithProvider,
    registerEmail,
    loginWithEmail,
    logout,
    restoreSession,
    requestPasswordReset,
    validateResetToken,
    resetPassword,
    _hashPassword, // exposed for profile.js's existing password-change flow to adopt later
  };
})();

/* ============================================================
   PROJECT STATUS LIFECYCLE
   draft -> in_review -> approved -> published -> archived
   Rejection: in_review -> draft
   Restore: archived -> draft
   Single source of truth — every UI surface (Projects list,
   Course Landing, Lesson Builder, Workspace Settings review queue,
   publish.js) reads/writes status only through these functions.
   ============================================================ */
const PROJECT_STATUS_LABELS = {
  draft: 'Draft',
  in_review: 'In Review',
  rejected: 'Rejected',
  approved: 'Approved',
  published: 'Published',
  archived: 'Archived',
};

// Allowed transitions: { fromStatus: { action: toStatus } }
// Governance & Review Workflow Hardening Sprint: 'rejected' is now a
// first-class status (was previously collapsed back into 'draft', which
// made a rejected project visually indistinguishable from one that was
// never submitted — a documented Governance Gap from the prior audit).
const PROJECT_STATUS_TRANSITIONS = {
  draft:      { submit_for_review: 'in_review' },
  in_review:  { approve: 'approved', reject: 'rejected' },
  rejected:   { submit_for_review: 'in_review' },
  approved:   { publish: 'published' },
  published:  { republish: 'published', archive: 'archived' },
  archived:   { restore: 'draft' },
};

function isProjectOwner(project) {
  const u = getCurrentUser();
  return !!(project && u && project.ownerId === u.id);
}

// Ownership & Visibility Correction Sprint: a user sees a project ONLY if
// they own it or it was explicitly shared with them — deliberately NOT the
// same rule as hasFullProjectAccess() below (which intentionally lets a
// Workspace Owner edit/manage projects once visible, e.g. via the review
// queue). This is the listing/Continue-Working/counts visibility rule —
// no workspace-wide bypass, no seeded-project bypass, by design: a
// brand-new Workspace Owner with no projects of their own sees zero.
function isProjectVisible(project) {
  if (!project || project.deleted) return false;
  if (isProjectOwner(project)) return true;
  const uid = getCurrentUser()?.id;
  return project.sharedScope === 'team' || (Array.isArray(project.sharedWith) && project.sharedWith.includes(uid));
}
function visibleProjects() {
  return LumioState.projects.filter(isProjectVisible);
}

// Owner of the project, or the Workspace Owner (who bypasses sharing
// restrictions entirely per the approved architecture).
function hasFullProjectAccess(project) {
  return isProjectOwner(project) || isWorkspaceOwner();
}

// Whether the current user can edit this project's content at all —
// owner, Workspace Owner, or shared with 'edit' permission (individual
// share naming this user, or a team-wide share).
function canEditProject(project) {
  if (!project) return false;
  if (hasFullProjectAccess(project)) return true;
  const uid = getCurrentUser()?.id;
  const sharedToMe = project.sharedScope === 'team' || (Array.isArray(project.sharedWith) && project.sharedWith.includes(uid));
  return sharedToMe && project.sharedPermission === 'edit';
}

// Whether the current user only has read access — shared with this user
// (directly or via team) but without edit permission, and not the owner
// or Workspace Owner. Drives "View Only" UI across Course Landing and
// Lesson Builder.
function isProjectViewOnly(project) {
  if (!project) return false;
  if (hasFullProjectAccess(project)) return false;
  const uid = getCurrentUser()?.id;
  const sharedToMe = project.sharedScope === 'team' || (Array.isArray(project.sharedWith) && project.sharedWith.includes(uid));
  return sharedToMe && project.sharedPermission !== 'edit';
}

function canSubmitForReview(project) { return canEditProject(project); }

// Returns { ready: bool, uncovered: [{verb,text}] }.
// Single source of truth for content readiness — consumed by both the
// Projects menu (to disable the action before it is clicked) and by
// transitionProjectStatus (as the final authority before state mutation).
function courseSubmissionReadiness(project) {
  if (!project) return { ready: true, uncovered: [] };
  const courseData = LumioState.courses && LumioState.courses[project.id];
  if (!courseData || !Array.isArray(courseData.objectives) || courseData.objectives.length === 0) {
    return { ready: true, uncovered: [] };
  }
  const covered = new Set(
    (courseData.lessons || []).flatMap(l =>
      Array.isArray(l.objectiveIndices) ? l.objectiveIndices : []
    )
  );
  const uncovered = courseData.objectives.filter((_, i) => !covered.has(i));
  return { ready: uncovered.length === 0, uncovered };
}
function canApproveReject() { return isWorkspaceOwner(); }
function canArchiveProject() { return isWorkspaceOwner(); }
function canRestoreProject() { return isWorkspaceOwner(); }

// Whether `project` can publish right now, per the approved status matrix:
// draft/in_review/archived cannot publish; approved/published can.
function canPublishProjectStatus(project) {
  return !!project && (project.status === 'approved' || project.status === 'published');
}

// Append-only review history — Phase 3 of the Governance & Review Workflow
// Hardening Sprint. Never mutates or overwrites a prior entry; every
// governance action (submitted/approved/rejected/published/archived/
// restored) gets its own permanent row with who/when/comment.
const REVIEW_HISTORY_ACTION_LABELS = {
  submit_for_review: 'Submitted', approve: 'Approved', reject: 'Rejected',
  publish: 'Published', republish: 'Republished', archive: 'Archived', restore: 'Restored',
};
function pushReviewHistory(project, action, comment) {
  if (!Array.isArray(project.reviewHistory)) project.reviewHistory = [];
  project.reviewHistory.push({
    action: REVIEW_HISTORY_ACTION_LABELS[action] || action,
    userId: getCurrentUser()?.id,
    userName: currentUserDisplayName(),
    date: Date.now(),
    comment: comment || null,
  });
}

// In-platform notifications (Phase 7) — no email integration, just a
// persisted, per-user ledger surfaced via the notification bell.
function addNotification(userId, message, projectId, opts) {
  if (!userId) return;
  if (!Array.isArray(LumioState.notifications)) LumioState.notifications = [];
  LumioState.notifications.unshift({
    id: generateUniqueId('n'), userId, message, projectId,
    type: (opts && opts.type) || 'review',
    icon: (opts && opts.icon) || null,
    detail: (opts && opts.detail) || null,
    createdAt: Date.now(), read: false,
  });
}
function myNotifications() {
  const uid = getCurrentUser()?.id;
  return (LumioState.notifications || []).filter(n => n.userId === uid);
}
function myUnreadNotificationCount() {
  return myNotifications().filter(n => !n.read).length;
}

// Attempts a status transition. Returns { ok: true } or { ok: false, reason }.
// Never trusts the caller's UI to only offer valid actions — re-validates
// the transition table and the actor's permission every time.
// `comment` is optional for approve, MANDATORY for reject (Phase 2).
function transitionProjectStatus(project, action, comment) {
  if (!project) return { ok: false, reason: 'Project not found.' };
  const allowed = PROJECT_STATUS_TRANSITIONS[project.status];
  const toStatus = allowed && allowed[action];
  if (!toStatus) return { ok: false, reason: `Cannot ${action.replace(/_/g, ' ')} from status "${PROJECT_STATUS_LABELS[project.status] || project.status}".` };

  if (action === 'submit_for_review' && !canSubmitForReview(project)) return { ok: false, reason: 'You do not have permission to submit this project for review.' };
  if (action === 'submit_for_review') {
    const readiness = courseSubmissionReadiness(project);
    if (!readiness.ready) {
      return {
        ok: false,
        modal: true,
        reason: `Cannot submit course for review.\n\nThe following learning objectives are not linked to any lesson:\n\n${readiness.uncovered.map(o => `• ${o.verb} ${o.text}`).join('\n')}\n\nLink every Course Objective to at least one lesson before submitting for review.`,
      };
    }
  }
  if ((action === 'approve' || action === 'reject') && !canApproveReject()) return { ok: false, reason: 'Only the Workspace Owner can approve or reject submissions.' };
  if (action === 'reject' && !(comment && comment.trim())) return { ok: false, reason: 'A comment is required when rejecting a submission.' };
  if (action === 'archive' && !canArchiveProject()) return { ok: false, reason: 'Only the Workspace Owner can archive projects.' };
  if (action === 'restore' && !canRestoreProject()) return { ok: false, reason: 'Only the Workspace Owner can restore archived projects.' };
  if ((action === 'publish' || action === 'republish') && !canEditProject(project)) return { ok: false, reason: 'You do not have permission to publish this project.' };

  const now = Date.now();
  const title = projectDisplayTitle(project);
  if (action === 'submit_for_review') {
    project.reviewStatus = 'pending';
    project.submittedBy = getCurrentUser()?.id;
    project.submittedAt = now;
    project.reviewComments = null;
    // Issue 3 root cause: this used to notify the literal id 'u-owner',
    // which only worked by coincidence when that happened to be the real
    // seeded owner's id. Now that fresh installs/real registrations give
    // the Workspace Owner a real generated id, that hardcoded target
    // silently pointed at a user who may not exist — the notification was
    // created but nobody could ever see it. Resolved dynamically instead.
    addNotification(getWorkspaceOwnerIdForProject(project), `"${title}" was submitted for review by ${currentUserDisplayName()}.`, project.id, {
      type: 'review', dest: { route: 'workspace-settings' },
    });
  } else if (action === 'approve') {
    project.reviewStatus = 'approved';
    project.reviewedBy = getCurrentUser()?.id;
    project.reviewedAt = now;
    project.reviewComments = comment || null;
    addNotification(project.ownerId, `"${title}" was approved.`, project.id, {
      type: 'review', dest: { route: 'course', courseId: project.id },
    });
  } else if (action === 'reject') {
    project.reviewStatus = 'rejected';
    project.reviewedBy = getCurrentUser()?.id;
    project.reviewedAt = now;
    project.reviewComments = comment;
    addNotification(project.ownerId, `"${title}" was rejected.`, project.id, {
      type: 'review',
      detail: comment ? `Reviewer comment: ${comment}` : null,
      dest: { route: 'course', courseId: project.id },
    });
  } else if (action === 'publish' || action === 'republish') {
    addNotification(getWorkspaceOwnerIdForProject(project), `"${title}" was ${action === 'republish' ? 're-published' : 'published'} by ${currentUserDisplayName()}.`, project.id, {
      type: 'review', dest: { route: 'course', courseId: project.id, openPublish: true },
    });
  } else if (action === 'archive') {
    addNotification(getWorkspaceOwnerIdForProject(project), `"${title}" was archived by ${currentUserDisplayName()}.`, project.id, {
      type: 'review', dest: { route: 'projects' },
    });
  } else if (action === 'restore') {
    addNotification(getWorkspaceOwnerIdForProject(project), `"${title}" was restored from archive by ${currentUserDisplayName()}.`, project.id, {
      type: 'review', dest: { route: 'projects' },
    });
  }
  pushReviewHistory(project, action, comment);
  project.status = toStatus;
  scheduleLumioSave();
  return { ok: true };
}

// Resolves "the Workspace Owner" for a given project — the owner of the
// workspace that project's owner is a member of. Used by notification
// targeting instead of ever hardcoding a user id (Issue 3 fix).
function getWorkspaceOwnerIdForProject(project) {
  const membership = (LumioState.workspaceMemberships || []).find(m => m.userId === project.ownerId);
  const workspace = membership ? (LumioState.workspaces || []).find(w => w.id === membership.workspaceId) : null;
  return workspace ? workspace.ownerId : project.ownerId;
}

/* ---------------- AUTHENTICATION SERVICE INTEGRATION POINTS ---------------- */
// These three are the only functions that need to change when a real OAuth
// provider is connected: swap LumioAuth.loginWithProvider(provider)'s mock
// payload for a real SDK callback (MSAL for Microsoft, Google Identity
// Services for Google, Sign in with Apple JS for Apple) and call this same
// function with the real payload. Every other call site (login.js,
// LumioAuth itself, session restore) needs zero changes.
// Account Management Remediation Sprint, Priority 2 fix: these three used
// to call LumioAuth.loginWithProvider(), which silently created/signed into
// a fully persisted account using a HARDCODED mock identity (firstName
// 'Alex', lastName 'Morgan', a fixed demo.user@{gmail,outlook,icloud}.com
// per provider — see LumioAuth's _mockProviderPayload). Every click created
// or reused that same fake identity, which is exactly how the "duplicate
// Alex Morgan" accounts kept appearing. There is no real OAuth SDK wired up
// yet, so creating ANY account from these buttons is inherently fake/
// misleading — the honest behaviour is to say so instead of fabricating an
// identity. LumioAuth.loginWithProvider/_mockProviderPayload are left
// completely intact (unused, not deleted) so a future sprint can wire a
// real SDK callback into these same three functions with zero changes
// elsewhere, exactly as the original integration-point design intended.
function authenticateMicrosoft() {
  toast('Microsoft sign-in isn’t connected yet — please register or sign in with email.', '⚠️');
}

function authenticateGoogle() {
  toast('Google sign-in isn’t connected yet — please register or sign in with email.', '⚠️');
}

function authenticateApple() {
  toast('Apple sign-in isn’t connected yet — please register or sign in with email.', '⚠️');
}

// Transient, not-persisted UI state shared by the login screen — currently
// just the "Remember me" checkbox's value at the moment a sign-in button is
// clicked. Not part of LumioState since it's pre-authentication UI state.
const LumioUI = { rememberMe: true };

// Returns only the members of the ACTIVE workspace, resolved ENTIRELY from
// users[] + workspaceMemberships[] — the only authoritative user store
// (Account Management Finalization Sprint, Phase 2). Each returned object
// is a live reference into LumioState.users[], so callers that mutate a
// returned user's fields (role change, disable/enable) persist immediately
// with no separate sync step needed. Every real membership (owner at
// workspace creation, administrator at invitation acceptance) already gets
// a workspaceMemberships row, so this filter correctly includes the Owner,
// every Administrator, and every invited user who has accepted, while
// excluding unrelated accounts that belong to other workspaces.
function allWorkspaceUsers() {
  const workspaceId = LumioState.session?.currentWorkspaceId;
  const memberIds = new Set(
    (LumioState.workspaceMemberships || [])
      .filter(m => m.workspaceId === workspaceId)
      .map(m => m.userId)
  );
  return (LumioState.users || []).filter(u => memberIds.has(u.id));
}

// Counts how many workspace members currently hold the Workspace Owner
// role. Used to guard against removing, demoting, or disabling the last
// remaining Owner.
function workspaceOwnerCount() {
  return allWorkspaceUsers().filter(u => u.role === ROLE_WORKSPACE_OWNER).length;
}

// Returns the initials + display name + avatar for the signed-in user,
// used everywhere the current user's identity is shown (sidebar, profile).
function currentUserDisplayName() {
  const u = getCurrentUser();
  if (!u) return 'User';
  return u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'User';
}
function currentUserInitials() {
  const u = getCurrentUser();
  if (!u) return '?';
  return ((u.firstName?.[0] || '') + (u.lastName?.[0] || '')).toUpperCase()
    || (u.email?.[0] || '?').toUpperCase();
}

// Renders the shared avatar badge: an uploaded photo if present, otherwise
// initials on the gradient badge. Used in the sidebar and Profile page.
function avatarHtml(user, size) {
  const sizeStyle = size ? `width:${size}px; height:${size}px; font-size:${Math.round(size * 0.38)}px;` : '';
  if (user.avatar) {
    return `<div class="avatar" style="${sizeStyle} background:none; padding:0; overflow:hidden;">
      <img src="${AssetStore.resolveMediaSrc(user.avatar)}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:50%; display:block;" />
    </div>`;
  }
  const initials = ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase();
  return `<div class="avatar" style="${sizeStyle}">${initials}</div>`;
}

// Formats a timestamp as "June 15, 2026" for read-only account fields.
function formatDateLong(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/* ---------------- KC DATA NORMALISERS ---------------- */
// Shared by lessonBuilder.js (canvas + content panels) and learnerPreview.js
// (learner render functions). Both files are in global scope, so defining
// these once here guarantees a single source of truth for fallback values.

function normalizeKcOptions(d) {
  return Array.isArray(d.options) && d.options.length ? d.options : ['Option A', 'Option B', 'Option C'];
}
function normalizeKcLeft(d) {
  return Array.isArray(d.left) && d.left.length ? d.left : ['Choice 1', 'Choice 2'];
}
function normalizeKcRight(d) {
  return Array.isArray(d.right) && d.right.length ? d.right : ['Match 1', 'Match 2'];
}
function normalizeKcItems(d) {
  return Array.isArray(d.items) && d.items.length ? d.items : ['Step 1', 'Step 2', 'Step 3'];
}
/* ── Interaction/assessment history analytics helpers ──
   Operate on any plain array of attempt-like records — used for both
   interactionHistory[courseId][lessonId][blockId] entries
   ({ score: { raw, max } }) and assessmentAttempts[assessmentId] entries
   ({ score, maxScore }). Single source of truth — no duplicate logic
   anywhere else computes "best"/"first"/"latest"/"count". */
function _attemptRatio(entry) {
  if (!entry) return 0;
  if (entry.score && typeof entry.score === 'object' && typeof entry.score.max === 'number' && entry.score.max > 0) {
    return entry.score.raw / entry.score.max;
  }
  if (typeof entry.score === 'number' && typeof entry.maxScore === 'number' && entry.maxScore > 0) {
    return entry.score / entry.maxScore;
  }
  if (typeof entry.passed === 'boolean') return entry.passed ? 1 : 0;
  if (entry.result) return entry.result === 'correct' ? 1 : entry.result === 'partial' ? 0.5 : 0;
  return 0;
}
function getFirstAttempt(history) {
  return (Array.isArray(history) && history.length) ? history[0] : null;
}
function getLatestAttempt(history) {
  return (Array.isArray(history) && history.length) ? history[history.length - 1] : null;
}
function getBestAttempt(history) {
  if (!Array.isArray(history) || !history.length) return null;
  return history.reduce((best, h) => (_attemptRatio(h) > _attemptRatio(best) ? h : best));
}
function getAttemptCount(history) {
  return Array.isArray(history) ? history.length : 0;
}

function normalizeKcAnswers(d) {
  if (Array.isArray(d.answers) && d.answers.length) return [...d.answers];
  if (d.answer) return d.answer.split('|').map(s => s.trim()).filter(Boolean);
  return [''];
}
function normalizeKcCategories(d) {
  const cats = Array.isArray(d.categories) && d.categories.length ? d.categories : ['Category A', 'Category B'];
  return cats.map(c => typeof c === 'string' ? c : (c && c.name) || String(c));
}
function normalizeKcCards(d) {
  return Array.isArray(d.cards) && d.cards.length ? d.cards : [
    { text: 'Card 1', category: 0 },
    { text: 'Card 2', category: 1 },
  ];
}

/* ---------------- ID GENERATION ---------------- */
// Generates a globally-unique id with the given prefix (e.g. 'l' for lessons,
// 'a' for assessments, 'c'/'p' for courses/projects). Combines a timestamp,
// random suffix, and incrementing counter so ids never collide even when
// generated in rapid succession (e.g. mapping over several blueprint items
// in the same millisecond).
let __lumioIdCounter = 0;
function generateUniqueId(prefix) {
  __lumioIdCounter += 1;
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + __lumioIdCounter.toString(36);
}

// Stable block identity — assigned once at creation, never derived from
// array index/position. Every block-creation call site (insert, AI draft,
// chat-assist insert) must stamp this; duplication must call it again to
// get a NEW id rather than cloning the original's id.
function generateBlockId() {
  return generateUniqueId('blk_');
}

// Remaps any keys of the form "lessonId:<numeric index>" found in `obj` to
// "lessonId:<blockId>", using the index->id mapping captured at the moment
// every block in that lesson is known to have a stable id. Only touches
// keys whose suffix is purely numeric (the old scheme) — a key already in
// "lessonId:blk_xxx" form never matches and is left alone, which makes this
// naturally idempotent (safe to re-run on every boot).
function remapIndexKeysToBlockIds(obj, lessonId, indexToId) {
  if (!obj) return 0;
  let count = 0;
  Object.keys(obj).forEach(key => {
    const sep = key.indexOf(':');
    if (sep === -1) return;
    const lid = key.slice(0, sep);
    const rest = key.slice(sep + 1);
    if (lid !== lessonId || !/^\d+$/.test(rest)) return;
    const newId = indexToId[rest];
    if (!newId) return;
    const newKey = lid + ':' + newId;
    if (newKey === key || obj[newKey] !== undefined) return; // never overwrite an existing entry
    obj[newKey] = obj[key];
    delete obj[key];
    count++;
  });
  return count;
}

// One-time-per-boot, idempotent hardening pass:
//  1. Assigns a stable id to every block in every lesson that doesn't
//     already have one (covers both a fresh install, where
//     LumioState.lessons is built directly from data.js seed content and
//     never passes through migrateLumioState at all, and an upgraded save).
//  2. Remaps every "lessonId:index" key still found in blockProgress,
//     kcAnswers, and interactionHistory (across every course) to
//     "lessonId:blockId", using the index each block currently occupies —
//     which is unambiguous at this exact moment, before any further
//     reordering happens. Never reorders or modifies block/answer content,
//     only the key each entry is stored under.
function ensureStableBlockIdentity() {
  let backfilled = 0, remapped = 0;
  Object.keys(LumioState.lessons || {}).forEach(lessonId => {
    const blocks = LumioState.lessons[lessonId];
    if (!Array.isArray(blocks)) return;
    const indexToId = {};
    blocks.forEach((block, i) => {
      if (!block.id) { block.id = generateBlockId(); backfilled++; }
      indexToId[i] = block.id;
    });

    Object.values(LumioState.learnerProgress || {}).forEach(progress => {
      if (!progress) return;
      remapped += remapIndexKeysToBlockIds(progress.kcAnswers, lessonId, indexToId);
      remapped += remapIndexKeysToBlockIds(progress.blockProgress, lessonId, indexToId);
    });
    Object.values(LumioState.interactionHistory || {}).forEach(byLesson => {
      if (byLesson && byLesson[lessonId]) {
        // Pre-hardening, the third level was keyed "lessonId:index" (the
        // lessonId redundantly repeated, since it's already the parent key
        // one level up). Post-hardening it's the bare block id. Recognize
        // and remap only the old "lessonId:<digits>" shape.
        const remappedKeys = {};
        let touched = false;
        Object.keys(byLesson[lessonId]).forEach(key => {
          const sep = key.indexOf(':');
          const prefix = sep === -1 ? null : key.slice(0, sep);
          const suffix = sep === -1 ? key : key.slice(sep + 1);
          if (prefix === lessonId && /^\d+$/.test(suffix) && indexToId[suffix]) {
            remappedKeys[indexToId[suffix]] = byLesson[lessonId][key];
            touched = true;
            remapped++;
          } else {
            remappedKeys[key] = byLesson[lessonId][key];
          }
        });
        if (touched) byLesson[lessonId] = remappedKeys;
      }
    });
  });
  if (backfilled > 0) console.log(`[Lumio] Backfilled stable ids for ${backfilled} block(s) that had none.`);
  if (remapped > 0) console.log(`[Lumio] Remapped ${remapped} progress/history key(s) from index-based to block-id-based.`);
  return { backfilled, remapped };
}

// Idempotent, boot-time builder for the SaaS foundation entities (User /
// Workspace / WorkspaceMembership / session). Runs unconditionally at boot
// — covers BOTH a fresh install (LumioState.users/workspaces/etc. start
// as empty arrays in the object literal above, never touched by
// migrateLumioState at all on a truly first load) AND an upgraded save
// (where migrateLumioState's v16 step has already run). Safe to call on
// every load: does nothing once users[]/workspaces[] are already populated.
function ensureSaasFoundation() {
  if ((LumioState.users || []).length > 0) return; // already built — no-op
  // True first-run state (Account Persistence & Invitation System
  // Correction Sprint): a fresh install has no seeded identity to convert
  // — currentUser is null until LumioAuth registers/logs someone in for
  // real. Do NOT fabricate a user/workspace from nothing.
  if (!LumioState.currentUser) return;

  const legacyOwner = LumioState.currentUser;
  const legacyAdmins = LumioState.adminUsers || [];

  const ownerUser = {
    id: legacyOwner.id,
    email: legacyOwner.email,
    firstName: legacyOwner.firstName,
    lastName: legacyOwner.lastName,
    displayName: `${legacyOwner.firstName} ${legacyOwner.lastName}`.trim(),
    avatar: legacyOwner.avatar || null,
    role: ROLE_WORKSPACE_OWNER,
    createdAt: legacyOwner.dateJoined || Date.now(),
    lastLoginAt: legacyOwner.lastLogin || Date.now(),
    authProvider: toCanonicalAuthProvider(legacyOwner.authenticationProvider),
    // A real email/password account needs a passwordHash so LumioAuth.loginWithEmail
    // can authenticate it after sign-out — without this, the seeded Workspace
    // Owner could never sign back in via the Email path once logged out.
    ...(legacyOwner.authenticationProvider === 'email' && legacyOwner.password
      ? { passwordHash: LumioAuth._hashPassword(legacyOwner.password) }
      : {}),
  };
  const adminUserEntities = legacyAdmins.map(u => ({
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    displayName: `${u.firstName} ${u.lastName}`.trim(),
    avatar: u.avatar || null,
    role: toCanonicalRole(u.role),
    createdAt: Date.now(), // legacy admin records never tracked a join date
    lastLoginAt: null,
    authProvider: toCanonicalAuthProvider(u.authenticationProvider),
  }));

  LumioState.users = [ownerUser, ...adminUserEntities];

  const workspaceId = 'ws-' + ownerUser.id;
  LumioState.workspaces = [{
    id: workspaceId,
    name: 'My Workspace', // legacy workspace.systemInfo never had a name field
    ownerId: ownerUser.id,
    createdAt: LumioState.workspace?.systemInfo?.installationDate || Date.now(),
  }];

  LumioState.workspaceMemberships = LumioState.users.map(u => ({
    workspaceId,
    userId: u.id,
    role: u.role,
    joinedAt: u.createdAt,
  }));

  LumioState.session = { currentUserId: ownerUser.id, currentWorkspaceId: workspaceId };

  // Backfill any invitation created before this sprint (workspaceId was
  // null at migration time, since the workspace didn't exist yet) — now
  // that the one real workspace exists, every existing invitation belongs
  // to it (there has only ever been one workspace in this prototype).
  (LumioState.invitations || []).forEach(inv => {
    if (!inv.workspaceId) inv.workspaceId = workspaceId;
  });

  console.log(`[Lumio] Built SaaS foundation: ${LumioState.users.length} user(s), 1 workspace, ${LumioState.workspaceMemberships.length} membership(s).`);
}

/* ---------------- PERSISTENCE ---------------- */
const LUMIO_STORAGE_KEY = 'lumio.state';
const LUMIO_STATE_VERSION = 21;

/* Shared block-gap tokens — single source of truth used by both builder and
   learner preview so spacing can never silently diverge between contexts.
   This is a wrapper-level margin-bottom applied automatically to every
   block, entirely separate from each block's own Top/Bottom Padding design
   controls — it's what was producing a large visible gap even when a block's
   own padding was set to 0 (Export/Layout Investigation Sprint, Issue 5).
   Platform Polish Sprint 3: the per-block wrapper also always carries a
   fixed `padding:3px 22px` (top/bottom 3px) that sits between the visible
   content and this margin for cardless (border/background-less) blocks —
   measured live: a cardless pair's true rendered gap is 3px + FLOW_SPACING
   + 3px, not FLOW_SPACING alone. 16px here yields ~22px for that case
   (16 + 3 + 3 = 22). Card-treatment blocks (bordered/background-filled)
   absorb that same 3px padding inside their own visible edge, so their
   rendered gap is FLOW_SPACING alone (~16px) — an existing, inherent
   difference between the two treatments, not something this value can
   resolve on its own without touching per-block padding, which is out of
   scope here. */
const FLOW_SPACING = '16px';
const FLOW_SPACING_TIGHT = '2px';

// Keys of LumioState that should be persisted/restored across sessions.
const LUMIO_PERSISTED_KEYS = [
  'projects', 'folders', 'currentFolder', 'searchQuery', 'typeFilter',
  'wizard', 'courses', 'lessons', 'currentCourseId', 'currentLessonId',
  'learnerProgress', 'learnerPreview', 'learnerProfile', 'resume',
  'interactionHistory', 'assessmentAttempts',
  'currentUser', 'workspace', 'adminUsers', 'invitations',
  'users', 'workspaces', 'workspaceMemberships', 'session',
  'notifications', 'statusFilter', 'passwordResets',
  'labelPacks',
  'workspaceIdentity',
];

// Generates a stable local learner identifier in the form "local-xxxxxxxx".
// Used until a real LMS/SCORM/xAPI launch supplies an authoritative identity
// (at which point LumioLMS.initialize() will overwrite learnerId/learnerName).
function generateLearnerId() {
  return 'local-' + Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}

// Lazily creates LumioState.learnerProfile if it doesn't exist yet, and
// always refreshes lastAccessedAt. Safe to call on every learner render.
function ensureLearnerProfile() {
  if (!LumioState.learnerProfile) {
    const now = Date.now();
    LumioState.learnerProfile = {
      learnerId: generateLearnerId(),
      learnerName: null,
      startedAt: now,
      lastAccessedAt: now,
    };
  } else {
    LumioState.learnerProfile.lastAccessedAt = Date.now();
  }
  return LumioState.learnerProfile;
}

// Auth Functional Validation Sprint — root cause of the observed
// "register, then later the account is gone / duplicate / unusable" reports:
// every tab holds its own independent in-memory LumioState and saves by
// blindly overwriting the ENTIRE localStorage record with its own snapshot.
// With no backend and no cross-tab state sync, a stale tab (e.g. one left
// open on the login screen before a NEW account was registered in another
// tab) silently erases that brand-new user the next time it saves for any
// unrelated reason — confirmed live by registering a user, then writing an
// older snapshot back over it exactly as a second stale tab would.
// Fix: before writing, union-merge these specific auth-critical arrays
// (by id) with whatever is currently persisted, so no tab can ever cause a
// user/workspace/membership/reset-token created by another tab to vanish.
// Every other key still saves as a plain overwrite from this tab's own
// state, same as before — this only protects the records whose silent loss
// makes an account unusable.
const AUTH_CRITICAL_MERGE_KEYS = ['users', 'workspaces', 'workspaceMemberships', 'passwordResets'];
// workspaceMemberships records (app.js _bindNewUserToWorkspace, workspaceSettings.js
// acceptInvitation) have no `id` field at all — only workspaceId+userId, which
// together ARE the unique identity. Keying the merge by `.id` for this array
// collapsed every membership to a single `undefined` key, silently destroying
// membership data on every save that went through the merge — caught live
// when a real login lost its workspace membership after a single
// register/refresh/login cycle. Every other key in this list does have a
// real `id`, so a per-key identity function is used instead of assuming `.id`.
const AUTH_CRITICAL_MERGE_IDENTITY = {
  workspaceMemberships: (item) => `${item.workspaceId}::${item.userId}`,
};
function _authMergeIdentityOf(key, item) {
  const fn = AUTH_CRITICAL_MERGE_IDENTITY[key] || ((it) => it.id);
  return item ? fn(item) : undefined;
}
function _authMergeIdSet(key, arr) {
  return new Set((arr || []).map(item => _authMergeIdentityOf(key, item)).filter(Boolean));
}
function _mergeAuthCriticalArrays(snapshot) {
  let existingRaw;
  try { existingRaw = localStorage.getItem(LUMIO_STORAGE_KEY); } catch (e) { return; }
  if (!existingRaw) return;
  let existing;
  try { existing = JSON.parse(existingRaw); } catch (e) { return; }
  if (!existing || !existing.state) return;

  const knownAtBoot = LumioState.__knownIdsAtBoot || {};
  AUTH_CRITICAL_MERGE_KEYS.forEach(key => {
    const existingArr = Array.isArray(existing.state[key]) ? existing.state[key] : [];
    const ownArr = Array.isArray(snapshot[key]) ? snapshot[key] : [];
    if (existingArr.length === 0) return;
    const identityOf = AUTH_CRITICAL_MERGE_IDENTITY[key] || ((item) => item.id);
    const knownIds = knownAtBoot[key] || new Set();
    const byId = new Map();
    ownArr.forEach(item => { if (item) byId.set(identityOf(item), item); });
    // Only rescue records this tab never knew about (created by another tab
    // since this tab last loaded) — a record this tab DID know about at boot
    // but no longer has in its own array was a deliberate deletion and must
    // not be resurrected just because another tab's snapshot still has it.
    existingArr.forEach(item => {
      if (!item) return;
      const id = identityOf(item);
      if (!byId.has(id) && !knownIds.has(id)) byId.set(id, item);
    });
    snapshot[key] = Array.from(byId.values());
  });
}

function saveLumioState() {
  try {
    const snapshot = {};
    LUMIO_PERSISTED_KEYS.forEach(key => { snapshot[key] = LumioState[key]; });
    _mergeAuthCriticalArrays(snapshot);
    const record = {
      version: LUMIO_STATE_VERSION,
      savedAt: Date.now(),
      hash: location.hash,
      state: snapshot,
    };
    localStorage.setItem(LUMIO_STORAGE_KEY, JSON.stringify(record));
    // Refresh the "known ids" baseline to what THIS tab just wrote — otherwise
    // a record created and then deleted again within the same tab session
    // (without an intervening reload) would still look "unknown at boot" on
    // the next save and get wrongly rescued back from localStorage.
    LumioState.__knownIdsAtBoot = LumioState.__knownIdsAtBoot || {};
    AUTH_CRITICAL_MERGE_KEYS.forEach(key => {
      LumioState.__knownIdsAtBoot[key] = _authMergeIdSet(key, snapshot[key]);
    });
  } catch (e) {
    console.warn('Lumio: could not save state', e);
  }
}

// Migrates an older saved record's `state` payload up to LUMIO_STATE_VERSION.
function migrateLumioState(record) {
  let state = record.state || {};
  let version = record.version || 0;

  if (version < 2) {
    // v2 introduces Projects/Recent/Trash separation: projects gain
    // `lastAccessed` (for Recent sorting) and `deleted`/`deletedAt` (for Trash).
    (state.projects || []).forEach((p, i) => {
      if (p.lastAccessed === undefined) p.lastAccessed = Date.now() - i * 3600 * 1000;
      if (p.deleted === undefined) p.deleted = false;
      if (p.deletedAt === undefined) p.deletedAt = null;
    });
    version = 2;
  }

  if (version < 3) {
    // v3 introduces the real Hero Image system: heroImage gains src/fileName/
    // mimeType/displayMode/posX/posY/scale, and heroSettings gains a structured
    // overlay object plus titlePosition/textAlign/textColor. Old `textPosition`
    // (a combined left/center/right/top/bottom value) is migrated into the new
    // titlePosition + textAlign fields.
    Object.values(state.courses || {}).forEach(course => {
      const oldTextPosition = course.heroSettings && course.heroSettings.textPosition;
      ensureHeroDefaults(course);
      if (oldTextPosition) {
        if (['top', 'center', 'bottom'].includes(oldTextPosition)) {
          course.heroSettings.titlePosition = oldTextPosition;
        } else if (['left', 'right'].includes(oldTextPosition)) {
          course.heroSettings.textAlign = oldTextPosition;
        }
      }
      delete course.heroSettings.textPosition;
      delete course.heroSettings.position;
    });
    version = 3;
  }

  if (version < 4) {
    // v4 fixes a data-integrity issue: courses cloned from courseTemplate
    // reused the same lesson ids (l1/l2/l3) and assessment id (a1), so
    // getCourseAndLesson() could resolve content from the wrong course once
    // more than one course existed. Walk all courses in order, and the first
    // time an id is seen it's left untouched; any later course that reuses
    // an already-seen lesson/assessment id gets a freshly generated unique
    // id. Lesson content, completed-lesson progress, and knowledge-check
    // answers are carried over to the new id so nothing is lost.
    const seenLessonIds = new Set();
    const seenAssessmentIds = new Set();

    Object.values(state.courses || {}).forEach(course => {
      const lessonIdRemap = {};

      (course.lessons || []).forEach(lesson => {
        if (seenLessonIds.has(lesson.id)) {
          const oldId = lesson.id;
          const newId = generateUniqueId('l');
          lessonIdRemap[oldId] = newId;
          if (state.lessons && Object.prototype.hasOwnProperty.call(state.lessons, oldId)) {
            state.lessons[newId] = JSON.parse(JSON.stringify(state.lessons[oldId]));
          }
          lesson.id = newId;
        }
        seenLessonIds.add(lesson.id);
      });

      (course.assessments || []).forEach(a => {
        if (seenAssessmentIds.has(a.id)) {
          a.id = generateUniqueId('a');
        }
        seenAssessmentIds.add(a.id);
      });

      const progress = state.learnerProgress && state.learnerProgress[course.id];
      if (progress && Object.keys(lessonIdRemap).length) {
        if (Array.isArray(progress.completedLessons)) {
          progress.completedLessons = progress.completedLessons.map(id => lessonIdRemap[id] || id);
        }
        if (progress.kcAnswers) {
          const remappedAnswers = {};
          Object.entries(progress.kcAnswers).forEach(([key, val]) => {
            const sepIndex = key.indexOf(':');
            const lessonId = sepIndex === -1 ? key : key.slice(0, sepIndex);
            const rest = sepIndex === -1 ? '' : key.slice(sepIndex);
            const newLessonId = lessonIdRemap[lessonId] || lessonId;
            remappedAnswers[newLessonId + rest] = val;
          });
          progress.kcAnswers = remappedAnswers;
        }
      }
    });

    version = 4;
  }

  if (version < 5) {
    // v5 introduces the User Profile / Workspace Settings system: a real
    // currentUser profile, workspace identity/branding/system info, and
    // administrator/invitation records. Existing saved states predate these
    // keys, so backfill them from the LumioState defaults set above.
    if (!state.currentUser) state.currentUser = JSON.parse(JSON.stringify(LumioState.currentUser));
    if (!state.workspace) state.workspace = JSON.parse(JSON.stringify(LumioState.workspace));
    if (!state.adminUsers) state.adminUsers = JSON.parse(JSON.stringify(LumioState.adminUsers));
    if (!state.invitations) state.invitations = JSON.parse(JSON.stringify(LumioState.invitations));
    version = 5;
  }

  if (version < 6) {
    // v6 trims Workspace Settings down to an administrative area: drops the
    // branding/white-label fields (workspace name, company name, logo,
    // primary/secondary color, favicon, login background) and adds
    // licenseInfo to systemInfo.
    const w = state.workspace || {};
    delete w.name;
    delete w.companyName;
    delete w.logo;
    delete w.branding;
    if (!w.systemInfo) w.systemInfo = JSON.parse(JSON.stringify(LumioState.workspace.systemInfo));
    if (w.systemInfo.licenseInfo === undefined) w.systemInfo.licenseInfo = LumioState.workspace.systemInfo.licenseInfo;
    state.workspace = w;
    version = 6;
  }

  if (version < 7) {
    // v7 introduces the multi-owner permission model: any workspace member
    // (including the signed-in user) can hold the Owner or Admin role, and
    // the signed-in user gains a `status` field so they participate in the
    // "last remaining Owner" safeguard checks alongside other members.
    if (state.currentUser && state.currentUser.status === undefined) {
      state.currentUser.status = 'active';
    }
    (state.invitations || []).forEach(inv => {
      if (inv.role !== 'owner' && inv.role !== 'admin') inv.role = 'admin';
    });
    version = 7;
  }

  if (version < 8) {
    // v8 introduces authenticationProvider on all user records and invitations.
    // Existing accounts are local by definition, so backfill 'local' everywhere.
    if (state.currentUser && state.currentUser.authenticationProvider === undefined) {
      state.currentUser.authenticationProvider = 'local';
    }
    (state.adminUsers || []).forEach(u => {
      if (u.authenticationProvider === undefined) u.authenticationProvider = 'local';
    });
    (state.invitations || []).forEach(inv => {
      if (inv.authenticationProvider === undefined) inv.authenticationProvider = 'local';
    });
    version = 8;
  }

  if (version < 9) {
    // v9 ensures currentUser always has firstName/lastName/role so the sidebar
    // never shows "undefined undefined". Backfill from the code defaults when
    // fields are missing (happens when a v5–v8 save predated these fields or
    // when the profile save had a bug that omitted them).
    if (state.currentUser) {
      const cu = state.currentUser;
      // LumioState.currentUser's default is null (true first-run, no seeded
      // identity) — this old v9 step assumed a populated demo user existed
      // to backfill from; guard against that no longer being true.
      const def = LumioState.currentUser || {};
      if (!cu.firstName) cu.firstName = def.firstName;
      if (!cu.lastName)  cu.lastName  = def.lastName;
      if (!cu.email)     cu.email     = def.email;
      if (!cu.role)      cu.role      = def.role;
    }
    version = 9;
  }

  if (version < 10) {
    // v10 introduces project ownership + sharing model. All existing projects
    // are owned by the workspace owner ('u-owner') and start unshared.
    (state.projects || []).forEach(p => {
      if (p.ownerId === undefined) p.ownerId = 'u-owner';
      if (p.sharedWith === undefined) p.sharedWith = [];
      if (p.sharedScope === undefined) p.sharedScope = null;
      if (p.sharedPermission === undefined) p.sharedPermission = 'view';
    });
    // Ensure folder objects have a color property (older saves may lack it).
    (state.folders || []).forEach(f => {
      if (!f.color) f.color = 'purple';
    });
    version = 10;
  }

  if (version < 11) {
    // v11 introduces learner identity + resume foundation: learnerProfile and
    // resume are new top-level slots (nullable — created lazily on first
    // learner render via ensureLearnerProfile()/recordResume()). Existing
    // learnerProgress records gain courseStatus/courseCompletedAt/
    // lessonCompletedAt/lastLessonId/lastBlockIndex/lastAccessedAt, inferred
    // from the existing completedLessons array so nothing is lost.
    if (state.learnerProfile === undefined) state.learnerProfile = null;
    if (state.resume === undefined) state.resume = null;
    Object.entries(state.learnerProgress || {}).forEach(([courseId, progress]) => {
      if (!progress) return;
      const completed = Array.isArray(progress.completedLessons) ? progress.completedLessons : [];
      const course = (state.courses || {})[courseId];
      const totalLessons = course && Array.isArray(course.lessons) ? course.lessons.length : 0;
      if (progress.courseStatus === undefined) {
        progress.courseStatus = completed.length === 0 ? 'not_started'
          : (totalLessons && completed.length >= totalLessons ? 'completed' : 'in_progress');
      }
      if (progress.courseCompletedAt === undefined) {
        progress.courseCompletedAt = progress.courseStatus === 'completed' ? Date.now() : null;
      }
      if (progress.lessonCompletedAt === undefined) {
        const map = {};
        completed.forEach(id => { map[id] = null; }); // unknown historical timestamp
        progress.lessonCompletedAt = map;
      }
      if (progress.lastLessonId === undefined) progress.lastLessonId = completed[completed.length - 1] || null;
      if (progress.lastBlockIndex === undefined) progress.lastBlockIndex = 0;
      if (progress.lastAccessedAt === undefined) progress.lastAccessedAt = null;
    });
    version = 11;
  }

  if (version < 12) {
    // v12 introduces the interaction history + assessment attempt ledgers.
    // Both are append-only and brand new — there is no prior per-attempt
    // detail to backfill (kcAnswers only ever kept the latest attempt), so
    // existing saves simply start with empty ledgers going forward. Nothing
    // in learnerProgress/kcAnswers is touched or removed.
    if (state.interactionHistory === undefined) state.interactionHistory = {};
    if (state.assessmentAttempts === undefined) state.assessmentAttempts = {};
    version = 12;
  }

  if (version < 13) {
    // v13 introduces the real status lifecycle (draft/in_review/approved/
    // published/archived) and the review data model. Existing projects only
    // ever had the 3 old display-cased values — map them onto the new
    // lowercase enum 1:1; 'approved'/'archived' are new statuses only ever
    // reached going forward via the workflow, so no existing project needs
    // to map onto them. Review fields are brand new — null for every
    // existing project, no data loss, nothing inferred.
    const OLD_STATUS_MAP = { 'Draft': 'draft', 'In Review': 'in_review', 'Published': 'published' };
    (state.projects || []).forEach(p => {
      if (OLD_STATUS_MAP[p.status]) p.status = OLD_STATUS_MAP[p.status];
      else if (!['draft', 'in_review', 'approved', 'published', 'archived'].includes(p.status)) p.status = 'draft';
      if (p.reviewStatus === undefined) p.reviewStatus = null;
      if (p.reviewedBy === undefined) p.reviewedBy = null;
      if (p.reviewedAt === undefined) p.reviewedAt = null;
      if (p.reviewComments === undefined) p.reviewComments = null;
      if (p.submittedBy === undefined) p.submittedBy = null;
      if (p.submittedAt === undefined) p.submittedAt = null;
    });
    version = 13;
  }

  if (version < 14) {
    // v14 fixes the confirmed lesson/assessment id collision between
    // course c1 (courseTemplate) and project p1 (demoCourses.p1) — both
    // hand-authored seed objects independently used the literal ids
    // l1/l2/l3/a1 (see Identity & Entity Integrity Audit). Any save still
    // carrying the old ids on course p1 gets remapped to p1-l1/p1-l2/
    // p1-l3/p1-a1, with its CURRENT content (including any edits the user
    // already made) cloned over to the new key — never discarded. Every
    // cross-reference (progress, interaction history, assessment
    // attempts, resume) is remapped in lockstep so no tracked state is
    // silently orphaned under the old id.
    const p1Course = (state.courses || {}).p1;
    const OLD_TO_NEW = { l1: 'p1-l1', l2: 'p1-l2', l3: 'p1-l3', a1: 'p1-a1' };
    if (p1Course && p1Course.lessons && p1Course.lessons.some(l => OLD_TO_NEW[l.id])) {
      p1Course.lessons.forEach(l => { if (OLD_TO_NEW[l.id]) l.id = OLD_TO_NEW[l.id]; });
      (p1Course.assessments || []).forEach(a => { if (OLD_TO_NEW[a.id]) a.id = OLD_TO_NEW[a.id]; });

      // Clone lesson/assessment CONTENT (the actual block arrays) to the
      // new keys. The old keys are left in place afterward (still owned by
      // c1) rather than deleted, since deleting would destroy c1's content.
      Object.entries(OLD_TO_NEW).forEach(([oldId, newId]) => {
        if (state.lessons && Object.prototype.hasOwnProperty.call(state.lessons, oldId)) {
          state.lessons[newId] = JSON.parse(JSON.stringify(state.lessons[oldId]));
        }
      });

      // Remap progress/history/resume references from old id -> new id,
      // scoped to project p1 only (c1's own learnerProgress/history, if
      // any, is untouched — it correctly keeps using the original ids).
      const progress = state.learnerProgress && state.learnerProgress.p1;
      if (progress) {
        if (Array.isArray(progress.completedLessons)) {
          progress.completedLessons = progress.completedLessons.map(id => OLD_TO_NEW[id] || id);
        }
        if (progress.lastLessonId && OLD_TO_NEW[progress.lastLessonId]) progress.lastLessonId = OLD_TO_NEW[progress.lastLessonId];
        ['kcAnswers', 'blockProgress', 'lessonCompletedAt'].forEach(field => {
          if (!progress[field]) return;
          const remapped = {};
          Object.entries(progress[field]).forEach(([key, val]) => {
            const sep = key.indexOf(':');
            const lid = sep === -1 ? key : key.slice(0, sep);
            const rest = sep === -1 ? '' : key.slice(sep);
            remapped[(OLD_TO_NEW[lid] || lid) + rest] = val;
          });
          progress[field] = remapped;
        });
      }
      const history = state.interactionHistory && state.interactionHistory.p1;
      if (history) {
        Object.keys(OLD_TO_NEW).forEach(oldId => {
          if (history[oldId]) { history[OLD_TO_NEW[oldId]] = history[oldId]; delete history[oldId]; }
        });
      }
      if (state.assessmentAttempts && state.assessmentAttempts.a1) {
        state.assessmentAttempts['p1-a1'] = state.assessmentAttempts.a1;
        delete state.assessmentAttempts.a1;
      }
      if (state.resume && state.resume.courseId === 'p1' && OLD_TO_NEW[state.resume.lessonId]) {
        state.resume.lessonId = OLD_TO_NEW[state.resume.lessonId];
      }
    }
    version = 14;
  }

  if (version < 15) {
    // v15 namespaces assessmentAttempts under courseId (Entity Identity
    // Hardening Sprint) — previously a flat assessmentAttempts[assessmentId],
    // which meant two different courses both using the same assessment id
    // would silently merge their attempt histories into one array (a
    // confirmed risk in the Identity & Entity Integrity Audit, distinct
    // from the v14 lesson-id fix above). For each flat entry, find which
    // course currently owns that assessment id and nest it underneath. If
    // more than one course references the same id (only possible for an
    // already-known collision), the first course found keeps the history;
    // this is a best-effort resolution of a pre-existing ambiguity, not a
    // new loss — no attempts are discarded, only the rare ambiguous case
    // can't be split perfectly after the fact.
    const flatAttempts = state.assessmentAttempts;
    if (flatAttempts && !Object.values(flatAttempts).every(v => v && typeof v === 'object' && !Array.isArray(v))) {
      const nested = {};
      Object.entries(flatAttempts).forEach(([assessmentId, history]) => {
        if (!Array.isArray(history)) return; // already nested (shouldn't happen here, defensive)
        const owningCourse = Object.values(state.courses || {}).find(c =>
          (c.assessments || []).some(a => a.id === assessmentId)
        );
        const courseId = owningCourse ? owningCourse.id : 'unknown';
        if (!nested[courseId]) nested[courseId] = {};
        nested[courseId][assessmentId] = history;
      });
      state.assessmentAttempts = nested;
    }
    version = 15;
  }

  if (version < 16) {
    // v16 introduces the SaaS foundation entities (Workspace & Authentication
    // Foundation Sprint). users[]/workspaces[]/workspaceMemberships[]/session
    // are built by ensureSaasFoundation() at boot (idempotent, runs on every
    // load — handles both a fresh install and an upgraded save uniformly,
    // same pattern as ensureStableBlockIdentity()), so nothing to do for
    // those here. This step only extends existing invitations with the new
    // additive fields (workspaceId/invitedBy/expiresAt/acceptedAt) — no data
    // loss, existing fields (status/token/link/etc.) are untouched.
    (state.invitations || []).forEach(inv => {
      if (inv.workspaceId === undefined) inv.workspaceId = null; // backfilled properly once a real workspace exists for this save
      if (inv.invitedBy === undefined) inv.invitedBy = null; // historical invites never recorded who sent them
      if (inv.expiresAt === undefined) inv.expiresAt = (inv.createdAt || Date.now()) + 7 * 24 * 3600 * 1000; // 7-day default
      if (inv.acceptedAt === undefined) inv.acceptedAt = inv.status === 'accepted' ? (inv.createdAt || Date.now()) : null; // best-effort — exact accept time was never recorded historically
    });
    version = 16;
  }

  if (version < 17) {
    // v17: Authentication Persistence & Workspace Owner Recovery Sprint —
    // converts the seeded demo Workspace Owner (u-owner / jordan@lumio.app)
    // into a permanent real email/password account. Identity-guarded: only
    // touches the record if it still matches the ORIGINAL seed email, so a
    // real user who has since renamed the account or changed its email is
    // never overwritten.
    const owner = state.currentUser;
    const isOriginalSeedOwner = owner && owner.id === 'u-owner' && owner.email === 'jordan@lumio.app';
    if (isOriginalSeedOwner) {
      owner.firstName = 'Raymond';
      owner.lastName = 'Rowan';
      owner.email = 'raymondrowan72966@gmail.com';
      owner.password = 'md@7296666';
      owner.authenticationProvider = 'email';
    }
    const canonicalOwner = (state.users || []).find(u => u.id === 'u-owner');
    if (canonicalOwner && canonicalOwner.email === 'jordan@lumio.app') {
      canonicalOwner.firstName = 'Raymond';
      canonicalOwner.lastName = 'Rowan';
      canonicalOwner.displayName = 'Raymond Rowan';
      canonicalOwner.email = 'raymondrowan72966@gmail.com';
      canonicalOwner.authProvider = 'email';
      canonicalOwner.passwordHash = LumioAuth._hashPassword('md@7296666');
    }
    version = 17;
  }

  if (version < 18) {
    // v18: Governance & Review Workflow Hardening Sprint — additive only.
    // reviewHistory is backfilled empty (no historical data to recover);
    // a rejected project under the OLD scheme already reverted to 'draft'
    // before this sprint, so there's nothing to retroactively reclassify —
    // only NEW rejections from this point forward get the first-class
    // 'rejected' status.
    (state.projects || []).forEach(p => {
      if (!Array.isArray(p.reviewHistory)) p.reviewHistory = [];
    });
    if (!Array.isArray(state.notifications)) state.notifications = [];
    version = 18;
  }

  if (version < 19) {
    // v19: Account Persistence, User Management & Invitation System
    // Correction Sprint, Issues 6/10 — purge legacy DEMO identities
    // (Jordan Reyes, Alex Morgan and its Microsoft/Apple mock-login
    // siblings, Taylor Brooks, any plain demo.user@*) from any state
    // saved by an earlier version of the app. A genuinely converted real
    // account is explicitly NOT touched — only the exact, known seed/mock
    // emails are ever removed, by an allowlist, never a heuristic, so a
    // real user's own account can never be mistaken for a demo one.
    const LEGACY_DEMO_EMAILS = [
      'jordan@lumio.app', 'taylor@lumio.app',
      'demo.user@gmail.com', 'demo.user@outlook.com', 'demo.user@icloud.com',
    ];
    const isLegacyDemo = (u) => u && LEGACY_DEMO_EMAILS.includes((u.email || '').toLowerCase());

    const demoUserIds = new Set((state.users || []).filter(isLegacyDemo).map(u => u.id));
    if (state.currentUser && isLegacyDemo(state.currentUser)) demoUserIds.add(state.currentUser.id);
    (state.adminUsers || []).forEach(u => { if (isLegacyDemo(u)) demoUserIds.add(u.id); });

    if (demoUserIds.size > 0) {
      state.users = (state.users || []).filter(u => !demoUserIds.has(u.id));
      state.adminUsers = (state.adminUsers || []).filter(u => !demoUserIds.has(u.id));
      const demoWorkspaceIds = new Set((state.workspaces || []).filter(w => demoUserIds.has(w.ownerId)).map(w => w.id));
      state.workspaces = (state.workspaces || []).filter(w => !demoWorkspaceIds.has(w.id));
      state.workspaceMemberships = (state.workspaceMemberships || []).filter(m => !demoUserIds.has(m.userId) && !demoWorkspaceIds.has(m.workspaceId));
      state.invitations = (state.invitations || []).filter(inv => !demoWorkspaceIds.has(inv.workspaceId));
      // If the signed-in session WAS a demo identity, sign out cleanly —
      // never recreate it, never leave a dangling session pointing at a
      // user that no longer exists.
      if (state.session && demoUserIds.has(state.session.currentUserId)) {
        state.session = { currentUserId: null, currentWorkspaceId: null, rememberMe: false };
      }
      if (state.currentUser && demoUserIds.has(state.currentUser.id)) state.currentUser = null;
    }
    version = 19;
  }

  if (version < 20) {
    // v20: Workspace Identity Resource Foundation — ensure the workspaceIdentity
    // key is present in state (null = not yet loaded from cloud).
    if (!Object.prototype.hasOwnProperty.call(state, 'workspaceIdentity')) {
      state.workspaceIdentity = null;
    }
    version = 20;
  }

  if (version < 21) {
    // v21: Workspace Theme Selection — add selectedThemeId to any existing
    // workspaceIdentity object that pre-dates this sprint.
    if (state.workspaceIdentity && typeof state.workspaceIdentity === 'object'
        && !Object.prototype.hasOwnProperty.call(state.workspaceIdentity, 'selectedThemeId')) {
      state.workspaceIdentity.selectedThemeId = 'lumio';
    }
    version = 21;
  }

  return state;
}

function loadLumioState() {
  let restoredHash = null;
  try {
    const raw = localStorage.getItem(LUMIO_STORAGE_KEY);
    if (!raw) return restoredHash;

    const record = JSON.parse(raw);
    if (!record || typeof record !== 'object' || !record.state) return restoredHash;

    const state = migrateLumioState(record);
    LUMIO_PERSISTED_KEYS.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        LumioState[key] = state[key];
      }
    });

    // Snapshot of ids this tab knew about at boot, for _mergeAuthCriticalArrays:
    // a record missing from this tab's in-memory array that WAS already known
    // at boot is a deliberate deletion by this tab and must stay deleted; a
    // record this tab never knew about (created by another tab afterwards) is
    // the one case that needs rescuing from being overwritten away.
    LumioState.__knownIdsAtBoot = {};
    AUTH_CRITICAL_MERGE_KEYS.forEach(key => {
      LumioState.__knownIdsAtBoot[key] = _authMergeIdSet(key, state[key]);
    });

    if (typeof record.hash === 'string' && record.hash.startsWith('#/')) {
      restoredHash = record.hash;
    }
  } catch (e) {
    console.warn('Lumio: could not load saved state, starting fresh', e);
  }
  return restoredHash;
}

// Renders a human-readable "Edited X ago" label derived directly from a
// `lastAccessed` timestamp, so the displayed label can never drift out of
// sync with the value used for sorting/filtering Continue Working, All
// Projects, and Recent.
function relativeEditedLabel(ts) {
  if (!ts) return 'Edited recently';
  const diff = Date.now() - ts;
  const minute = 60 * 1000, hour = 60 * minute, day = 24 * hour, week = 7 * day;
  if (diff < minute) return 'Edited just now';
  if (diff < hour) { const n = Math.round(diff / minute); return `Edited ${n} minute${n === 1 ? '' : 's'} ago`; }
  if (diff < day) { const n = Math.round(diff / hour); return `Edited ${n} hour${n === 1 ? '' : 's'} ago`; }
  if (diff < 2 * day) return 'Edited yesterday';
  if (diff < week) { const n = Math.round(diff / day); return `Edited ${n} days ago`; }
  if (diff < 2 * week) return 'Edited 1 week ago';
  if (diff < 4 * week) { const n = Math.round(diff / week); return `Edited ${n} weeks ago`; }
  const n = Math.round(diff / (30 * day));
  return `Edited ${n} month${n === 1 ? '' : 's'} ago`;
}

// Bumps the active project's `lastAccessed`/`modified` whenever the user is
// on its Course Landing or Lesson Builder (incl. Assessment editing, which
// uses the same canvas) screen and something changes — covers Course
// Details, Landing Page, Hero Image, Lesson, and Assessment edits so
// Continue Working always reflects the most recently touched project.
function touchCurrentProject() {
  const parts = (location.hash || '').replace('#/', '').split('/');
  let courseId = null;
  if (parts[0] === 'course' && parts[1]) courseId = parts[1];
  else if (parts[0] === 'lesson') courseId = LumioState.currentCourseId;
  if (!courseId) return;
  const p = LumioState.projects.find(x => x.id === courseId);
  if (!p) return;
  p.lastAccessed = Date.now();
}

let lumioSaveTimer = null;
function scheduleLumioSave() {
  touchCurrentProject();
  if (lumioSaveTimer) clearTimeout(lumioSaveTimer);
  lumioSaveTimer = setTimeout(saveLumioState, 400);
}

/**
 * PUBLIC PERSISTENCE API — Golden Rule #14
 *
 * Single entry point for all course mutations (content, settings, lessons,
 * assessments, themes, labels, publish history). Call this instead of
 * invoking scheduleLumioSave() + cloudPersistProject() independently.
 *
 * Callers are insulated from implementation details. Future layers
 * (dirty-state tracking, retry queues, offline sync, conflict resolution,
 * telemetry) can be added here without changing any call site.
 *
 * @param {string} courseId  — project/course id that was mutated
 */
function persistCourse(courseId) {
  scheduleLumioSave();
  return cloudPersistProject(courseId);
}

/* ============================================================
   CLOUD PROJECT PERSISTENCE — Step 7
   All functions below operate only when the user is authenticated
   via the real backend (LumioSession.get().isAuthenticated === true).
   Legacy demo / localStorage users are completely unaffected.
   ============================================================ */

/** True when the user has a live server session (real backend auth). */
function isCloudUser() {
  return LumioSession.get().isAuthenticated;
}

/**
 * Map a project row returned by GET /projects (camelCase backend shape)
 * to the frontend LumioState.projects element shape.
 */
function _cloudProjectToState(p) {
  return {
    id:               p.id,
    title:            p.title,
    type:             p.type,
    status:           p.status || 'draft',
    health:           p.health != null ? p.health : 0,
    folder:           p.folderId || null,         // frontend uses `folder`
    lastAccessed:     p.lastAccessedAt || 0,      // frontend uses `lastAccessed`
    deleted:          !!p.deletedAt,
    deletedAt:        p.deletedAt || null,
    ownerId:          p.ownerId,
    workspaceId:      p.workspaceId,
    sharedWith:       [],
    sharedScope:      p.sharedScope || null,
    sharedPermission: p.sharedPermission || 'view',
    labelSet:         p.labelSet || null,
    reviewStatus: null, reviewedBy: null, reviewedAt: null,
    reviewComments: null, submittedBy: null, submittedAt: null,
    _cloud: true,
  };
}

/**
 * Map a course object returned by GET /projects/:id to the shape that
 * LumioState.courses[id] expects (camelCase → camelCase, mostly a pass-through,
 * but some field names differ between D1 response and legacy frontend).
 */
function _cloudCourseToState(c) {
  if (!c) return null;
  return Object.assign({}, c);
}

/**
 * Replace LumioState.projects with the workspace's projects from D1.
 * Courses and lessons are NOT loaded here — they're lazy-loaded when a
 * project is opened (openProject calls _cloudLoadCourse when needed).
 * Silently no-ops on network error — keeps localStorage cache as fallback.
 */
async function _loadCloudProjects() {
  try {
    const cloudProjects = await LumioAPI.projects.list();
    if (!Array.isArray(cloudProjects)) return;
    LumioState.projects = cloudProjects.map(_cloudProjectToState);
    saveLumioState();
  } catch (err) {
    console.warn('[Lumio] Cloud project list failed — using local cache:', err);
  }
}

// Registry of workspace-owned resource types. Each entry maps a camelCase key
// (used as the URL segment and as the LumioState property name) to its config.
// Extend here to add Themes, Branding, Settings — the sync and load functions
// below iterate this registry automatically; no other code needs to change.
// Fixed key used internally when wrapping singleton resources into the
// Record<id, item> shape the generic API contract requires.
// Consumers never see this key — wrapping/unwrapping is done in cloudSyncWorkspace
// and _loadCloudWorkspace. The D1 row for any singleton type has id = this value.
const WORKSPACE_SINGLETON_KEY = 'default';

const WORKSPACE_RESOURCES = {
  labelPacks:        { stateKey: 'labelPacks' },
  workspaceIdentity: { stateKey: 'workspaceIdentity', singleton: true },
};

// Built-in Workspace Themes — locked, always available, always the fallback.
// Each theme carries explicit token values. There are no independently stored
// swatch values — preview cards derive swatches from tokens directly.
// styles.css :root provides application defaults ONLY when Workspace Identity
// is unavailable (unauthenticated / not yet loaded).
const BUILTIN_THEMES = [
  {
    id:     'lumio',
    name:   'Lumio',
    locked: true,
    tokens: {
      primary:    '#7C3AED',
      secondary:  '#4F46E5',
      accent:     '#06B6D4',
      surface:    '#FFFFFF',
      surfaceAlt: '#FBFBFE',
      border:     '#E5E5EE',
      text:       '#3A3655',
      textMuted:  '#8A8A9E',
      icon:       '#7C3AED',
      shadow:     '0 8px 24px rgba(31, 27, 58, 0.06)',
      radius:     '20px',
      sidebarBg:  '#FFFFFF',
      topbarBg:   '#FFFFFF',
    },
  },
  {
    id:     'ocean',
    name:   'Ocean',
    locked: true,
    tokens: {
      primary:    '#0284C7',
      secondary:  '#0EA5E9',
      accent:     '#14B8A6',
      surface:    '#FFFFFF',
      surfaceAlt: '#F0F9FF',
      border:     '#BAE6FD',
      text:       '#0C4A6E',
      textMuted:  '#64748B',
      icon:       '#0284C7',
      shadow:     '0 8px 24px rgba(2, 132, 199, 0.08)',
      radius:     '16px',
      sidebarBg:  '#F0F9FF',
      topbarBg:   '#FFFFFF',
    },
  },
  {
    id:     'midnight',
    name:   'Midnight',
    locked: true,
    tokens: {
      primary:    '#818CF8',
      secondary:  '#A78BFA',
      accent:     '#34D399',
      surface:    '#2A2640',
      surfaceAlt: '#1E1B2E',
      border:     '#3D3860',
      text:       '#E2E0F0',
      textMuted:  '#9CA3AF',
      icon:       '#818CF8',
      shadow:     '0 8px 24px rgba(0, 0, 0, 0.40)',
      radius:     '20px',
      sidebarBg:  '#16131F',
      topbarBg:   '#1E1B2E',
    },
  },
  {
    id:     'corporate',
    name:   'Corporate',
    locked: true,
    tokens: {
      primary:    '#2563EB',
      secondary:  '#3B82F6',
      accent:     '#0EA5E9',
      surface:    '#FFFFFF',
      surfaceAlt: '#F8FAFC',
      border:     '#E2E8F0',
      text:       '#1E293B',
      textMuted:  '#64748B',
      icon:       '#2563EB',
      shadow:     '0 4px 16px rgba(30, 41, 59, 0.08)',
      radius:     '8px',
      sidebarBg:  '#F1F5F9',
      topbarBg:   '#FFFFFF',
    },
  },
];

// ── Workspace Logo Renderer ───────────────────────────────────────────────────
// Every logo displayed on the platform is rendered through renderWorkspaceLogo().
// No page or component may render logo assets directly.

const LOGO_SLOTS = {
  LOGIN_BADGE:       'login-badge',        // 40 × 40 brand badge in the login page backdrop corner
  LOGIN_BACKGROUND:  'login-background',   // Full-bleed left-panel background image (replaces Lumio artwork)
  LOGIN_BRAND:       'login-brand',        // Reserved — 320 × 120 max, future white-label login lockup
  SIDEBAR:           'sidebar',            // Normal sidebar icon (34 × 34)
  SIDEBAR_LARGE:     'sidebar-large',      // Featured sidebar logo on hub/projects (140 × auto)
  COMPACT:           'compact',            // Topbar icon in builder / learner / wizard (32 × 32)
  WELCOME:           'welcome',            // Authenticated welcome/loading screen (240 × 240 max)
  FAVICON:           'favicon',            // Reserved — managed by index.html <link rel="icon">
};

/**
 * Return an <img> HTML string for the workspace logo at the given slot.
 *
 * Slot sizes are owned by CSS (.ws-logo--<slot>).  Pages must never apply
 * inline sizing to logo images.
 *
 * @param {string} slot   - One of the LOGO_SLOTS values.
 * @param {object} [opts] - { id: string } — optional DOM id for event binding.
 */
function renderWorkspaceLogo(slot, opts = {}) {
  const identity = LumioState.workspaceIdentity;
  const logos    = (identity && typeof identity.logos === 'object') ? identity.logos : {};
  const SLOT_FALLBACKS = { 'login-background': 'assets/lumio-login-backdrop.png' };
  const FALLBACK = SLOT_FALLBACKS[slot] || 'assets/lumio-logo-transparent.png';
  const src      = logos[slot] || FALLBACK;
  const idAttr   = opts.id  ? ` id="${opts.id}"` : '';
  const alt      = opts.alt !== undefined ? opts.alt : 'Workspace logo';
  return `<img src="${src}" alt="${alt}" class="ws-logo ws-logo--${slot}"${idAttr} />`;
}

/* ── Platform Icon Infrastructure ─────────────────────────────── */

// Private SVG inner content for each semantic ID (24×24 viewBox, stroke-based).
// Only platformIcon() reads this. Pages must never reference _IC_PATHS directly.
const _IC_PATHS = {
  'projects':       '<path d="M2 8h20v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8z"/><path d="M2 8V6a2 2 0 0 1 2-2h3.5L9 4h6l1.5 2H20a2 2 0 0 1 2 2"/>',
  'hub':            '<path d="M22 10v1a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'recent':         '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'settings':       '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  'notifications':  '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  'sign-out':       '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  'success':        '<polyline points="20 6 9 17 4 12"/>',
  'check':          '<polyline points="20 6 9 17 4 12"/>',
  'info':           '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  'warning':        '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'error':          '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  'ai':             '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  'export-pack':    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  'publish':        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  'submit-review':  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  'review':         '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  'preview':        '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  'progress':       '<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>',
  'edit':           '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  'duplicate':      '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  'share':          '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  'delete':         '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  'archive':        '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
  'restore':        '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.75"/>',
  'reject':         '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  'search':         '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'email':          '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/>',
  'password':       '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'lock':           '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'key':            '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  'save':           '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  'cloud':          '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  'fullscreen':     '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  'close':          '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  'menu':           '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  'device-desktop': '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  'device-mobile':  '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  'device-tablet':  '<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  'notes':          '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  'globe':          '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  'rocket':         '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  'lightbulb':      '<line x1="9" y1="21" x2="15" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M12 3a7 7 0 0 1 7 7 7 7 0 0 0-4 6H9a7 7 0 0 0-4-6 7 7 0 0 1 7-7z"/>',
  'arrow-up':       '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  'arrow-down':     '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  'chevron-right':  '<polyline points="9 18 15 12 9 6"/>',
  'chevron-left':   '<polyline points="15 18 9 12 15 6"/>',
  'chevron-down':   '<polyline points="6 9 12 15 18 9"/>',
  // Shell / UI artwork — Sprint 7B
  // Navigation
  'back':               '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  'collapse-left':      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="13 8 8 12 13 16"/>',
  'expand-right':       '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="11 8 16 12 11 16"/>',
  // Editor layout
  'align-left':         '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="14" y2="12"/><line x1="3" y1="18" x2="17" y2="18"/>',
  'align-center':       '<line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/>',
  'align-right':        '<line x1="3" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="7" y1="18" x2="21" y2="18"/>',
  'drag-handle':        '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  'more-options':       '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  'remove':             '<circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>',
  'word-count':         '<line x1="9" y1="8" x2="9" y2="16"/><line x1="15" y1="8" x2="15" y2="16"/><line x1="6" y1="11" x2="18" y2="11"/><line x1="6" y1="13" x2="18" y2="13"/>',
  'flip':               '<rect x="2" y="7" width="20" height="10" rx="2"/><polyline points="9 4 12 1 15 4"/><polyline points="9 20 12 23 15 20"/>',
  // Workspace
  'folder':             '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  'person':             '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'team':               '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'tag':                '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  'target':             '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  'celebration':        '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/>',
  // Media UI
  'image-placeholder':  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  'audio-placeholder':  '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="9" y2="15"/><line x1="12" y1="7" x2="12" y2="17"/><line x1="15" y1="10" x2="15" y2="14"/>',
  'video-placeholder':  '<rect x="3" y="3" width="18" height="18" rx="2"/><polygon points="10 8 16 12 10 16 10 8"/>',
  'play':               '<polygon points="5 3 19 12 5 21 5 3"/>',
  'upload-media':       '<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="16 10 12 6 8 10"/><line x1="12" y1="6" x2="12" y2="16"/>',
  'replace-media':      '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  'download':           '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  // Block Categories artwork — Sprint 7C
  'cat-recommended':    '<circle cx="12" cy="8" r="5"/><path d="M8.56 13.9L7 22l5-3 5 3-1.56-8.1"/>',
  'cat-text':           '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/>',
  'cat-images':         '<rect x="5" y="2" width="16" height="16" rx="2"/><rect x="3" y="5" width="16" height="16" rx="2"/>',
  'cat-gallery':        '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  'cat-multimedia':     '<rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10 9 16 12 10 15 10 9"/><line x1="2" y1="20" x2="22" y2="20"/>',
  'cat-lists':          '<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="5" cy="6" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="5" cy="18" r="1.5"/>',
  'cat-statements':     '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="13" y2="13"/>',
  'cat-quotes':         '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
  'cat-charts':         '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/>',
  'cat-dividers':       '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="9" x2="3" y2="15"/><line x1="21" y1="9" x2="21" y2="15"/>',
  'cat-interactive':    '<path d="M9 11V6a3 3 0 0 1 6 0v5"/><path d="M9 11H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/><circle cx="12" cy="16" r="1"/>',
  'cat-knowledge-checks':'<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><polyline points="9 12 11 14 15 10"/>',
  // Block Types artwork — Sprint 7D
  // Text
  'block-heading':            '<line x1="5" y1="4" x2="5" y2="20"/><line x1="19" y1="4" x2="19" y2="20"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'block-paragraph':          '<line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="14" y2="17"/>',
  'block-heading-paragraph':  '<line x1="4" y1="3" x2="4" y2="9"/><line x1="13" y1="3" x2="13" y2="9"/><line x1="4" y1="6" x2="13" y2="6"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="3" y1="19" x2="15" y2="19"/>',
  // Layout
  'block-columns':            '<rect x="2" y="3" width="9" height="18" rx="2"/><rect x="13" y="3" width="9" height="18" rx="2"/>',
  'block-table':              '<rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="2" y1="15" x2="22" y2="15"/><line x1="8" y1="3" x2="8" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',
  // Statements — shared container: rect + left bar; inner icon differentiates
  'block-statement-info':     '<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="4" x2="6" y2="20"/><circle cx="13" cy="9.5" r="1"/><line x1="13" y1="12" x2="13" y2="15.5"/>',
  'block-statement-tip':      '<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="4" x2="6" y2="20"/><circle cx="13" cy="10" r="2.5"/><line x1="13" y1="13" x2="13" y2="15"/><line x1="11.5" y1="15" x2="14.5" y2="15"/>',
  'block-statement-success':  '<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="4" x2="6" y2="20"/><polyline points="9.5 12 12 14.5 17 9.5"/>',
  'block-statement-warning':  '<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="4" x2="6" y2="20"/><path d="M10 16l3-6 3 6z"/><line x1="13" y1="12" x2="13" y2="13.5"/>',
  'block-statement-error':    '<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="4" x2="6" y2="20"/><circle cx="13" cy="12" r="3"/><line x1="11.5" y1="10.5" x2="14.5" y2="13.5"/><line x1="14.5" y1="10.5" x2="11.5" y2="13.5"/>',
  'block-statement-note':     '<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="4" x2="6" y2="20"/><line x1="10" y1="10" x2="18" y2="10"/><line x1="10" y1="13" x2="18" y2="13"/><line x1="10" y1="16" x2="15" y2="16"/>',
  // Quotes — shared quote glyph; companion element differentiates
  'block-quote':              '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
  'block-quote-image':        '<path d="M4 10c0-2.2 1.8-4 4-4V8c-1 0-2 .9-2 2h3v5H4v-5z"/><path d="M12 10c0-2.2 1.8-4 4-4V8c-1 0-2 .9-2 2h3v5h-5v-5z"/><rect x="4" y="17" width="16" height="5" rx="1"/><circle cx="8" cy="19.5" r="1.5"/><polyline points="4 22 9 18.5 12 21 15 18.5 20 22"/>',
  'block-quote-carousel':     '<path d="M4 10c0-2.2 1.8-4 4-4V8c-1 0-2 .9-2 2h3v5H4v-5z"/><path d="M12 10c0-2.2 1.8-4 4-4V8c-1 0-2 .9-2 2h3v5h-5v-5z"/><line x1="3" y1="19" x2="21" y2="19"/><circle cx="9" cy="22" r="1"/><circle cx="12" cy="22" r="1.5"/><circle cx="15" cy="22" r="1"/><polyline points="3 17 1 19 3 21"/><polyline points="21 17 23 19 21 21"/>',
  // Lists — left marker differentiates: circle vs rect vs checkbox
  'block-list-bullet':        '<circle cx="5" cy="7" r="1.5"/><line x1="9" y1="7" x2="21" y2="7"/><circle cx="5" cy="13" r="1.5"/><line x1="9" y1="13" x2="21" y2="13"/><circle cx="5" cy="19" r="1.5"/><line x1="9" y1="19" x2="17" y2="19"/>',
  'block-list-numbered':      '<rect x="3" y="5" width="4" height="4" rx="1"/><line x1="9" y1="7" x2="21" y2="7"/><rect x="3" y="11" width="4" height="4" rx="1"/><line x1="9" y1="13" x2="21" y2="13"/><rect x="3" y="17" width="4" height="4" rx="1"/><line x1="9" y1="19" x2="17" y2="19"/>',
  'block-list-checkbox':      '<rect x="3" y="5" width="4" height="4" rx="1"/><polyline points="4 7 5 8 7 6"/><line x1="9" y1="7" x2="21" y2="7"/><rect x="3" y="11" width="4" height="4" rx="1"/><polyline points="4 13 5 14 7 12"/><line x1="9" y1="13" x2="21" y2="13"/><rect x="3" y="17" width="4" height="4" rx="1"/><line x1="9" y1="19" x2="17" y2="19"/>',
  // Media
  'block-image':              '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="2"/><path d="M3 17l5-4 4 4 3-3 6 4"/>',
  'block-image-text':         '<rect x="2" y="4" width="10" height="16" rx="2"/><circle cx="7" cy="9" r="1.5"/><path d="M2 17l4-3 6 3"/><line x1="14" y1="7" x2="22" y2="7"/><line x1="14" y1="11" x2="22" y2="11"/><line x1="14" y1="15" x2="20" y2="15"/>',
  'block-text-on-image':      '<rect x="2" y="3" width="20" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="M2 14l5-4 4 4 4-3 7 3"/><rect x="2" y="15" width="20" height="6"/><line x1="5" y1="17.5" x2="17" y2="17.5"/><line x1="5" y1="19.5" x2="13" y2="19.5"/>',
  'block-carousel':           '<rect x="4" y="5" width="16" height="12" rx="2"/><circle cx="9" cy="20" r="1"/><circle cx="12" cy="20" r="1.5"/><circle cx="15" cy="20" r="1"/><polyline points="3 9 1 11 3 13"/><polyline points="21 9 23 11 21 13"/>',
  'block-grid':               '<rect x="2" y="2" width="6" height="9" rx="1"/><rect x="9" y="2" width="6" height="9" rx="1"/><rect x="16" y="2" width="6" height="9" rx="1"/><rect x="2" y="13" width="6" height="9" rx="1"/><rect x="9" y="13" width="6" height="9" rx="1"/><rect x="16" y="13" width="6" height="9" rx="1"/>',
  'block-audio':              '<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="7" y1="9" x2="7" y2="15"/><line x1="10" y1="11" x2="10" y2="13"/><line x1="12" y1="7" x2="12" y2="17"/><line x1="14" y1="11" x2="14" y2="13"/><line x1="17" y1="9" x2="17" y2="15"/>',
  'block-video':              '<rect x="2" y="4" width="20" height="13" rx="2"/><polygon points="10 8 16 10.5 10 13 10 8"/><line x1="2" y1="21" x2="22" y2="21"/><circle cx="6" cy="21" r="1.5"/>',
  'block-file':               '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="8 14 12 18 16 14"/><line x1="12" y1="18" x2="12" y2="10"/>',
  // Interactive layout blocks
  'block-accordion':          '<rect x="2" y="3" width="20" height="5" rx="1"/><polyline points="9 5 12 7.5 15 5"/><line x1="2" y1="11" x2="22" y2="11"/><line x1="2" y1="15" x2="22" y2="15"/><line x1="2" y1="19" x2="22" y2="19"/>',
  'block-tabs':               '<rect x="2" y="8" width="20" height="14" rx="2"/><rect x="2" y="3" width="7" height="7" rx="2"/><rect x="10" y="5" width="6" height="5" rx="1"/><rect x="17" y="5" width="5" height="5" rx="1"/>',
  'block-hotspot':            '<rect x="2" y="2" width="20" height="15" rx="2"/><circle cx="8" cy="8" r="2"/><line x1="8" y1="10" x2="8" y2="13"/><circle cx="16" cy="7" r="2"/><line x1="16" y1="9" x2="16" y2="12"/>',
  'block-process':            '<rect x="1" y="9" width="5" height="6" rx="1"/><line x1="6" y1="12" x2="9" y2="12"/><polyline points="8 10 10 12 8 14"/><rect x="10" y="9" width="5" height="6" rx="1"/><line x1="15" y1="12" x2="18" y2="12"/><polyline points="17 10 19 12 17 14"/><rect x="19" y="9" width="4" height="6" rx="1"/>',
  'block-scenario':           '<circle cx="12" cy="4" r="2"/><line x1="12" y1="6" x2="7" y2="13"/><line x1="12" y1="6" x2="17" y2="13"/><circle cx="7" cy="15" r="2"/><circle cx="17" cy="15" r="2"/><line x1="5" y1="17" x2="3" y2="21"/><line x1="9" y1="17" x2="11" y2="21"/><line x1="15" y1="17" x2="13" y2="21"/><line x1="19" y1="17" x2="21" y2="21"/>',
  // Flashcards — stack vs grid; grid uses front/back divider to distinguish from block-grid
  'block-flashcard-stack':    '<rect x="5" y="3" width="15" height="11" rx="2"/><rect x="2" y="9" width="15" height="11" rx="2"/>',
  'block-flashcard-grid':     '<rect x="2" y="2" width="9" height="9" rx="2"/><line x1="6.5" y1="2" x2="6.5" y2="11"/><rect x="13" y="2" width="9" height="9" rx="2"/><line x1="17.5" y1="2" x2="17.5" y2="11"/><rect x="2" y="13" width="9" height="9" rx="2"/><line x1="6.5" y1="13" x2="6.5" y2="22"/><rect x="13" y="13" width="9" height="9" rx="2"/><line x1="17.5" y1="13" x2="17.5" y2="22"/>',
  'block-button':             '<rect x="3" y="8" width="18" height="8" rx="4"/>',
  // Charts
  'block-chart-bar':          '<line x1="3" y1="20" x2="21" y2="20"/><line x1="3" y1="3" x2="3" y2="20"/><line x1="7" y1="20" x2="7" y2="12"/><line x1="11" y1="20" x2="11" y2="6"/><line x1="15" y1="20" x2="15" y2="15"/><line x1="19" y1="20" x2="19" y2="9"/>',
  'block-chart-line':         '<line x1="3" y1="20" x2="21" y2="20"/><line x1="3" y1="3" x2="3" y2="20"/><polyline points="4 16 8 10 12 13 16 7 20 9"/>',
  'block-chart-pie':          '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l7.8 4.5"/><line x1="12" y1="12" x2="4.2" y2="16.5"/>',
  // Dividers
  'block-divider-line':       '<line x1="2" y1="12" x2="22" y2="12"/>',
  'block-divider-numbered':   '<line x1="2" y1="12" x2="7" y2="12"/><circle cx="12" cy="12" r="5"/><line x1="17" y1="12" x2="22" y2="12"/><line x1="3" y1="9" x2="3" y2="15"/><line x1="21" y1="9" x2="21" y2="15"/>',
  'block-divider-continue':   '<line x1="2" y1="12" x2="8" y2="12"/><rect x="8" y="8" width="8" height="8" rx="2"/><polyline points="11 10 13 12 11 14"/><line x1="16" y1="12" x2="22" y2="12"/>',
  'block-divider-spacer':     '<line x1="2" y1="7" x2="22" y2="7"/><line x1="2" y1="17" x2="22" y2="17"/>',
  // Knowledge checks
  'block-kc-multiple-choice': '<line x1="3" y1="5" x2="21" y2="5"/><circle cx="5" cy="12" r="2"/><circle cx="5" cy="12" r="1"/><line x1="9" y1="12" x2="20" y2="12"/><circle cx="5" cy="18" r="2"/><line x1="9" y1="18" x2="20" y2="18"/>',
  'block-kc-multiple-response':'<line x1="3" y1="5" x2="21" y2="5"/><rect x="3" y="10" width="4" height="4" rx="1"/><polyline points="4 12 5 13 7 11"/><line x1="9" y1="12" x2="20" y2="12"/><rect x="3" y="17" width="4" height="4" rx="1"/><polyline points="4 19 5 20 7 18"/><line x1="9" y1="19" x2="20" y2="19"/>',
  'block-kc-matching':        '<circle cx="5" cy="8" r="2"/><circle cx="5" cy="16" r="2"/><circle cx="19" cy="8" r="2"/><circle cx="19" cy="16" r="2"/><line x1="7" y1="8" x2="17" y2="16"/><line x1="7" y1="16" x2="17" y2="8"/>',
  'block-kc-matching-cards':  '<rect x="2" y="5" width="8" height="6" rx="1"/><rect x="14" y="5" width="8" height="6" rx="1"/><rect x="2" y="14" width="8" height="6" rx="1"/><rect x="14" y="14" width="8" height="6" rx="1"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="10" y1="17" x2="14" y2="17"/>',
  'block-kc-fill-blank':      '<line x1="3" y1="8" x2="8" y2="8"/><rect x="8" y="5" width="7" height="6" rx="1"/><line x1="15" y1="8" x2="21" y2="8"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="3" y1="18" x2="15" y2="18"/>',
  'block-kc-ordering':        '<rect x="3" y="4" width="14" height="4" rx="1"/><rect x="3" y="10" width="14" height="4" rx="1"/><rect x="3" y="16" width="14" height="4" rx="1"/><line x1="20" y1="5" x2="20" y2="19"/><polyline points="18 7 20 5 22 7"/><polyline points="18 17 20 19 22 17"/>',
  // Media Types artwork — Sprint 7E (FINAL)
  'media-type-image':    '<circle cx="12" cy="9" r="4"/><path d="M3 20l5-6 4 5 3-4 6 5"/>',
  'media-type-audio':    '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  'media-type-video':    '<rect x="2" y="6" width="20" height="12" rx="2"/><rect x="2" y="6" width="3" height="3"/><rect x="2" y="12" width="3" height="3"/><rect x="19" y="6" width="3" height="3"/><rect x="19" y="12" width="3" height="3"/>',
  'media-type-document': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
};

// Emoji for the Lumio (default) icon pack.
const _IC_EMOJI = {
  'projects':       '🗂️',
  'hub':            '🎓',
  'recent':         '⏱️',
  'settings':       '⚙️',
  'notifications':  '🔔',
  'sign-out':       '↩️',
  'success':        '✅',
  'check':          '✓',
  'info':           'ℹ️',
  'warning':        '⚠️',
  'error':          '❌',
  'ai':             '✨',
  'export-pack':    '📦',
  'publish':        '📤',
  'submit-review':  '📤',
  'review':         '👀',
  'preview':        '👁️',
  'progress':       '⏳',
  'edit':           '✏️',
  'duplicate':      '⧉',
  'share':          '🔗',
  'delete':         '🗑️',
  'archive':        '🗄️',
  'restore':        '↩️',
  'reject':         '↩️',
  'search':         '🔍',
  'email':          '✉️',
  'password':       '🔒',
  'lock':           '🔒',
  'key':            '🔑',
  'save':           '💾',
  'cloud':          '☁️',
  'fullscreen':     '⛶',
  'close':          '✕',
  'menu':           '☰',
  'device-desktop': '🖥️',
  'device-mobile':  '📱',
  'device-tablet':  '📲',
  'notes':          '📝',
  'globe':          '🌐',
  'rocket':         '🚀',
  'lightbulb':      '💡',
  'arrow-up':       '↑',
  'arrow-down':     '↓',
  'chevron-right':  '▸',
  'chevron-left':   '◂',
  'chevron-down':   '▾',
  // Shell / UI IDs
  'back':               '←',
  'collapse-left':      '«',
  'expand-right':       '»',
  'drag-handle':        '⠿',
  'flip':               '↻',
  'more-options':       '⋯',
  'align-left':         '⟸',
  'align-center':       '≡',
  'align-right':        '⟹',
  'folder':             '📁',
  'person':             '👤',
  'team':               '👥',
  'tag':                '🏷️',
  'target':             '🎯',
  'celebration':        '🎉',
  'download':           '⬇',
  'play':               '▶',
  'upload-media':       '⬆',
  'replace-media':      '🔄',
  'image-placeholder':  '🖼️',
  'video-placeholder':  '▶',
  'audio-placeholder':  '🔊',
  'word-count':         '#',
  'remove':             '×',
  // Block category IDs
  'cat-recommended':     '✨',
  'cat-text':            '📝',
  'cat-statements':      '💬',
  'cat-quotes':          '“',
  'cat-lists':           '☰',
  'cat-images':          '🖼️',
  'cat-gallery':         '🎞️',
  'cat-multimedia':      '🎬',
  'cat-interactive':     '🧩',
  'cat-charts':          '📊',
  'cat-dividers':        '➖',
  'cat-knowledge-checks':'✅',
  // Block tile IDs
  'block-heading':            'H',
  'block-heading-paragraph':  'H¶',
  'block-paragraph':          '¶',
  'block-columns':            '▥',
  'block-table':              '▦',
  'block-statement-info':     'ℹ️',
  'block-statement-tip':      '💡',
  'block-statement-success':  '✅',
  'block-statement-warning':  '⚠️',
  'block-statement-error':    '⛔',
  'block-statement-note':     '📝',
  'block-quote':              '“',
  'block-quote-image':        '“🖼',
  'block-quote-carousel':     '🔄',
  'block-list-numbered':      '1.',
  'block-list-checkbox':      '☑',
  'block-list-bullet':        '•',
  'block-image':              '🖼',
  'block-image-text':         '🖼¶',
  'block-text-on-image':      '🖼T',
  'block-carousel':           '🔄',
  'block-grid':               '▦',
  'block-audio':              '🔊',
  'block-video':              '▶',
  'block-file':               '📎',
  'block-accordion':          '⬇',
  'block-tabs':               '🗂',
  'block-hotspot':            '📍',
  'block-process':            '➡',
  'block-scenario':           '🌳',
  'block-flashcard-grid':     '🗃',
  'block-flashcard-stack':    '🗂',
  'block-button':             '🔘',
  'block-chart-bar':          '📊',
  'block-chart-line':         '📈',
  'block-chart-pie':          '🥧',
  'block-divider-continue':   '⏵',
  'block-divider-numbered':   '①',
  'block-divider-line':       '—',
  'block-divider-spacer':     '⬜',
  'block-kc-multiple-choice':  '◉',
  'block-kc-multiple-response':'☑',
  'block-kc-matching':         '⇄',
  'block-kc-matching-cards':   '⊞',
  'block-kc-fill-blank':       '▭',
  'block-kc-ordering':         '↕',
  // Media type category IDs (media picker tabs and dropzones)
  'media-type-image':    '🖼️',
  'media-type-audio':    '🎵',
  'media-type-video':    '🎬',
  'media-type-document': '📎',
};

// Published pack identifiers. Only 'lumio', 'outline', 'sketch' are implemented.
// Reserved names route to 'lumio' until a future sprint implements them.
const ICON_PACKS = {
  lumio:     'lumio',
  outline:   'outline',
  sketch:    'sketch',
  // reserved — not yet implemented:
  corporate: 'corporate',
  minimal:   'minimal',
  rounded:   'rounded',
  filled:    'filled',
};

// Artwork Completeness Contract — architectural invariant, not a runtime feature.
// COMPLETE: every registered semantic ID has artwork in this pack.
// INCOMPLETE: some semantic IDs are awaiting artwork (Lumio emoji fallback active).
// RESERVED: pack is defined but no artwork work has begun.
// A pack may not ship to production while its status is INCOMPLETE or RESERVED.
const ICON_PACK_STATUS = {
  lumio:     'COMPLETE',    // canonical fallback — every ID has a Lumio emoji
  outline:   'COMPLETE',    // 133 / 133 IDs have SVG paths; Artwork Migration complete Sprint 7E
  sketch:    'INCOMPLETE',  // 47 / 133 IDs have SVG paths; awaiting Artwork Migration sprint
  corporate: 'RESERVED',
  minimal:   'RESERVED',
  rounded:   'RESERVED',
  filled:    'RESERVED',
};

function _resolveIconPack() {
  const id = LumioState.workspaceIdentity?.iconPack?.packId;
  if (id === 'outline' || id === 'sketch') return id;
  return 'lumio';
}

/**
 * Returns an HTML string for a platform icon by semantic ID.
 *
 * Fallback chain:
 *   Requested pack (SVG)  →  Lumio pack (emoji)  →  ic--missing placeholder
 *
 * Pages must never decide which icon, emoji, SVG, or colour to use —
 * only this function knows those details.
 */
function platformIcon(semanticId) {
  const pack = _resolveIconPack();

  // SVG packs: try requested pack artwork first, then fall through to Lumio
  if (pack === 'outline' || pack === 'sketch') {
    const paths = _IC_PATHS[semanticId];
    if (paths) {
      const sw  = pack === 'sketch' ? '2.5' : '2';
      const cls = `ic ic--svg ic--${pack}`;
      return `<span class="${cls}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg></span>`;
    }
    // SVG artwork missing for this ID — fall through to Lumio pack
  }

  // Lumio pack: canonical fallback for all packs
  const emoji = _IC_EMOJI[semanticId];
  if (emoji) {
    return `<span class="ic ic--lumio">${emoji}</span>`;
  }

  // Unknown semantic ID — developer diagnostic; never exposes ID to users
  console.warn('[platformIcon] Unknown semantic ID: "' + semanticId + '". Register it in _IC_EMOJI before use.');
  return `<span class="ic ic--missing" aria-hidden="true"></span>`;
}

/**
 * Development-only validation helper. Run from the browser console:
 *   validateIconRegistry()
 *
 * Checks:
 *   • every ID in _IC_PATHS also exists in _IC_EMOJI (no orphan SVG paths)
 *   • reports which IDs have SVG artwork and which are awaiting artwork
 *
 * No user-facing behaviour. No side effects on the running app.
 */
function validateIconRegistry() {
  const emojiIds = Object.keys(_IC_EMOJI);
  const pathIds  = Object.keys(_IC_PATHS);
  const emojiSet = new Set(emojiIds);
  const pathSet  = new Set(pathIds);
  const errors   = [];
  const warnings = [];

  // Orphan SVG paths: in _IC_PATHS but absent from _IC_EMOJI
  pathIds.forEach(function(id) {
    if (!emojiSet.has(id)) {
      errors.push('Orphan SVG path (no Lumio emoji registered): "' + id + '"');
    }
  });

  // IDs with full artwork (SVG paths present)
  const withArtwork    = emojiIds.filter(function(id) { return pathSet.has(id); });
  // IDs awaiting SVG artwork (Lumio emoji only)
  const awaitingArtwork = emojiIds.filter(function(id) { return !pathSet.has(id); });

  // Pack completeness — cross-reference ICON_PACK_STATUS with actual counts
  var total = emojiIds.length;
  var packReport = {
    lumio:   { count: total, total: total, status: ICON_PACK_STATUS.lumio },
    outline: { count: withArtwork.length, total: total, status: ICON_PACK_STATUS.outline },
    sketch:  { count: withArtwork.length, total: total, status: ICON_PACK_STATUS.sketch },
  };

  console.group('[validateIconRegistry]');
  if (errors.length) {
    console.group('ERRORS (' + errors.length + ')');
    errors.forEach(function(e) { console.error(e); });
    console.groupEnd();
  }
  if (warnings.length) {
    console.group('WARNINGS (' + warnings.length + ')');
    warnings.forEach(function(w) { console.warn(w); });
    console.groupEnd();
  }
  console.info('Total semantic IDs  : ' + total);
  console.info('SVG artwork ready   : ' + withArtwork.length + ' — ' + withArtwork.join(', '));
  console.info('Awaiting SVG artwork: ' + awaitingArtwork.length + ' — ' + awaitingArtwork.join(', '));

  console.group('Pack Completeness');
  Object.keys(packReport).forEach(function(packId) {
    var r = packReport[packId];
    var pct = Math.round((r.count / r.total) * 100);
    var label = r.status === 'COMPLETE'
      ? '✓ COMPLETE'
      : '✗ INCOMPLETE — blocked from release until Artwork Migration sprint completes';
    console.info(packId + ' : ' + r.count + ' / ' + r.total + ' (' + pct + '%) — ' + label);
  });
  console.groupEnd();

  if (errors.length === 0 && warnings.length === 0) {
    console.info('Registry valid — no errors or warnings.');
  }
  console.groupEnd();

  return { errors: errors, warnings: warnings, emojiIds: emojiIds, pathIds: pathIds, withArtwork: withArtwork, awaitingArtwork: awaitingArtwork, packReport: packReport };
}

/**
 * Return the workspace identity object from LumioState, initialising it with
 * Lumio defaults if it has never been set.  This is the ONLY place the default
 * structure is defined — all other code reads from ensureWorkspaceIdentity().
 *
 * LumioState.workspaceIdentity IS the direct singleton object.
 * Wrapping into the Record<id, item> shape the generic API requires is handled
 * internally by cloudSyncWorkspace / _loadCloudWorkspace — consumers are never
 * exposed to that detail.
 *
 * Client code must NEVER write to the `version` field — it is server-managed.
 * applyWorkspaceIdentity() is called after every successful load/sync.
 *
 * Sections are intentionally sparse: Sprint 2 establishes structure only.
 * Future sprints populate each section without schema redesign.
 */
function ensureWorkspaceIdentity() {
  // Guard handles both null (never loaded) and any stale keyed-map shape
  // ({ ws: {...} }) that may have been persisted during Sprint 2 development.
  if (!LumioState.workspaceIdentity || !('theme' in LumioState.workspaceIdentity)) {
    LumioState.workspaceIdentity = {
      // version is server-managed; never incremented by the client.
      // null = not yet persisted to D1; server assigns 1 on first upsert.
      version: null,

      // selectedThemeId tracks which built-in or custom theme is active.
      // 'lumio' is the permanent default and fallback.
      selectedThemeId: 'lumio',

      // theme holds the active token overrides written by selectWorkspaceTheme().
      // Empty object = Lumio built-in defaults from styles.css :root apply.
      theme: {},

      logos: {
        // Populated by a future sprint — R2 asset IDs only, never binary data.
        // { primary: assetId | null, reversed: assetId | null, icon: assetId | null }
      },

      iconPack: {
        // Populated by a future sprint — { packId: string, colour: string }
      },

      settings: {
        // Future workspace-level settings (locale, date format, etc.)
      },

      // Sprint 11: workspace display identity — '' means "not yet set by user".
      name: '',
      shortName: '',
    };
  }
  // selectedThemeId was added in v21; guard against pre-v21 persisted state.
  if (!LumioState.workspaceIdentity.selectedThemeId) {
    LumioState.workspaceIdentity.selectedThemeId = 'lumio';
  }
  // name/shortName added in Sprint 11; guard against pre-Sprint-11 persisted state.
  if (!('name' in LumioState.workspaceIdentity)) LumioState.workspaceIdentity.name = '';
  if (!('shortName' in LumioState.workspaceIdentity)) LumioState.workspaceIdentity.shortName = '';
  // Sprint 16: Appearance Profiles — additive guards only.
  if (!LumioState.workspaceIdentity.activeProfileId) LumioState.workspaceIdentity.activeProfileId = 'default';
  if (!LumioState.workspaceIdentity.profiles)        LumioState.workspaceIdentity.profiles = {};
  return LumioState.workspaceIdentity;
}

/**
 * Resolve the workspace display name.
 *
 * Resolution order:
 *   1. workspaceIdentity.name   (user-set, cloud-synced)
 *   2. getCurrentWorkspace().name  (legacy workspaces[] record)
 *   3. 'My Workspace'           (absolute fallback)
 *
 * THIS IS THE ONLY APPROVED WAY to obtain the workspace name in rendering code.
 * Do not read workspaceIdentity.name directly from any renderer.
 */
function getWorkspaceDisplayName() {
  const identity = ensureWorkspaceIdentity();
  if (identity.name && identity.name.trim()) return identity.name.trim();
  const ws = getCurrentWorkspace();
  if (ws && ws.name && ws.name.trim()) return ws.name.trim();
  return 'My Workspace';
}

/**
 * Resolve the workspace short name.
 *
 * Resolution order:
 *   1. workspaceIdentity.shortName  (user-set, cloud-synced)
 *   2. Derived from getWorkspaceDisplayName() initials (max 3 chars)
 *   3. 'MW'                         (absolute fallback)
 *
 * THIS IS THE ONLY APPROVED WAY to obtain the workspace short name in rendering code.
 * Do not read workspaceIdentity.shortName directly from any renderer.
 */
function getWorkspaceShortName() {
  const identity = ensureWorkspaceIdentity();
  if (identity.shortName && identity.shortName.trim()) return identity.shortName.trim();
  const displayName = getWorkspaceDisplayName();
  const initials = displayName.split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join('');
  return initials.slice(0, 3) || displayName.slice(0, 2).toUpperCase() || 'MW';
}

/**
 * Apply a Workspace Theme by id.
 *
 * This is the ONLY function that may change which theme is active.  It writes
 * the theme's token values into workspaceIdentity.theme and delegates all CSS
 * application to applyWorkspaceIdentity() — no other code path writes --ws-*.
 *
 * Future custom themes will follow the same path: their token values are
 * written to identity.theme and applyWorkspaceIdentity() handles the rest.
 */
function selectWorkspaceTheme(themeId) {
  const identity = ensureWorkspaceIdentity();
  if (themeId === 'custom') {
    // Custom theme: preserve existing identity.theme (user-edited tokens).
    // Seed from Lumio defaults if no custom tokens have been set yet.
    if (!identity.theme || Object.keys(identity.theme).length === 0) {
      const lumioTheme = BUILTIN_THEMES.find(t => t.id === 'lumio') || BUILTIN_THEMES[0];
      identity.theme = { ...lumioTheme.tokens };
    }
    identity.selectedThemeId = 'custom';
    applyWorkspaceIdentity();
    saveLumioState();
    cloudSyncWorkspace('workspaceIdentity');
    return;
  }
  const theme = BUILTIN_THEMES.find(t => t.id === themeId);
  if (!theme) {
    console.warn('[Lumio] Unknown workspace theme id:', themeId);
    return;
  }
  identity.selectedThemeId  = themeId;
  identity.theme            = { ...theme.tokens };
  applyWorkspaceIdentity();
  saveLumioState();
  cloudSyncWorkspace('workspaceIdentity');
}

/**
 * Sprint 16 — Appearance Profiles
 * Switches the active appearance profile.  Copies the selected profile's
 * stored data into the flat workspaceIdentity mirror fields so that every
 * existing consumer (applyWorkspaceIdentity, renderWorkspaceLogo,
 * _resolveIconPack, getWorkspaceDisplayName) continues to read from the same
 * place it always has — zero changes required in any engine function.
 *
 * 'default' is never stored in identity.profiles; it is derived from the
 * Lumio BUILTIN_THEMES entry + empty logos + Lumio icon pack.
 */
function selectAppearanceProfile(profileId) {
  const identity = ensureWorkspaceIdentity();
  let src;
  if (profileId === 'default') {
    const lumioTheme = BUILTIN_THEMES.find(t => t.id === 'lumio') || BUILTIN_THEMES[0];
    src = {
      selectedThemeId: lumioTheme.id,
      theme:    { ...lumioTheme.tokens },
      logos:    {},
      iconPack: { packId: 'lumio' },
      name:     '',
      shortName:'',
    };
  } else {
    const profile = (identity.profiles || {})[profileId];
    if (!profile) { console.warn('[Lumio] Appearance profile not found:', profileId); return; }
    src = {
      selectedThemeId: profile.selectedThemeId || 'lumio',
      theme:    { ...(profile.theme    || {}) },
      logos:    { ...(profile.logos    || {}) },
      iconPack: { ...(profile.iconPack || { packId: 'lumio' }) },
      name:     profile.wsName      || '',
      shortName:profile.wsShortName || '',
    };
  }
  identity.activeProfileId  = profileId;
  identity.selectedThemeId  = src.selectedThemeId;
  identity.theme            = src.theme;
  identity.logos            = src.logos;
  identity.iconPack         = src.iconPack;
  identity.name             = src.name;
  identity.shortName        = src.shortName;
  applyWorkspaceIdentity();
  saveLumioState();
  cloudSyncWorkspace('workspaceIdentity');
}

/**
 * Push all items of a given workspace resource type to D1.
 * No-ops if the user is not authenticated.  Safe to call fire-and-forget;
 * errors are surfaced as a toast but do not propagate to the caller.
 *
 * @param {string} resourceType  key in WORKSPACE_RESOURCES, e.g. 'labelPacks'
 */
async function cloudSyncWorkspace(resourceType) {
  if (!isCloudUser()) return;
  const def = WORKSPACE_RESOURCES[resourceType];
  if (!def) return;

  let items;
  if (def.singleton) {
    const value = LumioState[def.stateKey];
    if (!value || typeof value !== 'object') {
      console.warn('[Lumio] Skipping sync for singleton resource', resourceType, '— no value in state');
      return;
    }
    // Wrap the direct singleton object into the generic keyed-map shape the API expects.
    items = { [WORKSPACE_SINGLETON_KEY]: value };
    // Enforce the singleton contract client-side before sending.
    if (Object.keys(items).length !== 1) {
      console.warn('[Lumio] Singleton resource', resourceType, 'produced unexpected item count — aborting sync');
      return;
    }
  } else {
    items = LumioState[def.stateKey] || {};
  }

  try {
    const serverItems = await LumioAPI.workspace.syncResources(resourceType, items);
    // Merge server metadata (version, updatedAt, etc.) back into local state.
    if (serverItems && typeof serverItems === 'object') {
      if (def.singleton) {
        // Unwrap: server returns { [SINGLETON_KEY]: item } — store the item directly.
        const serverValue = serverItems[WORKSPACE_SINGLETON_KEY];
        if (serverValue) LumioState[def.stateKey] = serverValue;
      } else {
        LumioState[def.stateKey] = serverItems;
      }
      saveLumioState();
    }
  } catch (err) {
    console.warn('[Lumio] Workspace sync failed for', resourceType, err);
    toast('Could not sync workspace resources — ' + (err.message || 'Check your connection'), '⚠️');
  }
}

/**
 * Load all workspace resource types from D1 and merge into LumioState.
 * Called alongside _loadCloudProjects() on login / session restore.
 * Silently no-ops per resource type on network error — local cache is kept.
 */
async function _loadCloudWorkspace() {
  for (const [type, def] of Object.entries(WORKSPACE_RESOURCES)) {
    try {
      const serverItems = await LumioAPI.workspace.getResources(type);
      if (serverItems && typeof serverItems === 'object') {
        if (def.singleton) {
          // Unwrap: server returns { [SINGLETON_KEY]: item } — store the item directly.
          const serverValue = serverItems[WORKSPACE_SINGLETON_KEY];
          if (serverValue) LumioState[def.stateKey] = serverValue;
        } else {
          LumioState[def.stateKey] = serverItems;
        }
      }
    } catch (err) {
      console.warn('[Lumio] Could not load workspace resource', type, err);
    }
  }
  saveLumioState();
}

/* ── WORKSPACE THEME ENGINE ──────────────────────────────────────────────────
 *
 * applyWorkspaceIdentity() is the ONLY function that may write --ws-* CSS
 * custom properties.  All Workspace Identity tokens are applied atomically
 * via a single <style id="__lumio-ws-identity"> block scoped to :root.
 *
 * Separation contract:
 *   • This function reads ONLY LumioState.workspaceIdentity.theme
 *   • It NEVER reads course data or --theme-* tokens
 *   • applyThemeVars() NEVER reads workspaceIdentity
 *   • Learner containers (#lesson-canvas etc.) are never touched here
 *
 * When theme values are absent (identity null or theme empty), the style
 * block is cleared and the :root defaults defined in styles.css take over.
 * The Platform Shell is always fully functional regardless of identity state.
 *
 * Lifecycle: call after loadLumioState() and after _loadCloudWorkspace().
 * Future callers of cloudSyncWorkspace('workspaceIdentity') must also call
 * applyWorkspaceIdentity() after the sync resolves.
 */
function applyWorkspaceIdentity() {
  const identity = LumioState.workspaceIdentity;
  const theme    = (identity && typeof identity.theme === 'object') ? identity.theme : {};

  // Ordered map of --ws-* token → theme key.  All 13 tokens are covered.
  // Only tokens with non-empty values are emitted; absent tokens fall through
  // to the :root defaults in styles.css (e.g. --ws-primary: var(--violet)).
  const TOKEN_MAP = [
    ['--ws-primary',     theme.primary    ],
    ['--ws-secondary',   theme.secondary  ],
    ['--ws-accent',      theme.accent     ],
    ['--ws-surface',     theme.surface    ],
    ['--ws-surface-alt', theme.surfaceAlt ],
    ['--ws-border',      theme.border     ],
    ['--ws-text',        theme.text       ],
    ['--ws-text-muted',  theme.textMuted  ],
    ['--ws-icon',        theme.icon       ],
    ['--ws-shadow',      theme.shadow     ],
    ['--ws-radius',      theme.radius     ],
    ['--ws-sidebar-bg',  theme.sidebarBg  ],
    ['--ws-topbar-bg',   theme.topbarBg   ],
  ];

  const declarations = TOKEN_MAP
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

  let sheet = document.getElementById('__lumio-ws-identity');
  if (!sheet) {
    sheet = document.createElement('style');
    sheet.id = '__lumio-ws-identity';
    document.head.appendChild(sheet);
  }

  // Atomic: every token written in a single textContent assignment.
  // Platform Shell never exists in an intermediate visual state.
  sheet.textContent = declarations ? `:root {\n${declarations}\n}` : '';
}

/**
 * Fetch course + lessons for a project from D1 and populate the in-memory cache.
 * Called by openProject() when a cloud project's course hasn't been loaded yet.
 *
 * @param {string} id  — project id
 */
async function _cloudLoadCourse(id) {
  try {
    const full = await LumioAPI.projects.get(id);
    if (full && full.course) {
      LumioState.courses[id] = _cloudCourseToState(full.course);
      Object.assign(LumioState.lessons, full.lessons || {});
    }
  } catch (err) {
    console.warn('[Lumio] Could not load course from cloud for project', id, err);
  }
}

/**
 * Build the body for POST /projects or PUT /projects/:id from a project +
 * its course and lesson content that currently live in LumioState.
 *
 * @param {object} p  — project entry from LumioState.projects
 * @returns {{ project, course, lessons }}
 */
function _buildCloudPayload(p) {
  const course = LumioState.courses[p.id] || null;
  const lessonsMap = {};
  if (course) {
    [...(course.lessons || []), ...(course.assessments || [])].forEach(function (l) {
      lessonsMap[l.id] = LumioState.lessons[l.id] || [];
    });
  }
  // Resolve folder metadata so the Worker can upsert it before referencing it
  // via the FK constraint on projects.folder_id → folders.id.
  // folderId is derived from folderObj (not p.folder directly) so that a stale
  // reference to a locally-deleted folder never reaches the Worker as a non-null
  // folderId without a corresponding folder row to satisfy the FK.
  const folderObj = p.folder
    ? (LumioState.folders || []).find(function (f) { return f.id === p.folder; }) || null
    : null;
  return {
    id:       p.id,          // client-assigned; server uses it if provided
    title:    p.title,
    type:     p.type,
    status:   p.status,
    health:   p.health,
    folderId: folderObj ? folderObj.id : null,
    folder:   folderObj ? { id: folderObj.id, name: folderObj.name, color: folderObj.color || 'purple' } : null,
    course:   course,
    lessons:  lessonsMap,
  };
}

/**
 * Persist a single project (+ its course and lessons) to D1.
 * Uses POST for new projects, PUT for ones that are already cloud-backed.
 * Always silently no-ops when the user is not cloud-authenticated.
 *
 * @param {string} id  — project id
 */
async function cloudPersistProject(id) {
  if (!isCloudUser()) return;
  const p = LumioState.projects.find(function (x) { return x.id === id; });
  if (!p || p.deleted) return;

  const payload = _buildCloudPayload(p);

  try {
    if (p._cloud) {
      await LumioAPI.projects.update(id, {
        project: {
          title:          payload.title,
          status:         payload.status,
          health:         payload.health,
          folderId:       payload.folderId,
          lastAccessedAt: p.lastAccessed || Date.now(),
          labelSet:       (LumioState.courses[id] || {}).labelSet || null,
        },
        folder:  payload.folder,
        course:  payload.course,
        lessons: payload.lessons,
      });
    } else {
      await LumioAPI.projects.create(payload);
      p._cloud = true;
    }
    saveLumioState();
  } catch (err) {
    const msg = err && err.message
      ? err.message
      : (err && err.status ? 'Server error ' + err.status : 'Check your connection');
    console.warn('[Lumio] Cloud persist failed for project', id, 'status:', err && err.status, 'code:', err && err.code, 'msg:', msg, err);
    toast('Could not save to cloud — ' + msg, '⚠️');
    return; // don't attempt asset sync if project save failed
  }

  // Upload any locally-stored assets that haven't been synced to R2 yet.
  // Fire-and-forget — asset sync failure does not roll back the project save.
  const course  = LumioState.courses[id];
  const lessons = payload.lessons;
  const refs    = _collectProjectAssetRefs(course, Object.values(lessons || {}));
  _cloudSyncAssets(id, refs).catch(function (err) {
    console.warn('[Lumio] Asset sync failed for project', id, err);
  });
}

/**
 * Upload all locally-stored asset blobs for a project to R2/D1.
 * Assets already in R2 are skipped (D1 insert uses INSERT OR IGNORE).
 * Failures for individual assets are logged but do not abort the batch.
 *
 * @param {string}   courseId
 * @param {string[]} assetRefs  — array of "asset://..." IDs
 */
async function _cloudSyncAssets(courseId, assetRefs) {
  if (!isCloudUser() || !assetRefs || assetRefs.length === 0) return;
  for (var i = 0; i < assetRefs.length; i++) {
    var assetId = assetRefs[i];
    try {
      var asset = await AssetStore.get(assetId);
      if (!asset) continue; // not in local store — skip (will be fetched from cloud on demand)
      var file = new File([asset.blob], asset.fileName || 'asset', { type: asset.mimeType });
      await LumioAPI.assets.upload(assetId, file, courseId);
    } catch (err) {
      console.warn('[Lumio] Cloud asset upload failed for', assetId, err);
    }
  }
}

/**
 * Soft-delete a project in D1 when the user moves it to Trash.
 * No-ops silently for non-cloud projects or unauthenticated users.
 *
 * @param {string} id  — project id
 */
async function cloudDeleteProject(id) {
  if (!isCloudUser()) return;
  const p = LumioState.projects.find(function (x) { return x.id === id; });
  if (!p || !p._cloud) return;
  try {
    await LumioAPI.projects.delete(id);
  } catch (err) {
    console.warn('[Lumio] Cloud delete failed for project', id, err);
  }
}

/* ---------------- EXPORT / IMPORT ENGINE ---------------- */
const LUMIO_FILE_VERSION = 1;    // project.json schema version (unchanged)
const LUMIO_PACKAGE_VERSION = 2; // .lumio container format version

// Maps MIME type to a short file extension used for asset filenames inside the ZIP.
function _mimeToExt(mime) {
  const map = {
    'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif',
    'audio/mpeg':'mp3','audio/mp3':'mp3','audio/ogg':'ogg','audio/wav':'wav','audio/mp4':'m4a',
    'video/mp4':'mp4','video/webm':'webm','video/ogg':'ogv',
    'application/pdf':'pdf',
  };
  return map[(mime || '').toLowerCase()] || 'bin';
}

// Scans all media fields in a course + lessons snapshot and returns every
// asset:// reference found. Mirrors the field coverage in AssetStore.preloadBlocks.
function _collectProjectAssetRefs(course, lessons) {
  const refs = new Set();
  function collect(val) { if (AssetStore.isAssetRef(val)) refs.add(val); }

  if (course) {
    collect((course.heroImage || {}).src);
    collect((course.heroImage || {})._thumbSrc);
    collect((course.thumbnailImage || {}).src);
  }

  Object.values(lessons || {}).forEach(blocks => {
    (Array.isArray(blocks) ? blocks : []).forEach(block => {
      const d = block.data || {}, ds = block.design || {};
      collect(d.src); collect(d.imageUrl); collect(d.image);
      collect(d.background); collect(d.avatar); collect(ds.bgImage); collect(ds.iconImage);
      for (const it of (d.items || [])) {
        collect(it.src); collect(it.imageUrl); collect(it.image);
        collect(it.audio); collect(it.video); collect(it.file);
        const f = it.front || {}, b = it.back || {};
        collect(f.image); collect(f.audio); collect(f.video);
        collect(b.image); collect(b.audio); collect(b.video);
      }
      for (const q of (d.quotes || [])) collect(q.avatar);
      for (const sc of (d.scenes || [])) {
        collect(sc.backgroundImage); collect(sc.backgroundVideo);
        collect(sc.backgroundAudio); collect(sc.characterImage);
      }
      for (const h of (d.hotspots || [])) {
        collect(h.image); collect(h.audio); collect(h.video); collect(h.file);
      }
    });
  });

  return [...refs];
}

async function exportProject(id) {
  const p = LumioState.projects.find(x => x.id === id);
  if (!p) return;

  const course = LumioState.courses[id] ? JSON.parse(JSON.stringify(LumioState.courses[id])) : null;
  const lessonIds = course ? (course.lessons || []).map(l => l.id) : [];
  const assessmentIds = course ? (course.assessments || []).map(a => a.id) : [];
  const lessons = {};
  [...lessonIds, ...assessmentIds].forEach(lid => {
    if (LumioState.lessons[lid]) lessons[lid] = JSON.parse(JSON.stringify(LumioState.lessons[lid]));
  });

  // Collect and fetch all referenced assets.
  // resolveUrl() fetches from R2 and caches in IndexedDB on miss — this
  // ensures cross-device exports include assets the local device hasn't yet
  // downloaded. exportAll() then reads from IndexedDB (now warm).
  const assetRefs = _collectProjectAssetRefs(course, lessons);
  for (const ref of assetRefs) { await AssetStore.resolveUrl(ref); }
  const assetEntries = await AssetStore.exportAll(assetRefs);

  // Build asset manifest entries (id → path inside ZIP)
  const assetManifest = assetEntries.map(a => ({
    id: a.id,
    file: `assets/${a.id.replace('asset://', '')}.${_mimeToExt(a.mimeType)}`,
    mimeType: a.mimeType,
    fileName: a.fileName,
    size: a.size,
  }));

  const zip = new JSZip();

  zip.file('manifest.json', JSON.stringify({
    packageVersion: LUMIO_PACKAGE_VERSION,
    exportedAt: Date.now(),
    projectId: p.id,
    assetCount: assetEntries.length,
    assets: assetManifest,
  }, null, 2));

  zip.file('project.json', JSON.stringify({
    lumioFile: LUMIO_FILE_VERSION,
    exportedAt: Date.now(),
    project: JSON.parse(JSON.stringify(p)),
    course,
    lessons,
  }, null, 2));

  const idToMeta = Object.fromEntries(assetManifest.map(m => [m.id, m]));
  for (const a of assetEntries) {
    zip.file(idToMeta[a.id].file, a.blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const url = URL.createObjectURL(zipBlob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = (p.title || 'project').replace(/[^a-z0-9 _-]/gi, '_') + '.lumio';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  toast(`"${p.title}" exported (${assetEntries.length} asset${assetEntries.length !== 1 ? 's' : ''})`, '📦');
}

function importProject(file) {
  const name = (file.name || '').toLowerCase();
  if (!name.endsWith('.lumio')) {
    const unsupported = ['.zip','.story','.scorm','.xapi'].some(ext => name.endsWith(ext));
    toast(unsupported
      ? 'Unsupported format — Lumio only imports .lumio backup files'
      : 'Unrecognised file — please choose a .lumio backup file', '⚠️');
    return;
  }

  // Detect v2 ZIP (magic bytes PK\x03\x04) vs v1 plain JSON
  const headReader = new FileReader();
  headReader.onload = async (e) => {
    const bytes = new Uint8Array(e.target.result);
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
    if (isZip) {
      await _importProjectV2(file);
    } else {
      _importProjectV1(file);
    }
  };
  headReader.readAsArrayBuffer(file.slice(0, 4));
}

async function _importProjectV2(file) {
  try {
    const zip = await JSZip.loadAsync(file);

    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) { toast('Invalid .lumio file — missing manifest', '⚠️'); return; }
    const manifest = JSON.parse(await manifestFile.async('text'));
    if (manifest.packageVersion !== LUMIO_PACKAGE_VERSION) {
      toast('Unsupported package version — please use a newer version of Lumio', '⚠️'); return;
    }

    const projectFile = zip.file('project.json');
    if (!projectFile) { toast('Invalid .lumio file — missing project data', '⚠️'); return; }
    const payload = JSON.parse(await projectFile.async('text'));
    if (!payload.project) { toast('Invalid .lumio file — corrupt project data', '⚠️'); return; }

    // Restore assets into AssetStore before restoring project data
    const assetEntries = [];
    for (const meta of (manifest.assets || [])) {
      const assetFile = zip.file(meta.file);
      if (!assetFile) continue;
      const buf = await assetFile.async('arraybuffer');
      const blob = new Blob([buf], { type: meta.mimeType || 'application/octet-stream' });
      assetEntries.push({ id: meta.id, blob, mimeType: meta.mimeType, fileName: meta.fileName, size: meta.size });
    }
    if (assetEntries.length > 0) await AssetStore.importAll(assetEntries);

    _restoreProjectPayload(payload);
  } catch (err) {
    console.error('Lumio v2 import error', err);
    toast('Could not import file — it may be corrupt', '⚠️');
  }
}

function _importProjectV1(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const payload = JSON.parse(e.target.result);
      if (!payload.lumioFile || !payload.project) {
        toast('Invalid .lumio file — file may be corrupt or from an incompatible version', '⚠️');
        return;
      }
      _restoreProjectPayload(payload);
    } catch (err) {
      console.error('Lumio v1 import error', err);
      toast('Could not import file — it may be corrupt', '⚠️');
    }
  };
  reader.readAsText(file);
}

function _restoreProjectPayload(payload) {
  const idMap = {};
  const remap = (oldId, prefix) => {
    if (!idMap[oldId]) idMap[oldId] = generateUniqueId(prefix);
    return idMap[oldId];
  };

  const p = JSON.parse(JSON.stringify(payload.project));
  p.id = remap(p.id, 'p');
  p.title = (p.title || 'Imported Project') + ' (Imported)';
  p.lastAccessed = Date.now();
  p.deleted = false;
  p.deletedAt = null;
  p.ownerId = getCurrentUser()?.id;
  p.sharedWith = [];
  p.sharedScope = null;
  p.sharedPermission = 'view';

  let course = null;
  if (payload.course) {
    course = JSON.parse(JSON.stringify(payload.course));
    course.id = p.id;
    course.title = p.title;
    (course.lessons || []).forEach(l => { l.id = remap(l.id, 'l'); });
    (course.assessments || []).forEach(a => { a.id = remap(a.id, 'a'); });
  }

  const lessons = {};
  Object.entries(payload.lessons || {}).forEach(([oldId, blocks]) => {
    const newId = idMap[oldId] || remap(oldId, 'l');
    lessons[newId] = JSON.parse(JSON.stringify(blocks));
  });

  LumioState.projects.unshift(p);
  if (course) LumioState.courses[p.id] = course;
  Object.assign(LumioState.lessons, lessons);
  saveLumioState();
  renderProjects();
  toast(`"${payload.project.title}" imported`, '📥');
  // Persist to D1 asynchronously — failure is non-fatal (localStorage remains the fallback).
  cloudPersistProject(p.id);
}

/* ---------------- ROUTER ---------------- */
function navigate(hash) {
  if (location.hash === hash) { render(); }
  else { location.hash = hash; }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', async () => {
  const restoredHash = loadLumioState();
  ensureStableBlockIdentity();
  ensureSaasFoundation();
  // Apply persisted Workspace Identity immediately so the first paint reflects
  // any previously loaded identity (avoids a flash of default brand on reload).
  applyWorkspaceIdentity();

  // Restore server-managed session first. If a valid cookie exists, the server
  // returns the full auth context and we populate LumioSession — the user
  // never sees the login screen again. A 401 (no session, expired, revoked)
  // is expected and handled silently; any other error (network failure, 5xx)
  // falls through the same path (send to login) rather than crashing.
  let sessionValid = false;
  if (!LearnerUI.publishedMode) {
    try {
      const data = await LumioAPI.auth.session();
      LumioSession.set(data);
      sessionValid = true;
      // Wire cloud adapter so AssetStore.resolveUrl() can fetch from R2 on
      // devices that don't have the asset in IndexedDB yet.
      AssetStore.setCloudAdapter({
        download: function (assetId) { return LumioAPI.assets.getBlob(assetId); },
      });
      // Replace localStorage project cache with D1 source of truth.
      // Awaited before render() so the first paint shows cloud projects and
      // workspace resources (label packs, etc.).
      await Promise.all([_loadCloudProjects(), _loadCloudWorkspace()]);
      // Re-apply after cloud load — server values take precedence over the
      // persisted snapshot applied at startup above.
      applyWorkspaceIdentity();
    } catch (_e) {
      // 401 = no active session; any other error = treat as unauthenticated.
      LumioSession.clear();
      // If no server session, fall back to checking the legacy localStorage
      // session (prototype demo users who haven't yet signed in via the real
      // backend). This keeps the existing prototype experience intact.
      sessionValid = LumioAuth.restoreSession();
    }
  }

  // Published/exported packages (see the LearnerUI.publishedMode check in
  // render() above) are a single self-contained learner runtime with no
  // login concept at all — forcing #/login here would stomp whatever hash
  // the bootstrap/learner navigation already set before this handler runs.
  if (!LearnerUI.publishedMode) {
    if (sessionValid && restoredHash) location.hash = restoredHash;
    else if (sessionValid && !location.hash) location.hash = '#/projects';
    else location.hash = '#/login'; // no valid session
  }
  render();
  BlockMigration.validateAllLessons();

  // Re-render mutates #app's contents; treat that as a signal that state may
  // have changed and persist it (covers project/lesson/theme/assessment edits
  // made via any screen, without needing per-action save calls).
  new MutationObserver(scheduleLumioSave)
    .observe(document.getElementById('app'), { childList: true, subtree: false });

  // Catches edits to inputs/textareas/selects that update state without
  // triggering a re-render (e.g. lesson content fields, title inputs).
  document.addEventListener('input', scheduleLumioSave, true);
  document.addEventListener('change', scheduleLumioSave, true);
});

window.addEventListener('beforeunload', saveLumioState);

/* ---------------- HELPERS ---------------- */
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Keeps the Projects-list entry for a course in sync with edits made on the
// Course Landing / Course Details page (title, last-edited timestamp), so
// Project cards and Continue Working reflect changes immediately.
function syncProjectFromCourse(courseId) {
  const p = LumioState.projects.find(x => x.id === courseId);
  if (!p) return;
  const course = LumioState.courses[courseId];
  if (course && course.title) p.title = course.title;
  p.lastAccessed = Date.now();
}

// Single source of truth for a project's display title: if a course object
// exists for this project, its title wins (Course Landing / Course Details
// is the canonical editor for the title). Falls back to project.title for
// projects that have never been opened (no course object created yet).
function projectDisplayTitle(p) {
  const course = LumioState.courses && LumioState.courses[p.id];
  return (course && course.title) || p.title;
}

// Generic "leave this page?" confirmation modal. Calls onConfirm() if the
// user confirms; does nothing (just closes) on cancel.
function confirmLeaveModal(message, onConfirm) {
  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:420px; max-width:90vw; padding:24px;">
        <h3 style="font-size:16px;">Leave this page?</h3>
        <p class="text-sm text-muted mt-8">${message}</p>
        <div class="flex gap-12 mt-24" style="justify-content:flex-end;">
          <button class="btn btn-secondary btn-sm" id="confirm-leave-cancel">Cancel</button>
          <button class="btn btn-primary btn-sm" id="confirm-leave-go">Leave</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  overlay.querySelector('#confirm-leave-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#confirm-leave-go').addEventListener('click', () => { overlay.remove(); onConfirm(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

/* ── NotifySystem ─────────────────────────────────────────────
   Unified notification engine for Sprint 9.
   API:
     NotifySystem.notify(opts)              → id
     NotifySystem.progress(msg, opts)       → id
     NotifySystem.updateProgress(id, pct, msg?)
     NotifySystem.complete(id, msg, type?)
     NotifySystem.dismiss(id)
   opts: { message, type, icon, detail, duration, actions, projectId, persist }
   ──────────────────────────────────────────────────────────── */
const NotifySystem = (() => {
  const _TYPE_META = {
    success:  { iconId: 'success',       duration: 3500 },
    info:     { iconId: 'info',          duration: 4000 },
    warning:  { iconId: 'warning',       duration: 6000 },
    error:    { iconId: 'error',         duration: null  },
    ai:       { iconId: 'ai',            duration: 4000 },
    export:   { iconId: 'export-pack',   duration: 4000 },
    publish:  { iconId: 'publish',       duration: 4000 },
    system:   { iconId: 'notifications', duration: 4000 },
    review:   { iconId: 'review',        duration: 4000 },
    progress: { iconId: 'progress',      duration: null  },
  };

  // Which types persist to the notification centre
  const _PERSIST_TYPES = new Set(['error', 'publish', 'export', 'ai', 'review', 'system']);

  // Infer type from legacy icon emoji
  const _ICON_TYPE = {
    '✅': 'success', '🎉': 'success', '✔️': 'success', '💾': 'success',
    '❌': 'error',
    '⚠️': 'warning',
    '✨': 'ai',
    '📄': 'export', '📦': 'export', '📤': 'publish',
    '⧉': 'info',
  };

  const _active = new Map(); // id → { el, timer, opts }
  const _queue  = [];
  const MAX_VISIBLE = 5;

  function _stack() {
    let c = document.getElementById('notify-stack');
    if (!c) {
      c = document.createElement('div');
      c.id = 'notify-stack';
      c.setAttribute('aria-live', 'polite');
      c.setAttribute('aria-atomic', 'false');
      document.body.appendChild(c);
    }
    return c;
  }

  function _refreshBadge() {
    const count = myUnreadNotificationCount();
    const bell  = document.querySelector('#notif-bell-trigger');
    if (!bell) return;
    let badge = bell.querySelector('.pill');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'pill pill-magenta';
        badge.style.cssText = 'margin-left:auto; min-width:20px; text-align:center; padding:2px 6px;';
        bell.appendChild(badge);
      }
      badge.textContent = count;
    } else {
      badge?.remove();
    }
  }

  function _persist(opts, type) {
    const uid = getCurrentUser()?.id;
    if (!uid) return;
    if (!Array.isArray(LumioState.notifications)) LumioState.notifications = [];
    const meta = _TYPE_META[type] || _TYPE_META.info;
    LumioState.notifications.unshift({
      id: generateUniqueId('n'), userId: uid,
      message: opts.message,
      detail: opts.detail || null,
      icon: opts.icon || null,
      iconId: meta.iconId,
      type,
      projectId: opts.projectId || null,
      dest: opts.dest || null,
      createdAt: Date.now(), read: false,
    });
    scheduleLumioSave();
    _refreshBadge();
  }

  function _leave(id) {
    const entry = _active.get(id);
    if (!entry) return;
    const { el, timer } = entry;
    if (timer) clearTimeout(timer);
    el.classList.add('notify-leaving');
    el.addEventListener('animationend', () => {
      el.remove();
      _active.delete(id);
      _processQueue();
    }, { once: true });
  }

  function _processQueue() {
    while (_active.size < MAX_VISIBLE && _queue.length > 0) {
      const next = _queue.shift();
      _render(next.id, next.opts);
    }
  }

  function _render(id, opts) {
    const type     = opts.type || 'info';
    const meta     = _TYPE_META[type] || _TYPE_META.info;
    const iconHtml = opts.icon !== undefined ? opts.icon : platformIcon(meta.iconId);
    const dur      = opts.duration !== undefined ? opts.duration : meta.duration;
    const isErr = type === 'error';

    const div = document.createElement('div');
    div.className = `notify-item notify-${type}`;
    div.dataset.notifyId = id;
    if (isErr) div.setAttribute('role', 'alert');

    const actionsHtml = (opts.actions || []).map((a, i) =>
      `<button class="notify-action" data-action-idx="${i}">${escapeHtml(a.label)}</button>`
    ).join('');

    div.innerHTML = `
      ${iconHtml ? `<span class="notify-icon">${iconHtml}</span>` : ''}
      <div class="notify-body">
        <span class="notify-msg">${escapeHtml(opts.message)}</span>
        ${opts.detail ? `<span class="notify-detail">${escapeHtml(opts.detail)}</span>` : ''}
        ${type === 'progress' ? '<div class="notify-progress-bar"><div class="notify-progress-fill"></div></div>' : ''}
        ${actionsHtml}
      </div>
      ${dur === null ? '<button class="notify-close" aria-label="Dismiss">×</button>' : ''}
    `;

    (opts.actions || []).forEach((action, i) => {
      div.querySelector(`[data-action-idx="${i}"]`)?.addEventListener('click', () => {
        action.onClick();
        _leave(id);
      });
    });
    div.querySelector('.notify-close')?.addEventListener('click', () => _leave(id));

    _stack().appendChild(div);

    let timer = null;
    if (dur !== null) timer = setTimeout(() => _leave(id), dur);
    _active.set(id, { el: div, timer, opts });

    if (opts.persist !== false && _PERSIST_TYPES.has(type)) _persist(opts, type);
  }

  function notify(opts) {
    const id = generateUniqueId('ntf');
    if (_active.size >= MAX_VISIBLE) {
      _queue.push({ id, opts });
    } else {
      _render(id, opts);
    }
    return id;
  }

  function progress(msg, opts = {}) {
    return notify({ ...opts, message: msg, type: 'progress', duration: null });
  }

  function updateProgress(id, pct, msg) {
    const entry = _active.get(id);
    if (!entry) return;
    const fill = entry.el.querySelector('.notify-progress-fill');
    if (fill) fill.style.width = `${Math.min(100, pct)}%`;
    if (msg) {
      const msgEl = entry.el.querySelector('.notify-msg');
      if (msgEl) msgEl.textContent = msg;
    }
  }

  function complete(id, msg, type = 'success') {
    const entry = _active.get(id);
    if (!entry) return;
    const { el, timer, opts } = entry;
    if (timer) clearTimeout(timer);

    el.className = `notify-item notify-${type}`;
    const meta = _TYPE_META[type] || _TYPE_META.success;
    const newIconHtml = platformIcon(meta.iconId);

    const iconEl = el.querySelector('.notify-icon');
    if (iconEl) iconEl.innerHTML = newIconHtml;

    const msgEl = el.querySelector('.notify-msg');
    if (msgEl) msgEl.textContent = msg || opts.message;

    el.querySelector('.notify-progress-bar')?.remove();
    if (!el.querySelector('.notify-close')) {
      const btn = document.createElement('button');
      btn.className = 'notify-close';
      btn.setAttribute('aria-label', 'Dismiss');
      btn.textContent = '×';
      btn.addEventListener('click', () => _leave(id));
      el.appendChild(btn);
    }

    const newDur = meta.duration;
    if (newDur !== null) {
      entry.timer = setTimeout(() => _leave(id), newDur);
    }
    if (_PERSIST_TYPES.has(type)) {
      _persist({ message: msg || opts.message, projectId: opts.projectId, dest: opts.dest }, type);
    }
  }

  function dismiss(id) { _leave(id); }

  function toast(msg, icon) {
    const type = _ICON_TYPE[icon] || 'info';
    return notify({ message: msg, type, icon: icon || undefined });
  }

  return { notify, progress, updateProgress, complete, dismiss, toast };
})();

// Backward-compatible global — all 93 existing call sites unchanged
function toast(msg, icon) { return NotifySystem.toast(msg, icon); }

// Scopes course theme CSS variables ONLY to course content containers
// (#lesson-canvas, .lumio-learner-root, .course-landing-root) via a
// dedicated <style> block in <head>.  The #app element is never touched, so
// platform chrome (nav, buttons, cards, dialogs) always inherits the
// immutable :root platform defaults — the core architectural invariant.
// Pass null/undefined to clear the sheet when navigating to non-course pages.
function applyThemeVars(course) {
  let sheet = document.getElementById('__lumio-course-theme');
  if (!sheet) {
    sheet = document.createElement('style');
    sheet.id = '__lumio-course-theme';
    document.head.appendChild(sheet);
  }
  if (course) {
    ensureCourseDesign(course);
    const vars = themeVarStyle(course.themeDesign);
    sheet.textContent =
      `#lesson-canvas, .lumio-learner-root, .course-landing-root { ${vars} }`;
  } else {
    sheet.textContent = '';
  }
}

function ambientBlobs(colors) {
  colors = colors || [
    ['var(--pastel-lavender)', '420px', '420px', '-120px', '-100px'],
    ['var(--pastel-cyan)', '360px', '360px', 'auto', '-80px', '0', 'auto'],
    ['var(--pastel-pink)', '300px', '300px', '60%', 'auto', 'auto', '10%'],
  ];
  let html = '<div class="ambient-bg">';
  colors.forEach(c => {
    html += `<div class="blob" style="background:${c[0]};width:${c[1]};height:${c[2]};
      ${c[3] ? `top:${c[3]};` : ''}${c[4] ? `right:${c[4]};` : ''}${c[5] ? `bottom:${c[5]};` : ''}${c[6] ? `left:${c[6]};` : ''}"></div>`;
  });
  html += '</div>';
  return html;
}

/* ---------------- APP SHELL ---------------- */
const NAV_ITEMS = [
  { id: 'projects', label: 'Projects', iconId: 'projects', hash: '#/projects' },
  { id: 'hub', label: 'ID Academy', iconId: 'hub', hash: '#/hub' },
];

function renderShell(activeId, contentHtml, opts = {}) {
  document.title = getWorkspaceDisplayName() + ' • Lumio';
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-shell">
      <aside class="app-sidebar">
        <div class="sidebar-logo" data-nav="#/welcome" style="${opts.largeLogo ? 'justify-content:center; padding:24px 10px;' : ''} cursor:pointer;">
          ${opts.largeLogo
            ? renderWorkspaceLogo(LOGO_SLOTS.SIDEBAR_LARGE)
            : `${renderWorkspaceLogo(LOGO_SLOTS.SIDEBAR)}<span>${escapeHtml(getWorkspaceDisplayName())}</span>`}
        </div>
        ${NAV_ITEMS.map(item => `
          <div class="nav-item ${item.id === activeId ? 'active' : ''}" data-nav="${item.hash}">
            ${platformIcon(item.iconId)}
            <span>${item.label}</span>
          </div>
        `).join('')}
        <div class="nav-section-label">Workspace</div>
        <div class="nav-item ${activeId === 'recent' ? 'active' : ''}" data-nav="#/recent">
          ${platformIcon('recent')}<span>Recent</span>
        </div>
        <div class="nav-item ${activeId === 'trash' ? 'active' : ''}" data-nav="#/trash">
          ${platformIcon('delete')}<span>Trash</span>
        </div>
        ${canAccessWorkspaceSettings() ? `
        <div class="nav-item ${activeId === 'workspace-settings' ? 'active' : ''}" data-nav="#/workspace-settings">
          ${platformIcon('settings')}<span>Workspace Settings</span>
        </div>
        ` : ''}
        <div style="flex:1"></div>
        <div class="nav-item" id="notif-bell-trigger" style="position:relative;">
          ${platformIcon('notifications')}<span>Notifications</span>
          ${myUnreadNotificationCount() > 0 ? `<span class="pill pill-magenta" style="margin-left:auto; min-width:20px; text-align:center; padding:2px 6px;">${myUnreadNotificationCount()}</span>` : ''}
        </div>
        <div class="nav-item" data-nav="#/login">
          ${platformIcon('sign-out')}<span>Sign out</span>
        </div>
        <div class="nav-item ${activeId === 'profile' ? 'active' : ''}" data-nav="#/profile" style="border-top:1px solid var(--border); margin-top:8px; border-radius:0;">
          ${avatarHtml(getCurrentUser() || {})}
          <div style="font-size:13px; min-width:0;">
            <div style="font-weight:600; color:var(--ink-900); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${currentUserDisplayName()}</div>
            <div class="text-muted" style="font-size:12px;">${CANONICAL_ROLE_LABELS[getCurrentUser()?.role] || ''}</div>
          </div>
        </div>
      </aside>
      <div class="app-main">
        ${contentHtml}
      </div>
    </div>
  `;
  app.querySelectorAll('[data-nav]').forEach(elx => {
    elx.addEventListener('click', () => {
      // Close any open modal (e.g. Course Settings) before navigating away.
      document.querySelectorAll('.overlay').forEach(o => o.remove());
      if (elx.dataset.nav === '#/login') {
        // Revoke the server session + clear the cookie (fire-and-forget — the
        // navigate() below sends the user to #/login immediately regardless of
        // whether the server call resolves, so the user never waits on it).
        LumioAPI.auth.logout().catch(function () {});
        LumioSession.clear();
        AssetStore.setCloudAdapter(null); // clear cloud adapter on logout
        LumioAuth.logout(); // also clear any legacy localStorage session
      }
      navigate(elx.dataset.nav);
    });
  });

  app.querySelector('#notif-bell-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openNotificationsPanel(e.currentTarget);
  });
}

// Resolves a notification `dest` object into a full navigation action.
// Navigates to the target route then executes any deferred secondary action
// (open modal, select block, etc.) after the render cycle settles.
function _navTo(dest) {
  if (!dest) return;
  const route = dest.route || 'projects';

  if (route === 'workspace-settings') {
    navigate('#/workspace-settings');
    return;
  }
  if (route === 'projects') {
    navigate('#/projects');
    return;
  }
  if (route === 'course' && dest.courseId) {
    LumioState.currentCourseId = dest.courseId;
    navigate('#/course/' + dest.courseId);
    if (dest.openPublish) {
      // Wait for renderCourseLanding to paint before clicking Publish
      setTimeout(() => {
        document.querySelector('#course-publish')?.click();
      }, 200);
    }
    return;
  }
  if (route === 'lesson' && dest.lessonId) {
    LumioState.currentLessonId = dest.lessonId;
    navigate('#/lesson/' + dest.lessonId);
    if (dest.blockIndex !== undefined && dest.blockIndex !== null) {
      setTimeout(() => {
        // Select the target block and re-render with it focused
        if (typeof BuilderUI !== 'undefined') {
          BuilderUI.selected = dest.blockIndex;
          BuilderUI.expandedBlocks = new Set([dest.blockIndex]);
          BuilderUI.rightTab = dest.rightTab || 'content';
          renderLessonBuilder(dest.lessonId);
          setTimeout(() => {
            document.querySelector(`.canvas-block[data-index="${dest.blockIndex}"]`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 80);
        }
      }, 200);
    }
    return;
  }
}

// Notification centre — slide-in panel, per-item read marking.
// Replaces the old popover approach (Sprint 9).
function openNotificationsPanel() {
  if (document.querySelector('.notif-centre')) return;

  const _TYPE_ICON_IDS = {
    review: 'review', error: 'error', warning: 'warning', success: 'success',
    ai: 'ai', export: 'export-pack', publish: 'publish', system: 'notifications', info: 'info',
  };

  function _timeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7)  return `${d}d ago`;
    return formatDateLong(ts);
  }

  const TABS = [
    { id: 'all',    label: 'All' },
    { id: 'review', label: 'Review' },
    { id: 'export', label: 'Exports' },
    { id: 'system', label: 'System' },
  ];

  let activeTab = 'all';

  function _filtered() {
    const all = myNotifications();
    if (activeTab === 'all')    return all;
    if (activeTab === 'export') return all.filter(n => n.type === 'export' || n.type === 'publish');
    if (activeTab === 'system') return all.filter(n => n.type === 'system' || n.type === 'error' || n.type === 'ai');
    return all.filter(n => (n.type || 'review') === activeTab);
  }

  function _renderList(list$) {
    const items = _filtered();
    if (!items.length) {
      list$.innerHTML = `<div class="notif-centre-empty">No notifications here yet.</div>`;
      return;
    }
    list$.innerHTML = items.map(n => {
      const iconHtml = n.iconId
        ? platformIcon(n.iconId)
        : (n.icon || platformIcon(_TYPE_ICON_IDS[n.type] || 'notifications'));
      const canNav = !!(n.dest || n.projectId);
      return `
        <div class="notif-centre-item ${n.read ? '' : 'unread'} ${canNav ? 'clickable' : ''}"
             data-nid="${n.id}" data-pid="${n.projectId || ''}">
          <span class="nc-icon">${iconHtml}</span>
          <div class="nc-body">
            <div class="nc-msg">${escapeHtml(n.message)}</div>
            ${n.detail ? `<div class="nc-detail">${escapeHtml(n.detail)}</div>` : ''}
            <div class="nc-time">${_timeAgo(n.createdAt)}</div>
          </div>
          ${n.read ? '' : '<span class="nc-dot"></span>'}
        </div>`;
    }).join('');

    list$.querySelectorAll('.notif-centre-item').forEach(row => {
      row.addEventListener('click', () => {
        const nid = row.dataset.nid;
        const n = (LumioState.notifications || []).find(x => x.id === nid);
        if (n && !n.read) {
          n.read = true;
          row.classList.remove('unread');
          row.querySelector('.nc-dot')?.remove();
          const msgEl = row.querySelector('.nc-msg');
          if (msgEl) msgEl.style.fontWeight = '500';
          scheduleLumioSave();
          const count = myUnreadNotificationCount();
          const badge = document.querySelector('#notif-bell-trigger .pill');
          if (badge) { badge.textContent = count; if (!count) badge.remove(); }
        }
        // Resolve navigation destination: prefer explicit dest, fall back to
        // legacy projectId → course landing for older notifications.
        const dest = n?.dest || (n?.projectId ? { route: 'course', courseId: n.projectId } : null);
        if (dest) { _close(); _navTo(dest); }
      });
    });
  }

  function _close() {
    const panel = document.querySelector('.notif-centre');
    const backdrop = document.querySelector('.notif-centre-backdrop');
    panel?.classList.add('notif-centre-leaving');
    panel?.addEventListener('animationend', () => { panel.remove(); backdrop?.remove(); }, { once: true });
  }

  // Build panel
  const backdrop = document.createElement('div');
  backdrop.className = 'notif-centre-backdrop';
  backdrop.addEventListener('click', _close);

  const panel = document.createElement('div');
  panel.className = 'notif-centre';
  panel.innerHTML = `
    <div class="notif-centre-header">
      <h2>Notifications</h2>
      <div class="notif-centre-header-actions">
        <button id="nc-mark-all">Mark all read</button>
        <button id="nc-clear-all">Clear all</button>
        <button id="nc-close" aria-label="Close" style="font-size:20px; color:var(--ink-400);">×</button>
      </div>
    </div>
    <div class="notif-centre-tabs">
      ${TABS.map(t => `<button class="notif-tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
    <div class="notif-centre-list" id="nc-list"></div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  const list$ = panel.querySelector('#nc-list');
  _renderList(list$);

  panel.querySelectorAll('.notif-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      panel.querySelectorAll('.notif-tab').forEach(b => b.classList.toggle('active', b === btn));
      _renderList(list$);
    });
  });

  panel.querySelector('#nc-close').addEventListener('click', _close);

  panel.querySelector('#nc-mark-all').addEventListener('click', () => {
    myNotifications().forEach(n => { n.read = true; });
    scheduleLumioSave();
    _renderList(list$);
    const badge = document.querySelector('#notif-bell-trigger .pill');
    badge?.remove();
  });

  panel.querySelector('#nc-clear-all').addEventListener('click', () => {
    const uid = getCurrentUser()?.id;
    LumioState.notifications = (LumioState.notifications || []).filter(n => n.userId !== uid);
    scheduleLumioSave();
    _renderList(list$);
    document.querySelector('#notif-bell-trigger .pill')?.remove();
  });
}

/* ---------------- MAIN RENDER DISPATCH ---------------- */
// Routes reachable with no signed-in session — every other route is
// "protected" and redirects to #/login if currentUser is null. This is
// the central guard the app never had: previously every screen assumed
// LumioState.currentUser was always populated (true only because a demo
// identity was hardcoded into the seed state), so a true first-run /
// post-logout null currentUser would have crashed any directly-hit
// protected route (hashchange, back/forward, a stale bookmark) instead of
// gracefully redirecting.
// True when running on a local development server — used to gate the dev
// bypass login so it never surfaces in production or published packages.
const IS_LOCALHOST = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

const PUBLIC_ROUTES = ['login', 'accept-invite', 'reset-password', 'devlogin'];
function render() {
  const hash = location.hash || '#/login';
  const parts = hash.replace('#/', '').split('/');
  let [path, param] = parts;

  // Exported/published packages (publish.js's bootstrap sets this flag) have
  // no concept of login — they're a single self-contained learner runtime
  // with no LumioState.currentUser, ever. Without this check, app.js's own
  // hashchange listener (registered once at load via window.addEventListener
  // ('hashchange', render), independent of the bootstrap's window.render
  // override) fires on every learner navigation and redirects to #/login,
  // silently overwriting the hash the bootstrap just set — the root cause of
  // "Start Course" (and all in-package navigation) doing nothing.
  if (!LearnerUI.publishedMode && !getCurrentUser() && !PUBLIC_ROUTES.includes(path)) {
    if (location.hash !== '#/login') { location.hash = '#/login'; return; }
    path = 'login';
  }

  // Clear course-theme scoped vars when navigating to platform screens;
  // themed screens re-apply their own scope via applyThemeVars().
  if (path !== 'course' && path !== 'lesson' && path !== 'learner') {
    const sheet = document.getElementById('__lumio-course-theme');
    if (sheet) sheet.textContent = '';
  }

  switch (path) {
    case 'login':
      renderLogin();
      break;
    case 'welcome':
      renderWelcome();
      break;
    case 'hub':
      renderHub();
      break;
    case 'projects':
      renderProjects();
      break;
    case 'recent':
      renderRecent();
      break;
    case 'trash':
      renderTrash();
      break;
    case 'profile':
      renderProfile();
      break;
    case 'workspace-settings':
      renderWorkspaceSettings();
      break;
    case 'accept-invite':
      renderAcceptInvite(param);
      break;
    case 'reset-password':
      renderResetPassword(param);
      break;
    case 'devlogin':
      if (IS_LOCALHOST) {
        const _devResult = LumioAuth.loginWithProvider('google');
        if (_devResult.ok) { navigate('#/projects'); } else { navigate('#/login'); }
      } else {
        navigate('#/login');
      }
      break;
    case 'wizard':
      renderWizard();
      break;
    case 'course':
      renderCourseLanding(param || LumioState.currentCourseId);
      break;
    case 'lesson':
      renderLessonBuilder(param || LumioState.currentLessonId);
      break;
    case 'learner':
      renderLearnerPreview(param || LumioState.currentCourseId, parts[2] || null);
      break;
    default:
      renderLogin();
  }
}

/* ---------------- COURSE TEMPLATE CLONING ---------------- */
// Deep-clones LumioData.courseTemplate for a new course, regenerating lesson
// and assessment IDs so multiple courses don't share IDs (which would make
// getCourseAndLesson resolve to the wrong course). Also seeds LumioState.lessons
// for each new lesson ID, carrying over the sample content for the first lesson.
function cloneCourseTemplate(newId) {
  const tmpl = JSON.parse(JSON.stringify(LumioData.courseTemplate));

  tmpl.lessons.forEach(lesson => {
    const oldId = lesson.id;
    const newLessonId = generateUniqueId('l');
    lesson.id = newLessonId;
    LumioState.lessons[newLessonId] = (oldId === 'l1')
      ? JSON.parse(JSON.stringify(LumioData.sampleLessonBlocks))
      : [];
  });

  tmpl.assessments.forEach(a => { a.id = generateUniqueId('a'); });

  tmpl.id = newId;
  return tmpl;
}

/* ---------------- LEARNER PREVIEW ENTRY ---------------- */
// Opens the learner runtime for a course, remembering where to return to
// when the learner exits preview (Projects, Course Landing, or Lesson Builder).
function openLearnerPreviewFor(courseId, returnTo, lessonId) {
  if (!LumioState.courses[courseId]) {
    const tmpl = cloneCourseTemplate(courseId);
    const project = LumioState.projects.find(p => p.id === courseId);
    if (project) tmpl.title = project.title;
    LumioState.courses[courseId] = tmpl;
  }
  // Sprint 2, Phase 5 fix: LumioState.learnerProgress[courseId] previously
  // persisted indefinitely once created (ensureLearnerProgress only
  // initializes it if missing — never resets an existing one), so it
  // silently carried over between separate Preview launches. An author
  // testing a lesson, exiting, editing content, then re-entering Preview
  // would see stale completedLessons/kcAnswers/blockProgress from the
  // PRIOR test — a false "already complete" result with no relationship
  // to the content as it now exists. Every Preview launch (this is the
  // single authoring-side entry point) now starts a genuinely clean
  // learner attempt; this never touches a real exported package's own
  // learner state, which lives in a completely separate per-package
  // localStorage key (see publish.js's bootstrap), not this one.
  delete LumioState.learnerProgress?.[courseId];
  // Sprint 3G fix: revealedContinues was reset here but carouselIndex/
  // quoteCarouselIndex/listChecked were not — these are keyed by
  // "lessonId:blockIndex" (not courseId), so they survived this reset and
  // carried a learner's prior slide/quote/checklist position into the next,
  // supposedly-fresh Preview launch of the SAME lesson (e.g. "Carousel
  // starts on Slide 4"). All transient per-block interaction state now
  // resets together on every fresh Preview entry.
  LearnerUI.revealedContinues = {};
  LearnerUI.carouselIndex = {};
  LearnerUI.quoteCarouselIndex = {};
  LearnerUI.listChecked = {};
  // Architectural boundary: Builder interaction state (which accordion rows
  // are open, which tab is active, which process/scenario step the author
  // navigated to) must never become the learner's starting state. Resetting
  // here ensures every Preview session begins from the block's authored
  // default, not from wherever the author happened to leave the UI.
  // Covers all four consumers: accordion open rows (Set), tabs active index,
  // process current step, scenario current scene.
  BuilderUI.openItemState = {};
  LumioState.learnerPreview = { returnTo: returnTo || '#/projects' };
  navigate('#/learner/' + courseId + (lessonId ? '/' + lessonId : ''));
}
