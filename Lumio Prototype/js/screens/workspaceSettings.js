/* ============================================================
   WORKSPACE SETTINGS (Workspace Owners only)
   Administrative area: workspace user management (roles,
   status, invitations) and read-only system information.
   ============================================================ */

const WORKSPACE_SETTINGS_TABS = [
  { id: 'users', label: 'Users' },
  { id: 'governance', label: 'Governance' },
  { id: 'system', label: 'System Information' },
];

let workspaceSettingsTab = 'users';

function renderWorkspaceSettings() {
  if (!canAccessWorkspaceSettings()) {
    navigate('#/projects');
    return;
  }

  const content = `
    <header class="app-topbar">
      <div>
        <h2 style="font-size:20px;">Workspace Settings</h2>
        <p class="text-sm text-muted">Manage workspace users, roles, invitations, and system information</p>
      </div>
    </header>
    <main class="app-content">
      ${ambientBlobs([
        ['var(--pastel-cyan)', '320px', '320px', '-100px', '-80px', null, null],
      ])}
      <div style="position:relative; z-index:1; max-width:820px;">
        <div class="tabs mb-24" id="ws-tabs">
          ${WORKSPACE_SETTINGS_TABS.map(t => `<div class="tab ${workspaceSettingsTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('')}
        </div>
        <div id="ws-tab-content"></div>
      </div>
    </main>
  `;
  renderShell('workspace-settings', content);

  const app = document.getElementById('app');
  app.querySelectorAll('#ws-tabs .tab').forEach(t => {
    t.addEventListener('click', () => {
      workspaceSettingsTab = t.dataset.tab;
      renderWorkspaceSettings();
    });
  });

  renderWorkspaceSettingsTab();
}

function renderWorkspaceSettingsTab() {
  const host = document.getElementById('ws-tab-content');
  if (!host) return;
  switch (workspaceSettingsTab) {
    case 'users': host.innerHTML = workspaceUsersTab(); bindWorkspaceUsersTab(); break;
    case 'governance': host.innerHTML = workspaceGovernanceTab(); bindWorkspaceReviewsTab(); break;
    case 'system': host.innerHTML = workspaceSystemTab(); break;
  }
}

/* ---------------- GOVERNANCE DASHBOARD (Workspace Owner only) ----------------
   Phase 6 of the Governance & Review Workflow Hardening Sprint: a single
   place to see review activity across every status, not just the pending
   queue — closes the "Administrator has no visibility" / "no way to see
   approved/rejected/archived projects" gaps from the prior audit. Still
   Workspace-Owner-only (canAccessWorkspaceSettings gates the whole screen);
   an Administrator's equivalent visibility is the Review Status section on
   their own projects' Course Landing page (Phase 5). */
function workspaceGovernanceTab() {
  const all = LumioState.projects.filter(p => !p.deleted);
  const pending = all.filter(p => p.status === 'in_review');
  const recentlyApproved = all.filter(p => p.status === 'approved').sort((a,b) => (b.reviewedAt||0)-(a.reviewedAt||0)).slice(0, 5);
  const recentlyRejected = all.filter(p => p.status === 'rejected').sort((a,b) => (b.reviewedAt||0)-(a.reviewedAt||0)).slice(0, 5);
  const published = all.filter(p => p.status === 'published').sort((a,b) => (b.lastAccessed||0)-(a.lastAccessed||0)).slice(0, 5);
  const archived = all.filter(p => p.status === 'archived');

  const section = (title, items, emptyText, rowFn) => `
    <div class="card card-pad mb-16">
      <div class="prop-section-title">${title}</div>
      ${items.length ? `<div class="flex-col gap-8">${items.map(rowFn).join('')}</div>` : `<p class="text-sm text-muted">${emptyText}</p>`}
    </div>`;

  return `
    ${section('Pending Reviews', pending, 'No projects are currently awaiting review.', p => pendingReviewRow(p))}
    ${section('Recently Approved', recentlyApproved, 'No projects have been approved yet.', p => governanceRow(p, 'reviewedAt'))}
    ${section('Recently Rejected', recentlyRejected, 'No projects have been rejected.', p => governanceRow(p, 'reviewedAt', true))}
    ${section('Published', published, 'No projects are currently published.', p => governanceRow(p, 'lastAccessed'))}
    ${section('Archived', archived, 'No projects are archived.', p => governanceRow(p, 'lastAccessed'))}
  `;
}

function pendingReviewRow(p) {
  const author = getWorkspaceUser(p.submittedBy) || {};
  const authorName = author.firstName ? `${author.firstName} ${author.lastName || ''}`.trim() : 'Unknown';
  const submittedDate = p.submittedAt ? new Date(p.submittedAt).toLocaleDateString() : '—';
  return `
    <div class="flex items-center gap-12" style="padding:10px 0; border-bottom:1px solid var(--border);" data-review-row="${p.id}">
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; font-size:13px; color:var(--ink-900);">${escapeHtml(projectDisplayTitle(p))}</div>
        <div class="text-muted" style="font-size:12px;">By ${escapeHtml(authorName)} · Submitted ${submittedDate}</div>
      </div>
      <span class="pill ${STATUS_BADGE[p.status] || 'pill-grey'}">${PROJECT_STATUS_LABELS[p.status] || p.status}</span>
      <div class="flex gap-8">
        <button class="btn btn-secondary btn-sm" data-review-reject="${p.id}">Reject</button>
        <button class="btn btn-primary btn-sm" data-review-approve="${p.id}">Approve</button>
      </div>
    </div>
  `;
}

// Generic read-only row for the Recently Approved/Rejected/Published/Archived
// sections — shows type, the comment (when present) and the relevant date.
function governanceRow(p, dateField, showComment) {
  const reviewer = p.reviewedBy ? getWorkspaceUser(p.reviewedBy) : null;
  const reviewerName = reviewer ? `${reviewer.firstName} ${reviewer.lastName || ''}`.trim() : null;
  return `
    <div style="padding:10px 0; border-bottom:1px solid var(--border);">
      <div class="flex items-center gap-12">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; font-size:13px; color:var(--ink-900);">${escapeHtml(projectDisplayTitle(p))} <span class="text-muted" style="font-weight:400;">· ${p.type}</span></div>
          <div class="text-muted" style="font-size:12px;">${reviewerName ? `By ${escapeHtml(reviewerName)} · ` : ''}${p[dateField] ? new Date(p[dateField]).toLocaleDateString() : '—'}</div>
        </div>
        <span class="pill ${STATUS_BADGE[p.status] || 'pill-grey'}">${PROJECT_STATUS_LABELS[p.status] || p.status}</span>
      </div>
      ${showComment && p.reviewComments ? `<div class="text-sm mt-8" style="padding:8px 10px; background:#FEECEC; border-radius:var(--r-sm);">"${escapeHtml(p.reviewComments)}"</div>` : ''}
    </div>`;
}

function bindWorkspaceReviewsTab() {
  const host = document.getElementById('ws-tab-content');
  if (!host) return;
  host.querySelectorAll('[data-review-approve]').forEach(btn => btn.addEventListener('click', async () => {
    const p = LumioState.projects.find(x => x.id === btn.dataset.reviewApprove);
    const comment = await promptModal('Add an optional comment for the project creator', '');
    if (comment === null) return; // cancelled
    const result = transitionProjectStatus(p, 'approve', comment);
    if (!result.ok) { toast(result.reason, '⚠️'); return; }
    toast(`"${projectDisplayTitle(p)}" approved`, '✅');
    renderWorkspaceSettingsTab();
  }));
  host.querySelectorAll('[data-review-reject]').forEach(btn => btn.addEventListener('click', async () => {
    const p = LumioState.projects.find(x => x.id === btn.dataset.reviewReject);
    let comment = null;
    while (comment === null || !comment.trim()) {
      comment = await promptModal('A comment is required when rejecting a submission', '');
      if (comment === null) return; // cancelled
      if (!comment.trim()) toast('A comment is required to reject a submission.', '⚠️');
    }
    const result = transitionProjectStatus(p, 'reject', comment);
    if (!result.ok) { toast(result.reason, '⚠️'); return; }
    toast(`"${projectDisplayTitle(p)}" rejected`, '↩️');
    renderWorkspaceSettingsTab();
  }));
}

/* ---------------- USERS ---------------- */
// Account Management Finalization Sprint, Phase 2: resolves directly from
// users[] — the only authoritative store. The returned object is a live
// reference, so callers that mutate it (role change, disable/enable)
// persist immediately with no separate legacy-mirror sync step.
function getWorkspaceUser(id) {
  return (LumioState.users || []).find(u => u.id === id) || null;
}

function workspaceUsersTab() {
  const users = allWorkspaceUsers();
  const invitations = LumioState.invitations.filter(i => i.status === 'pending');

  return `
    <div class="card card-pad mb-24">
      <div class="prop-section-title">Users</div>
      <div class="flex-col gap-8">
        ${users.map(u => userRow(u)).join('')}
      </div>
    </div>

    <div class="card card-pad mb-24">
      <div class="prop-section-title">Invite User</div>
      <div class="flex gap-12" style="flex-wrap:wrap; align-items:flex-end;">
        <div class="field" style="flex:1; min-width:160px; margin-bottom:0;">
          <label>First Name</label>
          <input class="input" id="ws-invite-first-name" type="text" placeholder="First name" />
        </div>
        <div class="field" style="flex:1; min-width:160px; margin-bottom:0;">
          <label>Last Name</label>
          <input class="input" id="ws-invite-last-name" type="text" placeholder="Last name" />
        </div>
        <div class="field" style="flex:2; min-width:220px; margin-bottom:0;">
          <label>Email Address</label>
          <input class="input" id="ws-invite-email" type="email" placeholder="name@company.com" />
        </div>
      </div>
      <div class="flex gap-12 mt-12" style="flex-wrap:wrap; align-items:flex-end;">
        <div class="field" style="margin-bottom:0;">
          <label>Role</label>
          <select class="input" id="ws-invite-role-select" style="width:180px;">
            <option value="admin">Administrator</option>
            <option value="owner">Workspace Owner</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Authentication Method</label>
          <select class="input" id="ws-invite-auth" style="width:180px;">
            <option value="local">Lumio Account</option>
            <option value="microsoft">Microsoft SSO</option>
            <option value="google">Google SSO</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm" id="ws-invite-send">Send Invitation</button>
      </div>
      <div id="ws-invite-feedback" class="text-sm mt-12" style="display:none;"></div>
      ${invitations.length ? `
      <div class="mt-16">
        <div class="text-sm text-muted mb-8">Pending Invitations</div>
        <div class="flex-col gap-8">
          ${invitations.map(inv => invitationRow(inv)).join('')}
        </div>
      </div>` : ''}
    </div>
  `;
}

function userRow(user) {
  const isSelf = user.id === getCurrentUser()?.id;
  return `
    <div class="flex items-center gap-12" style="padding:10px 0; border-bottom:1px solid var(--border);" data-user-row="${user.id}">
      ${avatarHtml(user, 36)}
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; font-size:13px; color:var(--ink-900);">${escapeHtml(`${user.firstName || ''} ${user.lastName || ''}`.trim())}${isSelf ? ' <span class="text-muted" style="font-weight:400;">(You)</span>' : ''}</div>
        <div class="text-muted" style="font-size:12px;">${escapeHtml(user.email)}</div>
      </div>
      <select class="input" style="width:160px; padding:6px 8px; font-size:12px;" data-user-role="${user.id}">
        <option value="${ROLE_WORKSPACE_OWNER}" ${user.role === ROLE_WORKSPACE_OWNER ? 'selected' : ''}>Workspace Owner</option>
        <option value="${ROLE_ADMINISTRATOR}" ${user.role === ROLE_ADMINISTRATOR ? 'selected' : ''}>Administrator</option>
      </select>
      <span class="pill ${user.status === 'active' ? 'pill-teal' : 'pill-grey'}">${user.status === 'active' ? 'Active' : 'Disabled'}</span>
      <div class="flex gap-8">
        <button class="btn btn-ghost btn-sm" data-user-toggle="${user.id}">${user.status === 'active' ? 'Disable' : 'Enable'}</button>
        <button class="btn btn-ghost btn-sm" data-user-remove="${user.id}" style="color:#E5484D;">Remove</button>
      </div>
    </div>
  `;
}

function invitationRow(inv) {
  const authLabel = AUTH_PROVIDER_LABELS[inv.authenticationProvider] || 'Lumio Account';
  return `
    <div class="flex items-center gap-12" style="padding:10px 0; border-bottom:1px solid var(--border);" data-invite-row="${inv.id}">
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; font-size:13px; color:var(--ink-900);">${escapeHtml(inv.firstName ? `${inv.firstName} ${inv.lastName}`.trim() : inv.email)}</div>
        <div class="text-muted" style="font-size:12px;">${escapeHtml(inv.email)} · ${escapeHtml(authLabel)}</div>
      </div>
      <span class="pill ${inv.role === 'owner' ? 'pill-indigo' : 'pill-cyan'}">${ROLE_LABELS[inv.role]}</span>
      <span class="pill pill-grey">Pending</span>
      <div class="flex gap-8">
        <button class="btn btn-ghost btn-sm" data-invite-copy="${inv.id}">Copy Link</button>
        <button class="btn btn-ghost btn-sm" data-invite-revoke="${inv.id}" style="color:#E5484D;">Revoke</button>
      </div>
    </div>
  `;
}

// Sends (or logs) the invitation email. Wire up a real transactional email
// service here — this is the only integration point needed for email delivery.
// Issue 8 audit finding, documented in code as well as in the sprint
// report: this function has NEVER sent a real email — it only logs what
// WOULD be sent. INVITATION FRAMEWORK IMPLEMENTED (token generation, link
// construction, acceptance flow all work end-to-end) — EMAIL DELIVERY NOT
// IMPLEMENTED (no SMTP/Resend/SendGrid/Graph integration exists). Wiring
// a real provider here is the only change needed once one is configured;
// every caller of sendInvitationEmail() already passes the full
// invitation object needed to compose a real message.
function sendInvitationEmail(invitation) {
  const authLabel = AUTH_PROVIDER_LABELS[invitation.authenticationProvider] || 'Lumio Account';
  console.info(`[Lumio] Invitation email would be sent to ${invitation.email}:
  Workspace Name: [Workspace Name]
  Role: ${ROLE_LABELS[invitation.role]}
  Authentication: ${authLabel}
  Activate Account: ${invitation.link}`);
}

// Accepts a pending invitation by token and creates a new workspace member
// with the role and authentication provider chosen at invite time.
// For local accounts, pass the user-chosen password; for SSO, password is unused.
// Returns the new user, or null if the token is invalid/already used.
// Full invitation lifecycle (Ownership & Visibility Correction Sprint):
// if an account with this email already exists, it joins the inviting
// workspace as-is (no duplicate user created); otherwise a new account is
// registered. Either way the resulting membership.role is ALWAYS
// 'administrator' — invitation acceptance never grants workspace_owner,
// regardless of what role that user might hold in a workspace of their
// own elsewhere.
function acceptInvitation(token, password) {
  const inv = LumioState.invitations.find(i => i.token === token && i.status === 'pending');
  if (!inv) return null;
  // Expiry check (additive — older saves backfilled a 7-day default at
  // migration time, see app.js v16). An expired invitation cannot be
  // accepted; the workspace owner would need to send a new one.
  if (inv.expiresAt && Date.now() > inv.expiresAt) return null;

  const workspaceId = inv.workspaceId || LumioState.session?.currentWorkspaceId;
  let canonicalUser = LumioState.users.find(u => u.email.toLowerCase() === inv.email.toLowerCase());

  if (!canonicalUser) {
    // Account Management Finalization Sprint, Phase 2: writes directly into
    // users[] — there is no longer a separate legacy/adminUsers record to
    // create alongside it.
    canonicalUser = {
      id: generateUniqueId('u'),
      email: inv.email,
      firstName: inv.firstName || inv.email.split('@')[0],
      lastName: inv.lastName || '',
      displayName: `${inv.firstName || ''} ${inv.lastName || ''}`.trim() || inv.email,
      avatar: null,
      role: ROLE_ADMINISTRATOR,
      status: 'active',
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
      authProvider: toCanonicalAuthProvider(inv.authenticationProvider),
    };
    if (canonicalUser.authProvider === 'email' || canonicalUser.authProvider === 'local_demo') {
      canonicalUser.passwordHash = LumioAuth._hashPassword(password || 'lumio123');
    }
    LumioState.users.push(canonicalUser);
  }

  // Membership in the INVITING workspace is always 'administrator' — even
  // if this user already owns a workspace of their own elsewhere.
  if (workspaceId && !getWorkspaceMembership(canonicalUser.id, workspaceId)) {
    LumioState.workspaceMemberships.push({ workspaceId, userId: canonicalUser.id, role: ROLE_ADMINISTRATOR, joinedAt: Date.now() });
  }

  inv.status = 'accepted';
  inv.acceptedAt = Date.now();

  const workspace = (LumioState.workspaces || []).find(w => w.id === workspaceId);
  if (workspace) {
    addNotification(workspace.ownerId, `${canonicalUser.displayName || canonicalUser.email} accepted your invitation and joined as Administrator.`, null);
  }

  scheduleLumioSave();
  return canonicalUser;
}

function bindWorkspaceUsersTab() {
  const app = document.getElementById('app');

  app.querySelectorAll('[data-user-role]').forEach(sel => {
    sel.addEventListener('change', () => {
      const id = sel.dataset.userRole;
      const user = getWorkspaceUser(id);
      if (!user) return;
      const newRole = sel.value;
      if (newRole === user.role) return;

      if (user.role === ROLE_WORKSPACE_OWNER && newRole === ROLE_ADMINISTRATOR && workspaceOwnerCount() <= 1) {
        sel.value = user.role;
        toast('At least one Workspace Owner is required. Promote another user before changing this role.', '⚠️');
        return;
      }

      user.role = newRole;
      // Also keep this workspace's membership row (the actual source of
      // truth for "what role does this user hold in THIS workspace") in
      // sync — the canonical users[].role field above is a convenience
      // default, but workspaceMemberships is what allWorkspaceUsers()/
      // getWorkspaceMembership() actually consult.
      const ws = getCurrentWorkspace();
      const membership = ws && getWorkspaceMembership(user.id, ws.id);
      if (membership) membership.role = newRole;
      toast(`${user.firstName} ${user.lastName} is now ${CANONICAL_ROLE_LABELS[newRole]}`, '🔄');
      renderWorkspaceSettings();
      scheduleLumioSave();
    });
  });

  app.querySelectorAll('[data-user-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.userToggle;
      const user = getWorkspaceUser(id);
      if (!user) return;
      const isSelf = id === getCurrentUser()?.id;

      if (user.status === 'active') {
        if (isSelf) {
          toast('You cannot disable your own account.', '⚠️');
          return;
        }
        if (user.role === ROLE_WORKSPACE_OWNER && workspaceOwnerCount() <= 1) {
          toast('At least one Workspace Owner is required. You cannot disable the only remaining Workspace Owner.', '⚠️');
          return;
        }
      }

      user.status = user.status === 'active' ? 'disabled' : 'active';
      renderWorkspaceSettings();
      scheduleLumioSave();
    });
  });

  app.querySelectorAll('[data-user-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.userRemove;
      const user = getWorkspaceUser(id);
      if (!user) return;
      const isSelf = id === getCurrentUser()?.id;

      if (isSelf) {
        if (user.role === ROLE_WORKSPACE_OWNER && workspaceOwnerCount() <= 1) {
          toast('You are the only Workspace Owner — at least one Workspace Owner is required.', '⚠️');
        } else {
          toast('You cannot remove your own account.', '⚠️');
        }
        return;
      }
      if (user.role === ROLE_WORKSPACE_OWNER && workspaceOwnerCount() <= 1) {
        toast('At least one Workspace Owner is required. You cannot remove the only remaining Workspace Owner.', '⚠️');
        return;
      }

      // Removes this user's MEMBERSHIP in the current workspace only — their
      // users[] account (and any other workspace they belong to) is
      // untouched. This is the correct semantics now that users[] is the
      // sole user repository: "Remove" here always meant "remove from this
      // workspace," never "delete the account."
      const ws = getCurrentWorkspace();
      if (ws) LumioState.workspaceMemberships = LumioState.workspaceMemberships.filter(m => !(m.userId === id && m.workspaceId === ws.id));
      toast(`Removed ${user.firstName} ${user.lastName}`, '🗑️');
      renderWorkspaceSettings();
      scheduleLumioSave();
    });
  });

  app.querySelectorAll('[data-invite-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const inv = LumioState.invitations.find(i => i.id === btn.dataset.inviteCopy);
      if (!inv) return;
      navigator.clipboard?.writeText(inv.link).catch(() => {});
      toast('Invitation link copied', '🔗');
    });
  });

  app.querySelectorAll('[data-invite-revoke]').forEach(btn => {
    btn.addEventListener('click', () => {
      const inv = LumioState.invitations.find(i => i.id === btn.dataset.inviteRevoke);
      if (!inv) return;
      inv.status = 'revoked';
      renderWorkspaceSettings();
      scheduleLumioSave();
    });
  });

  app.querySelector('#ws-invite-send').addEventListener('click', () => {
    const firstName = app.querySelector('#ws-invite-first-name').value.trim();
    const lastName = app.querySelector('#ws-invite-last-name').value.trim();
    const emailInput = app.querySelector('#ws-invite-email');
    const email = emailInput.value.trim();
    const role = app.querySelector('#ws-invite-role-select').value;
    const authenticationProvider = app.querySelector('#ws-invite-auth').value;
    const feedback = app.querySelector('#ws-invite-feedback');

    const showFeedback = (msg, ok) => {
      feedback.textContent = msg;
      feedback.style.display = 'block';
      feedback.style.color = ok ? '#22A06B' : '#E5484D';
    };

    if (!firstName) { showFeedback('Please enter a first name.', false); return; }
    if (!email) { showFeedback('Please enter an email address.', false); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFeedback('Please enter a valid email address.', false);
      return;
    }
    if (allWorkspaceUsers().some(u => u.email.toLowerCase() === email.toLowerCase())
      || LumioState.invitations.some(i => i.email.toLowerCase() === email.toLowerCase() && i.status === 'pending')) {
      showFeedback('This email already has an account or pending invitation.', false);
      return;
    }

    const token = generateUniqueId('inv');
    const link = `${location.origin}${location.pathname}#/accept-invite/${token}`;
    const now = Date.now();
    const invitation = {
      id: generateUniqueId('i'),
      firstName,
      lastName,
      email,
      role,
      authenticationProvider,
      token,
      link,
      status: 'pending',
      createdAt: now,
      // SaaS foundation fields (Workspace & Authentication Foundation Sprint).
      workspaceId: LumioState.session?.currentWorkspaceId || null,
      invitedBy: LumioState.session?.currentUserId || getCurrentUser()?.id,
      expiresAt: now + 7 * 24 * 3600 * 1000, // 7 days
      acceptedAt: null,
    };
    LumioState.invitations.push(invitation);
    sendInvitationEmail(invitation);
    addNotification(invitation.invitedBy, `Invitation sent to ${email} as ${ROLE_LABELS[role]}.`, null);

    app.querySelector('#ws-invite-first-name').value = '';
    app.querySelector('#ws-invite-last-name').value = '';
    emailInput.value = '';
    showFeedback(`Invitation sent to ${email} as ${ROLE_LABELS[role]}.`, true);
    toast('Invitation created', '✉️');
    renderWorkspaceSettings();
    scheduleLumioSave();
  });
}

