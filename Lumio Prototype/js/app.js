/* ============================================================
   LUMIO PROTOTYPE — APP SHELL, ROUTER, STATE
   ============================================================ */

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
  return LumioState.currentUser.role === 'owner';
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
  return (LumioState.users || []).find(u => u.id === LumioState.session?.currentUserId) || null;
}
function getCurrentWorkspace() {
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
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
      authProvider,
    }, extra || {});
    LumioState.users.push(user);
    _bindNewUserToWorkspace(user);
    return user;
  }

  // Keeps the legacy currentUser/adminUsers fields (read directly by every
  // existing screen) in sync with whichever canonical user is now signed
  // in — the same bridge pattern used for invitation acceptance.
  function _syncLegacyCurrentUser(user) {
    LumioState.currentUser = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      avatar: user.avatar,
      role: toLegacyRole(user.role),
      dateJoined: user.createdAt,
      lastLogin: user.lastLoginAt,
      password: user.passwordHash ? undefined : 'lumio123',
      status: 'active',
      authenticationProvider: (user.authProvider === 'google' || user.authProvider === 'microsoft') ? user.authProvider : 'local',
    };
    if (!LumioState.adminUsers.find(u => u.id === user.id) && user.id !== LumioState.users[0]?.id) {
      // mirror non-primary signed-in users into adminUsers too, so the
      // Workspace Settings user list (which reads adminUsers) stays complete
      LumioState.adminUsers.push(Object.assign({}, LumioState.currentUser));
    }
  }

  function _establishSession(user, rememberMe) {
    // A user now belongs to exactly the workspace(s) they own or were
    // invited into — no longer assume "workspace 0" is theirs.
    const membership = (LumioState.workspaceMemberships || []).find(m => m.userId === user.id);
    LumioState.session = {
      currentUserId: user.id,
      currentWorkspaceId: membership ? membership.workspaceId : null,
      rememberMe: rememberMe !== false,
    };
    _syncLegacyCurrentUser(user);
    // Marks this browser TAB as having an active session — present for the
    // life of the tab, cleared when the tab/browser closes. Used by
    // restoreSession() to distinguish "still the same tab, just refreshed"
    // from "a brand new browser session", which is exactly what "Remember
    // me" needs to decide whether to honor a persisted-but-not-remembered session.
    try { sessionStorage.setItem(SESSION_TAB_MARKER, '1'); } catch (e) {}
    scheduleLumioSave();
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
    LumioState.session = { currentUserId: null, currentWorkspaceId: null, rememberMe: false };
    // Issue 4 root cause: currentUser previously stayed populated with the
    // just-signed-out identity after logout — purely cosmetic until the
    // NEXT login overwrote it via _syncLegacyCurrentUser, but in the
    // window between logout and the next real login, any code that read
    // LumioState.currentUser directly (instead of going through the
    // session) saw stale data. Clearing it here makes "signed out" mean
    // exactly that.
    LumioState.currentUser = null;
    try { sessionStorage.removeItem(SESSION_TAB_MARKER); } catch (e) {}
    scheduleLumioSave();
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
    _syncLegacyCurrentUser(user);
    try { sessionStorage.setItem(SESSION_TAB_MARKER, '1'); } catch (e) {}
    return true;
  }

  return {
    loginWithProvider,
    registerEmail,
    loginWithEmail,
    logout,
    restoreSession,
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
  return !!(project && project.ownerId === LumioState.currentUser.id);
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
  const uid = LumioState.currentUser.id;
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
  const uid = LumioState.currentUser.id;
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
  const uid = LumioState.currentUser.id;
  const sharedToMe = project.sharedScope === 'team' || (Array.isArray(project.sharedWith) && project.sharedWith.includes(uid));
  return sharedToMe && project.sharedPermission !== 'edit';
}

function canSubmitForReview(project) { return canEditProject(project); }
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
    userId: LumioState.currentUser.id,
    userName: currentUserDisplayName(),
    date: Date.now(),
    comment: comment || null,
  });
}

