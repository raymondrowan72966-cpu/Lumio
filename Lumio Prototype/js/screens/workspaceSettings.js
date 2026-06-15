/* ============================================================
   WORKSPACE SETTINGS (Owners only)
   Administrative area: workspace user management (roles,
   status, invitations) and read-only system information.
   ============================================================ */

const WORKSPACE_SETTINGS_TABS = [
  { id: 'users', label: 'Users' },
  { id: 'system', label: 'System Information' },
];

let workspaceSettingsTab = 'users';
let workspaceInviteRole = 'admin';

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
    case 'system': host.innerHTML = workspaceSystemTab(); break;
  }
}

/* ---------------- USERS ---------------- */
// Resolves a workspace member by id, whether that's the signed-in user or
// one of the other workspace members in LumioState.adminUsers.
function getWorkspaceUser(id) {
  if (LumioState.currentUser.id === id) return LumioState.currentUser;
  return LumioState.adminUsers.find(u => u.id === id);
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
      <div class="flex gap-12" style="align-items:flex-end; flex-wrap:wrap;">
        <div class="field" style="flex:1; min-width:240px; margin-bottom:0;">
          <label>Email Address</label>
          <input class="input" id="ws-invite-email" type="email" placeholder="name@company.com" />
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Role</label>
          <div class="seg-control" id="ws-invite-role">
            <button type="button" class="${workspaceInviteRole === 'admin' ? 'active' : ''}" data-role="admin">Admin</button>
            <button type="button" class="${workspaceInviteRole === 'owner' ? 'active' : ''}" data-role="owner">Owner</button>
          </div>
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
  const isSelf = user.id === LumioState.currentUser.id;
  return `
    <div class="flex items-center gap-12" style="padding:10px 0; border-bottom:1px solid var(--border);" data-user-row="${user.id}">
      ${avatarHtml(user, 36)}
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; font-size:13px; color:var(--ink-900);">${escapeHtml(`${user.firstName} ${user.lastName}`.trim())}${isSelf ? ' <span class="text-muted" style="font-weight:400;">(You)</span>' : ''}</div>
        <div class="text-muted" style="font-size:12px;">${escapeHtml(user.email)}</div>
      </div>
      <select class="input" style="width:110px; padding:6px 8px; font-size:12px;" data-user-role="${user.id}">
        <option value="owner" ${user.role === 'owner' ? 'selected' : ''}>Owner</option>
        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
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
  return `
    <div class="flex items-center gap-12" style="padding:10px 0; border-bottom:1px solid var(--border);" data-invite-row="${inv.id}">
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; font-size:13px; color:var(--ink-900);">${escapeHtml(inv.email)}</div>
        <div class="text-muted" style="font-size:12px; word-break:break-all;">${escapeHtml(inv.link)}</div>
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

// Placeholder hook for sending the invitation email. Wire up a real email
// service here (e.g. an API call to a transactional email provider) — the
// invitation record (email, role, token, link) is already generated and stored.
function sendInvitationEmail(invitation) {
  console.info(`[Lumio] Invitation email would be sent to ${invitation.email}: ${invitation.link}`);
}

// Accepts a pending invitation by token, creating a new workspace member
// with the role chosen at invite time. Returns the new user, or null if the
// invitation token is invalid/already used.
function acceptInvitation(token) {
  const inv = LumioState.invitations.find(i => i.token === token && i.status === 'pending');
  if (!inv) return null;

  const namePart = inv.email.split('@')[0] || 'New';
  const firstName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
  const user = {
    id: generateUniqueId('u'),
    firstName,
    lastName: 'User',
    email: inv.email,
    avatar: null,
    role: inv.role,
    status: 'active',
  };
  LumioState.adminUsers.push(user);
  inv.status = 'accepted';
  scheduleLumioSave();
  return user;
}

function bindWorkspaceUsersTab() {
  const app = document.getElementById('app');

  app.querySelectorAll('#ws-invite-role button').forEach(btn => {
    btn.addEventListener('click', () => {
      workspaceInviteRole = btn.dataset.role;
      app.querySelectorAll('#ws-invite-role button').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  app.querySelectorAll('[data-user-role]').forEach(sel => {
    sel.addEventListener('change', () => {
      const id = sel.dataset.userRole;
      const user = getWorkspaceUser(id);
      if (!user) return;
      const newRole = sel.value;
      if (newRole === user.role) return;

      if (user.role === 'owner' && newRole === 'admin' && workspaceOwnerCount() <= 1) {
        sel.value = user.role;
        toast('At least one Owner is required. Promote another user to Owner before changing this role.', '⚠️');
        return;
      }

      user.role = newRole;
      toast(`${user.firstName} ${user.lastName} is now ${ROLE_LABELS[newRole]}`, '🔄');
      renderWorkspaceSettings();
      scheduleLumioSave();
    });
  });

  app.querySelectorAll('[data-user-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.userToggle;
      const user = getWorkspaceUser(id);
      if (!user) return;
      const isSelf = id === LumioState.currentUser.id;

      if (user.status === 'active') {
        if (isSelf) {
          toast('You cannot disable your own account.', '⚠️');
          return;
        }
        if (user.role === 'owner' && workspaceOwnerCount() <= 1) {
          toast('At least one Owner is required. You cannot disable the only remaining Owner.', '⚠️');
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
      const isSelf = id === LumioState.currentUser.id;

      if (isSelf) {
        if (user.role === 'owner' && workspaceOwnerCount() <= 1) {
          toast('You are the only Owner — at least one Owner is required.', '⚠️');
        } else {
          toast('You cannot remove your own account.', '⚠️');
        }
        return;
      }
      if (user.role === 'owner' && workspaceOwnerCount() <= 1) {
        toast('At least one Owner is required. You cannot remove the only remaining Owner.', '⚠️');
        return;
      }

      LumioState.adminUsers = LumioState.adminUsers.filter(u => u.id !== id);
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
    const input = app.querySelector('#ws-invite-email');
    const feedback = app.querySelector('#ws-invite-feedback');
    const email = input.value.trim();
    const role = workspaceInviteRole;

    const showFeedback = (msg, ok) => {
      feedback.textContent = msg;
      feedback.style.display = 'block';
      feedback.style.color = ok ? '#22A06B' : '#E5484D';
    };

    if (!email) {
      showFeedback('Please enter an email address.', false);
      return;
    }
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
    const invitation = {
      id: generateUniqueId('i'),
      email,
      role,
      token,
      link,
      status: 'pending',
      createdAt: Date.now(),
    };
    LumioState.invitations.push(invitation);
    sendInvitationEmail(invitation);

    input.value = '';
    showFeedback(`Invitation sent to ${email} as ${ROLE_LABELS[role]}.`, true);
    toast('Invitation created', '✉️');
    renderWorkspaceSettings();
    scheduleLumioSave();
  });
}

/* ---------------- ACCEPT INVITATION ---------------- */
// Standalone screen reached via an invitation link (#/accept-invite/:token).
// Accepting adds a new workspace member with the role chosen at invite time.
function renderAcceptInvite(token) {
  const inv = LumioState.invitations.find(i => i.token === token && i.status === 'pending');
  const app = document.getElementById('app');
  document.getElementById('app')?.removeAttribute('style');

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
          <h2 style="font-size:20px; margin-bottom:8px;">You're invited to Lumio</h2>
          <p class="text-sm text-muted mb-16">Accept this invitation to join the workspace as <strong>${ROLE_LABELS[inv.role]}</strong>.</p>
          <button class="btn btn-primary w-full" id="accept-invite-btn">Accept Invitation</button>
        ` : `
          <div style="font-size:40px; margin-bottom:12px;">⚠️</div>
          <h2 style="font-size:20px; margin-bottom:8px;">Invitation not found</h2>
          <p class="text-sm text-muted mb-16">This invitation link is invalid or has already been used.</p>
          <button class="btn btn-secondary w-full" id="accept-invite-back">Back to Login</button>
        `}
      </div>
    </div>
  `;

  app.querySelector('#accept-invite-btn')?.addEventListener('click', () => {
    const user = acceptInvitation(token);
    if (!user) return;
    toast(`Invitation accepted — joined as ${ROLE_LABELS[user.role]}`, '🎉');
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