/* ---------------- ACCEPT INVITATION ---------------- */
// Standalone screen reached via an invitation link (#/accept-invite/:token).
// Branches on authenticationProvider: local shows a password-creation form;
// Microsoft/Google show an SSO button (placeholder until OAuth is wired).
function renderAcceptInvite(token) {
  const inv = LumioState.invitations.find(i => i.token === token && i.status === 'pending');
  const app = document.getElementById('app');
  document.getElementById('app')?.removeAttribute('style');

  const roleLabel = inv ? ROLE_LABELS[inv.role] : '';
  const authLabel = inv ? (AUTH_PROVIDER_LABELS[inv.authenticationProvider] || 'Lumio Account') : '';

  let activationContent = '';
  if (inv) {
    if (inv.authenticationProvider === 'microsoft') {
      activationContent = `
        <p class="text-sm text-muted mb-20">Your workspace uses <strong>Microsoft SSO</strong>. Sign in with your Microsoft account to activate.</p>
        <button class="btn btn-secondary w-full social-login-btn" id="accept-microsoft-btn" style="justify-content:center;">
          <svg class="social-icon" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
            <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
          </svg>
          Activate with Microsoft
        </button>`;
    } else if (inv.authenticationProvider === 'google') {
      activationContent = `
        <p class="text-sm text-muted mb-20">Your workspace uses <strong>Google SSO</strong>. Sign in with your Google account to activate.</p>
        <button class="btn btn-secondary w-full social-login-btn" id="accept-google-btn" style="justify-content:center;">
          <svg class="social-icon" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.9C16.66 14.2 17.64 11.92 17.64 9.2z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.81.54-1.85.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.97v2.33A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.97A8.997 8.997 0 0 0 0 9c0 1.45.35 2.83.97 4.03l2.98-2.33z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58A8.59 8.59 0 0 0 9 0 8.997 8.997 0 0 0 .97 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z"/>
          </svg>
          Activate with Google
        </button>`;
    } else {
      activationContent = `
        <p class="text-sm text-muted mb-16">Create a password to secure your account.</p>
        <div class="field">
          <label>Create Password</label>
          <input class="input" id="accept-password" type="password" placeholder="Choose a password (min. 6 characters)" />
        </div>
        <div class="field">
          <label>Confirm Password</label>
          <input class="input" id="accept-password-confirm" type="password" placeholder="Re-enter your password" />
        </div>
        <div id="accept-password-feedback" class="text-sm mb-12" style="display:none;"></div>
        <button class="btn btn-primary w-full" id="accept-activate-btn">Activate Account</button>`;
    }
  }

  app.innerHTML = `
    <div style="min-height:100vh; position:relative; overflow:hidden; background:var(--surface-50); display:flex; align-items:center; justify-content:center; padding:24px;">
      <div class="mesh-bg"></div>
      ${ambientBlobs([
        ['var(--pastel-lavender)', '420px', '420px', '-140px', '-120px', null, null],
        ['var(--pastel-cyan)', '360px', '360px', null, null, '-120px', '-100px'],
      ])}
      <div class="card card-pad fade-in" style="position:relative; z-index:1; max-width:440px; width:100%; text-align:center;">
        ${inv ? `
          <div style="font-size:40px; margin-bottom:12px;">✉️</div>
          <h2 style="font-size:20px; margin-bottom:4px;">You've been invited to Lumio</h2>
          <p class="text-sm text-muted mb-4">Role: <strong>${escapeHtml(roleLabel)}</strong></p>
          <p class="text-sm text-muted mb-20">Authentication: <strong>${escapeHtml(authLabel)}</strong></p>
          <div style="text-align:left;">
            ${activationContent}
          </div>
        ` : `
          <div style="font-size:40px; margin-bottom:12px;">⚠️</div>
          <h2 style="font-size:20px; margin-bottom:8px;">Invitation not found</h2>
          <p class="text-sm text-muted mb-16">This invitation link is invalid or has already been used.</p>
          <button class="btn btn-secondary w-full" id="accept-invite-back">Back to Login</button>
        `}
      </div>
    </div>
  `;

  // Local account: validate + create password
  app.querySelector('#accept-activate-btn')?.addEventListener('click', () => {
    const pw = app.querySelector('#accept-password').value;
    const pw2 = app.querySelector('#accept-password-confirm').value;
    const fb = app.querySelector('#accept-password-feedback');
    const show = (msg, ok) => { fb.textContent = msg; fb.style.display = 'block'; fb.style.color = ok ? '#22A06B' : '#E5484D'; };
    if (!pw) { show('Please create a password.', false); return; }
    if (pw.length < 6) { show('Password must be at least 6 characters.', false); return; }
    if (pw !== pw2) { show('Passwords do not match.', false); return; }
    const user = acceptInvitation(token, pw);
    if (!user) return;
    toast(`Account activated — welcome, ${user.firstName}!`, '🎉');
    navigate('#/login');
  });

  // Microsoft SSO placeholder
  app.querySelector('#accept-microsoft-btn')?.addEventListener('click', () => {
    // Future integration: call authenticateMicrosoft() with invitation context.
    console.info('[Lumio Auth] Microsoft SSO activation — integration point (not yet wired)');
    const user = acceptInvitation(token);
    if (!user) return;
    toast(`Account activated via Microsoft SSO — welcome, ${user.firstName}!`, '🎉');
    navigate('#/login');
  });

  // Google SSO placeholder
  app.querySelector('#accept-google-btn')?.addEventListener('click', () => {
    // Future integration: call authenticateGoogle() with invitation context.
    console.info('[Lumio Auth] Google SSO activation — integration point (not yet wired)');
    const user = acceptInvitation(token);
    if (!user) return;
    toast(`Account activated via Google SSO — welcome, ${user.firstName}!`, '🎉');
    navigate('#/login');
  });

  app.querySelector('#accept-invite-back')?.addEventListener('click', () => {
    navigate('#/login');
  });
}

/* ---------------- SYSTEM INFORMATION ---------------- */
const SYSTEM_INFO_FIELDS = [
  { key: 'platformVersion', label: 'Platform Version' },
  { key: 'buildNumber', label: 'Build Number' },
  { key: 'databaseVersion', label: 'Database Version' },
  { key: 'installationDate', label: 'Installation Date', date: true },
  { key: 'licenseInfo', label: 'License Information' },
];

function workspaceSystemTab() {
  const info = LumioState.workspace.systemInfo;
  return `
    <div class="card card-pad mb-24">
      <div class="prop-section-title">System Information</div>
      <div class="flex-col gap-8">
        ${SYSTEM_INFO_FIELDS.map((f, i) => `
          <div class="flex justify-between items-center" style="padding:8px 0; ${i < SYSTEM_INFO_FIELDS.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
            <span class="text-sm text-muted">${f.label}</span>
            <span class="text-sm" style="font-weight:600;">${f.date ? formatDateLong(info[f.key]) : escapeHtml(String(info[f.key]))}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
