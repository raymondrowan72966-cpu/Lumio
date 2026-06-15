/* ============================================================
   MY PROFILE
   First-class screen for the signed-in user: profile photo,
   personal details, account information, and security.
   ============================================================ */

function renderProfile() {
  const u = LumioState.currentUser;

  const content = `
    <header class="app-topbar">
      <div>
        <h2 style="font-size:20px;">My Profile</h2>
        <p class="text-sm text-muted">Manage your photo, personal details, and account security</p>
      </div>
    </header>
    <main class="app-content">
      ${ambientBlobs([
        ['var(--pastel-lavender)', '340px', '340px', '-100px', '-100px', null, null],
      ])}
      <div style="position:relative; z-index:1; max-width:720px;">

        <div class="card card-pad mb-24">
          <div class="prop-section-title">Profile Photo</div>
          <div class="flex items-center gap-16">
            <div id="profile-avatar-wrap">${avatarHtml(u, 72)}</div>
            <div class="flex gap-12" style="flex-wrap:wrap;">
              <button class="btn btn-secondary btn-sm" id="profile-photo-upload">${u.avatar ? '🔄 Replace Photo' : '📤 Upload Photo'}</button>
              ${u.avatar ? `<button class="btn btn-secondary btn-sm" id="profile-photo-remove" style="color:#E5484D;">🗑️ Remove Photo</button>` : ''}
            </div>
          </div>
        </div>

        <div class="card card-pad mb-24">
          <div class="prop-section-title">Personal Details</div>
          <div class="flex gap-16" style="flex-wrap:wrap;">
            <div class="field" style="flex:1; min-width:200px;">
              <label>First Name</label>
              <input class="input" id="profile-first-name" type="text" value="${escapeHtml(u.firstName)}" />
            </div>
            <div class="field" style="flex:1; min-width:200px;">
              <label>Last Name</label>
              <input class="input" id="profile-last-name" type="text" value="${escapeHtml(u.lastName)}" />
            </div>
          </div>
          <div class="field">
            <label>Email Address</label>
            <input class="input" id="profile-email" type="email" value="${escapeHtml(u.email)}" />
          </div>
        </div>

        <div class="card card-pad mb-24">
          <div class="prop-section-title">Account Information</div>
          <div class="flex-col gap-8">
            <div class="flex justify-between items-center" style="padding:8px 0; border-bottom:1px solid var(--border);">
              <span class="text-sm text-muted">User Role</span>
              <span class="pill ${u.role === 'owner' ? 'pill-indigo' : 'pill-cyan'}">${ROLE_LABELS[u.role]}</span>
            </div>
            <div class="flex justify-between items-center" style="padding:8px 0; border-bottom:1px solid var(--border);">
              <span class="text-sm text-muted">Date Joined</span>
              <span class="text-sm" style="font-weight:600;">${formatDateLong(u.dateJoined)}</span>
            </div>
            <div class="flex justify-between items-center" style="padding:8px 0;">
              <span class="text-sm text-muted">Last Login</span>
              <span class="text-sm" style="font-weight:600;">${formatDateLong(u.lastLogin)}</span>
            </div>
          </div>
        </div>

        <div class="card card-pad mb-24">
          <div class="prop-section-title">Security</div>
          <p class="text-sm text-muted mb-16">Change your password. You'll need to enter your current password to confirm.</p>
          <div class="field">
            <label>Current Password</label>
            <input class="input" id="profile-current-password" type="password" placeholder="Enter your current password" />
          </div>
          <div class="flex gap-16" style="flex-wrap:wrap;">
            <div class="field" style="flex:1; min-width:200px;">
              <label>New Password</label>
              <input class="input" id="profile-new-password" type="password" placeholder="Enter a new password" />
            </div>
            <div class="field" style="flex:1; min-width:200px;">
              <label>Confirm New Password</label>
              <input class="input" id="profile-confirm-password" type="password" placeholder="Re-enter the new password" />
            </div>
          </div>
          <div id="profile-password-feedback" class="text-sm mb-16" style="display:none;"></div>
          <button class="btn btn-primary btn-sm" id="profile-change-password">Change Password</button>
        </div>

      </div>
    </main>
  `;
  renderShell('profile', content);
  bindProfileEvents();
}

function bindProfileEvents() {
  const app = document.getElementById('app');
  const u = LumioState.currentUser;

  app.querySelector('#profile-first-name').addEventListener('input', (e) => {
    u.firstName = e.target.value;
  });
  app.querySelector('#profile-last-name').addEventListener('input', (e) => {
    u.lastName = e.target.value;
  });
  app.querySelector('#profile-email').addEventListener('input', (e) => {
    u.email = e.target.value;
  });

  app.querySelector('#profile-photo-upload').addEventListener('click', () => {
    openMediaPicker({
      title: 'Profile Photo',
      kind: 'image',
      currentSrc: u.avatar,
      currentFileName: null,
      onInsert: (result) => {
        u.avatar = result.src;
        renderProfile();
        scheduleLumioSave();
      },
      onRemove: () => {
        u.avatar = null;
        renderProfile();
        scheduleLumioSave();
      },
    });
  });

  app.querySelector('#profile-photo-remove')?.addEventListener('click', () => {
    u.avatar = null;
    renderProfile();
    scheduleLumioSave();
  });

  app.querySelector('#profile-change-password').addEventListener('click', () => {
    const current = app.querySelector('#profile-current-password').value;
    const next = app.querySelector('#profile-new-password').value;
    const confirm = app.querySelector('#profile-confirm-password').value;
    const feedback = app.querySelector('#profile-password-feedback');

    const showFeedback = (msg, ok) => {
      feedback.textContent = msg;
      feedback.style.display = 'block';
      feedback.style.color = ok ? '#22A06B' : '#E5484D';
    };

    if (!current || !next || !confirm) {
      showFeedback('Please fill in all three password fields.', false);
      return;
    }
    if (current !== u.password) {
      showFeedback('Current password is incorrect.', false);
      return;
    }
    if (next.length < 6) {
      showFeedback('New password must be at least 6 characters.', false);
      return;
    }
    if (next !== confirm) {
      showFeedback('New password and confirmation do not match.', false);
      return;
    }

    u.password = next;
    app.querySelector('#profile-current-password').value = '';
    app.querySelector('#profile-new-password').value = '';
    app.querySelector('#profile-confirm-password').value = '';
    showFeedback('Password updated successfully.', true);
    toast('Password updated', '🔒');
    scheduleLumioSave();
  });
}