// In-platform notifications (Phase 7) — no email integration, just a
// persisted, per-user ledger surfaced via the notification bell.
function addNotification(userId, message, projectId) {
  if (!userId) return;
  if (!Array.isArray(LumioState.notifications)) LumioState.notifications = [];
  LumioState.notifications.unshift({
    id: generateUniqueId('n'), userId, message, projectId,
    createdAt: Date.now(), read: false,
  });
}
function myNotifications() {
  const uid = LumioState.currentUser.id;
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
  if ((action === 'approve' || action === 'reject') && !canApproveReject()) return { ok: false, reason: 'Only the Workspace Owner can approve or reject submissions.' };
  if (action === 'reject' && !(comment && comment.trim())) return { ok: false, reason: 'A comment is required when rejecting a submission.' };
  if (action === 'archive' && !canArchiveProject()) return { ok: false, reason: 'Only the Workspace Owner can archive projects.' };
  if (action === 'restore' && !canRestoreProject()) return { ok: false, reason: 'Only the Workspace Owner can restore archived projects.' };
  if ((action === 'publish' || action === 'republish') && !canEditProject(project)) return { ok: false, reason: 'You do not have permission to publish this project.' };

  const now = Date.now();
  const title = projectDisplayTitle(project);
  if (action === 'submit_for_review') {
    project.reviewStatus = 'pending';
    project.submittedBy = LumioState.currentUser.id;
    project.submittedAt = now;
    project.reviewComments = null;
    // Issue 3 root cause: this used to notify the literal id 'u-owner',
    // which only worked by coincidence when that happened to be the real
    // seeded owner's id. Now that fresh installs/real registrations give
    // the Workspace Owner a real generated id, that hardcoded target
    // silently pointed at a user who may not exist — the notification was
    // created but nobody could ever see it. Resolved dynamically instead.
    addNotification(getWorkspaceOwnerIdForProject(project), `"${title}" was submitted for review by ${currentUserDisplayName()}.`, project.id);
  } else if (action === 'approve') {
    project.reviewStatus = 'approved';
    project.reviewedBy = LumioState.currentUser.id;
    project.reviewedAt = now;
    project.reviewComments = comment || null;
    addNotification(project.ownerId, `"${title}" was approved.`, project.id);
  } else if (action === 'reject') {
    project.reviewStatus = 'rejected';
    project.reviewedBy = LumioState.currentUser.id;
    project.reviewedAt = now;
    project.reviewComments = comment;
    addNotification(project.ownerId, `"${title}" was rejected.`, project.id);
  } else if (action === 'publish' || action === 'republish') {
    addNotification(getWorkspaceOwnerIdForProject(project), `"${title}" was ${action === 'republish' ? 're-published' : 'published'} by ${currentUserDisplayName()}.`, project.id);
  } else if (action === 'archive') {
    addNotification(getWorkspaceOwnerIdForProject(project), `"${title}" was archived by ${currentUserDisplayName()}.`, project.id);
  } else if (action === 'restore') {
    addNotification(getWorkspaceOwnerIdForProject(project), `"${title}" was restored from archive by ${currentUserDisplayName()}.`, project.id);
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
function authenticateMicrosoft() {
  const result = LumioAuth.loginWithProvider('microsoft', LumioUI.rememberMe);
  if (result.ok) { toast(`Signed in as ${result.user.displayName} (Microsoft)`, '✅'); navigate('#/projects'); }
  else toast(result.reason, '⚠️');
}

function authenticateGoogle() {
  const result = LumioAuth.loginWithProvider('google', LumioUI.rememberMe);
  if (result.ok) { toast(`Signed in as ${result.user.displayName} (Google)`, '✅'); navigate('#/projects'); }
  else toast(result.reason, '⚠️');
}

function authenticateApple() {
  const result = LumioAuth.loginWithProvider('apple', LumioUI.rememberMe);
  if (result.ok) { toast(`Signed in as ${result.user.displayName} (Apple)`, '✅'); navigate('#/projects'); }
  else toast(result.reason, '⚠️');
}

// Transient, not-persisted UI state shared by the login screen — currently
// just the "Remember me" checkbox's value at the moment a sign-in button is
// clicked. Not part of LumioState since it's pre-authentication UI state.
const LumioUI = { rememberMe: true };

// Returns every workspace member (the signed-in user plus all other users),
// used for rendering the Users tab and for the multi-owner safeguard checks.
function allWorkspaceUsers() {
  return [LumioState.currentUser, ...LumioState.adminUsers];
}

// Counts how many workspace members currently hold the Owner role. Used to
// guard against removing, demoting, or disabling the last remaining Owner.
function workspaceOwnerCount() {
  return allWorkspaceUsers().filter(u => u.role === 'owner').length;
}

// Returns the initials + display name + avatar for the signed-in user,
// used everywhere the current user's identity is shown (sidebar, profile).
function currentUserDisplayName() {
  const u = LumioState.currentUser;
  return `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'User';
}
function currentUserInitials() {
  const u = LumioState.currentUser;
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
const LUMIO_STATE_VERSION = 19;

/* Shared block-gap tokens — single source of truth used by both builder and
   learner preview so spacing can never silently diverge between contexts. */
const FLOW_SPACING = '32px';
const FLOW_SPACING_TIGHT = '8px';

// Keys of LumioState that should be persisted/restored across sessions.
const LUMIO_PERSISTED_KEYS = [
  'projects', 'folders', 'currentFolder', 'searchQuery', 'typeFilter',
  'wizard', 'courses', 'lessons', 'currentCourseId', 'currentLessonId',
  'learnerProgress', 'learnerPreview', 'learnerProfile', 'resume',
  'interactionHistory', 'assessmentAttempts',
  'currentUser', 'workspace', 'adminUsers', 'invitations',
  'users', 'workspaces', 'workspaceMemberships', 'session',
  'notifications', 'statusFilter',
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

function saveLumioState() {
  try {
    const snapshot = {};
    LUMIO_PERSISTED_KEYS.forEach(key => { snapshot[key] = LumioState[key]; });
    const record = {
      version: LUMIO_STATE_VERSION,
      savedAt: Date.now(),
      hash: location.hash,
      state: snapshot,
    };
    localStorage.setItem(LUMIO_STORAGE_KEY, JSON.stringify(record));
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
      const def = LumioState.currentUser; // always has good defaults from app.js
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
      collect(d.background); collect(d.avatar); collect(ds.bgImage);
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

  // Collect and fetch all referenced assets
  const assetRefs = _collectProjectAssetRefs(course, lessons);
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
  p.ownerId = LumioState.currentUser.id;
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
}

/* ---------------- ROUTER ---------------- */
function navigate(hash) {
  if (location.hash === hash) { render(); }
  else { location.hash = hash; }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => {
  const restoredHash = loadLumioState();
  ensureStableBlockIdentity();
  ensureSaasFoundation();
  const sessionValid = LumioAuth.restoreSession();
  if (sessionValid && restoredHash) location.hash = restoredHash;
  else if (sessionValid && !location.hash) location.hash = '#/projects';
  else location.hash = '#/login'; // no valid session (never signed in, or "Remember me" was off and the browser was actually closed/reopened)
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

function toast(msg, icon) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = el(`<div class="toast">${icon ? `<span>${icon}</span>` : ''}<span>${msg}</span></div>`);
  document.body.appendChild(t);
  setTimeout(() => {
    t.classList.add('toast-leaving');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }, 2600);
}

// Applies a course's theme CSS variables to the #app root so that global
// styles (.btn, .card, nav, tabs, headings, etc.) inherit them via the
// cascade. Pass null/undefined to clear theme overrides on non-course pages.
function applyThemeVars(course) {
  const app = document.getElementById('app');
  if (course) {
    ensureCourseDesign(course);
    app.setAttribute('style', themeVarStyle(course.themeDesign));
  } else {
    app.removeAttribute('style');
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
  { id: 'projects', label: 'Projects', icon: '🗂️', hash: '#/projects' },
  { id: 'hub', label: 'ID Academy', icon: '🎓', hash: '#/hub' },
];

function renderShell(activeId, contentHtml, opts = {}) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-shell">
      <aside class="app-sidebar">
        <div class="sidebar-logo" data-nav="#/welcome" style="${opts.largeLogo ? 'justify-content:center; padding:24px 10px;' : ''} cursor:pointer;">
          ${opts.largeLogo
            ? `<img src="assets/lumio-logo-transparent.png" alt="Lumio" style="width:140px; height:auto; border-radius:0; object-fit:contain; display:block;" />`
            : `<img src="assets/lumio-logo-transparent.png" alt="Lumio" /><span>Lumio</span>`}
        </div>
        ${NAV_ITEMS.map(item => `
          <div class="nav-item ${item.id === activeId ? 'active' : ''}" data-nav="${item.hash}">
            <span class="ic">${item.icon}</span>
            <span>${item.label}</span>
          </div>
        `).join('')}
        <div class="nav-section-label">Workspace</div>
        <div class="nav-item ${activeId === 'recent' ? 'active' : ''}" data-nav="#/recent">
          <span class="ic">⏱️</span><span>Recent</span>
        </div>
        <div class="nav-item ${activeId === 'trash' ? 'active' : ''}" data-nav="#/trash">
          <span class="ic">🗑️</span><span>Trash</span>
        </div>
        ${canAccessWorkspaceSettings() ? `
        <div class="nav-item ${activeId === 'workspace-settings' ? 'active' : ''}" data-nav="#/workspace-settings">
          <span class="ic">⚙️</span><span>Workspace Settings</span>
        </div>
        ` : ''}
        <div style="flex:1"></div>
        <div class="nav-item" id="notif-bell-trigger" style="position:relative;">
          <span class="ic">🔔</span><span>Notifications</span>
          ${myUnreadNotificationCount() > 0 ? `<span class="pill pill-magenta" style="margin-left:auto; min-width:20px; text-align:center; padding:2px 6px;">${myUnreadNotificationCount()}</span>` : ''}
        </div>
        <div class="nav-item" data-nav="#/login">
          <span class="ic">↩️</span><span>Sign out</span>
        </div>
        <div class="nav-item ${activeId === 'profile' ? 'active' : ''}" data-nav="#/profile" style="border-top:1px solid var(--border); margin-top:8px; border-radius:0;">
          ${avatarHtml(LumioState.currentUser)}
          <div style="font-size:13px; min-width:0;">
            <div style="font-weight:600; color:var(--ink-900); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${currentUserDisplayName()}</div>
            <div class="text-muted" style="font-size:12px;">${ROLE_LABELS[LumioState.currentUser.role]}</div>
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
      if (elx.dataset.nav === '#/login') LumioAuth.logout(); // "Sign out" — clear the real session, not just navigate away from it
      navigate(elx.dataset.nav);
    });
  });

  app.querySelector('#notif-bell-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openNotificationsPanel(e.currentTarget);
  });
}

// Phase 7 notification bell dropdown — lists this user's notifications
// (newest first), marks them all read on open (the bell itself re-renders
// on next navigation/shell paint, clearing the unread badge).
function openNotificationsPanel(anchorEl) {
  document.querySelectorAll('.popover-menu').forEach(m => m.remove());
  const items = myNotifications().slice(0, 15);
  const html = items.length
    ? items.map(n => `
        <div style="padding:10px 12px; border-bottom:1px solid var(--border); ${n.read ? '' : 'background:var(--pastel-lavender);'}">
          <div class="text-sm" style="color:var(--ink-900);">${escapeHtml(n.message)}</div>
          <div class="text-muted" style="font-size:11px; margin-top:2px;">${formatDateLong(n.createdAt)}</div>
        </div>`).join('')
    : `<div style="padding:16px; text-align:center;" class="text-sm text-muted">No notifications yet.</div>`;
  const menu = popoverAt(anchorEl, html, { width: 280 });
  menu.style.maxHeight = '360px';
  menu.style.overflowY = 'auto';
  myNotifications().forEach(n => { n.read = true; });
  scheduleLumioSave();
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
const PUBLIC_ROUTES = ['login', 'accept-invite'];
function render() {
  const hash = location.hash || '#/login';
  const parts = hash.replace('#/', '').split('/');
  let [path, param] = parts;

  if (!LumioState.currentUser && !PUBLIC_ROUTES.includes(path)) {
    if (location.hash !== '#/login') { location.hash = '#/login'; return; }
    path = 'login';
  }

  // Clear any course-theme CSS variables left over from a previous screen;
  // themed screens (course/lesson/learner) re-apply their own via applyThemeVars().
  if (path !== 'course' && path !== 'lesson' && path !== 'learner') {
    document.getElementById('app')?.removeAttribute('style');
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
  LumioState.learnerPreview = { returnTo: returnTo || '#/projects' };
  navigate('#/learner/' + courseId + (lessonId ? '/' + lessonId : ''));
}
