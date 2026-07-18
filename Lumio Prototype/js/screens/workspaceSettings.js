/* ============================================================
   WORKSPACE SETTINGS (Workspace Owners only)
   Administrative area: workspace user management (roles,
   status, invitations) and read-only system information.
   ============================================================ */

const WORKSPACE_SETTINGS_TABS = [
  { id: 'users',      label: 'Users' },
  { id: 'governance', label: 'Governance' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'system',     label: 'System Information' },
];

let workspaceSettingsTab = 'users';

// Sprint 16: Appearance Manager editor state.
// null        = Manager list view.
// { mode: 'create', draftName: '', snapshot: {...} }
// { mode: 'edit',   id: '...', draftName: '', snapshot: {...} }
let _wsAppearanceEditorState = null;

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
    case 'users':      host.innerHTML = workspaceUsersTab();      bindWorkspaceUsersTab();      break;
    case 'governance': host.innerHTML = workspaceGovernanceTab(); bindWorkspaceReviewsTab();    break;
    case 'appearance': host.innerHTML = workspaceAppearanceTab(); bindWorkspaceAppearanceTab(); break;
    case 'system':     host.innerHTML = workspaceSystemTab();                                   break;
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
      ${showComment && p.reviewComments ? `<div class="text-sm mt-8" style="padding:8px 10px; background:var(--color-destructive-tint); border-radius:var(--r-sm);">"${escapeHtml(p.reviewComments)}"</div>` : ''}
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
    if (!result.ok) { toast(result.reason, platformIcon('warning')); return; }
    toast(`"${projectDisplayTitle(p)}" approved`, platformIcon('success'));
    renderWorkspaceSettingsTab();
  }));
  host.querySelectorAll('[data-review-reject]').forEach(btn => btn.addEventListener('click', async () => {
    const p = LumioState.projects.find(x => x.id === btn.dataset.reviewReject);
    let comment = null;
    while (comment === null || !comment.trim()) {
      comment = await promptModal('A comment is required when rejecting a submission', '');
      if (comment === null) return; // cancelled
      if (!comment.trim()) toast('A comment is required to reject a submission.', platformIcon('warning'));
    }
    const result = transitionProjectStatus(p, 'reject', comment);
    if (!result.ok) { toast(result.reason, platformIcon('warning')); return; }
    toast(`"${projectDisplayTitle(p)}" rejected`, platformIcon('restore'));
    renderWorkspaceSettingsTab();
  }));
}

/* ══════════════════════════════════════════════════════════════════
   APPEARANCE TAB — Sprint 9
   Single place for all workspace visual identity controls.

   Architecture contract:
   • All CSS token writes go through applyWorkspaceIdentity() only.
   • All icon renders go through platformIcon() only.
   • All logo renders go through renderWorkspaceLogo() only.
   • This tab never reads --ws-* tokens directly.
   • This tab never writes to _IC_PATHS, _IC_EMOJI, or BUILTIN_THEMES.
   ══════════════════════════════════════════════════════════════════ */

// ── Icon Pack constants ───────────────────────────────────────────

// Active selectable packs (COMPLETE status only).
const _SELECTABLE_ICON_PACKS = [
  { id: 'lumio',   name: 'Lumio',   description: 'Friendly colourful emoji icons.' },
  { id: 'outline', name: 'Outline', description: 'Modern SVG outline icons.' },
];

// Future packs — displayed disabled to communicate roadmap capability.
const _COMING_SOON_ICON_PACKS = [
  { id: 'sketch',    name: 'Sketch',    description: 'Hand-crafted illustrated line art with a distinctive drawn feel.' },
  { id: 'corporate', name: 'Corporate', description: 'Clean professional glyphs for enterprise environments.' },
  { id: 'rounded',   name: 'Rounded',   description: 'Soft rounded strokes for a friendly, approachable interface.' },
  { id: 'filled',    name: 'Filled',    description: 'Solid filled shapes for high-contrast, bold interfaces.' },
  { id: 'minimal',   name: 'Minimal',   description: 'Ultra-thin strokes for sophisticated minimal designs.' },
];

// ── Logo slot specifications ──────────────────────────────────────
// Source of truth for the Logos section display. Slot keys match LOGO_SLOTS values.
// maxW / maxH: canvas fit-inside bounds used by _processLogoFile().
const _LOGO_SLOT_SPECS = [
  { slot: 'sidebar',       label: 'Sidebar Icon',    desc: 'Left navigation sidebar icon.',                                        size: '34 × 34 px',    fmt: 'PNG · SVG',         maxW: 68,  maxH: 68,  accept: 'image/png,image/svg+xml' },
  { slot: 'sidebar-large', label: 'Sidebar — Large', desc: 'Featured logo on Projects and Hub when the sidebar is expanded.',      size: '140 × 40 px',   fmt: 'PNG · SVG',         maxW: 280, maxH: 80,  accept: 'image/png,image/svg+xml' },
  { slot: 'compact',       label: 'Compact',         desc: 'Topbar logo in Course Builder, Wizard, and Learner Preview.',          size: '32 × 32 px',    fmt: 'PNG · SVG',         maxW: 64,  maxH: 64,  accept: 'image/png,image/svg+xml' },
  { slot: 'welcome',       label: 'Welcome Screen',  desc: 'Post-login welcome and onboarding tour screen.',                      size: '240 × 240 px',  fmt: 'PNG · SVG · JPG',   maxW: 480, maxH: 480, accept: 'image/png,image/svg+xml,image/jpeg' },
];
// Login branding slots — owned by _wsLoginBrandSection(), not in _LOGO_SLOT_SPECS.
const _LOGO_LOGIN_SPECS = [
  { slot: 'login-badge',      label: 'Login Badge',      fmt: 'PNG · SVG',       maxW: 80,   maxH: 80,   accept: 'image/png,image/svg+xml' },
  { slot: 'login-background', label: 'Login Background', fmt: 'PNG · JPG · SVG', maxW: 3840, maxH: 2160, accept: 'image/png,image/jpeg,image/svg+xml' },
];

const _LOGO_RESERVED_SPECS = [
  { slot: 'login-brand', label: 'Login Brand', desc: 'Full-width white-label login lockup. Architectural slot reserved — white-label login sprint.', size: '320 × 120 px', fmt: 'PNG · SVG' },
  { slot: 'favicon',     label: 'Favicon',     desc: 'Browser tab icon. Managed via <link rel="icon"> in index.html — outside application scope.',  size: '32 × 32 px',   fmt: 'ICO · PNG' },
];

// Maximum file size accepted for logo uploads (bytes).
const _LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

// ── Logo upload pipeline ──────────────────────────────────────────

/**
 * Process a File from an <input type="file"> into a data: URL sized to fit
 * inside the slot's canvas bounds (maxW × maxH), preserving transparency and
 * aspect ratio. SVGs are stored as-is (data:image/svg+xml;base64,...) because
 * rasterising them loses sharpness. Raster formats are drawn onto an offscreen
 * canvas and exported as PNG to guarantee lossless transparency.
 *
 * @param {File}   file  — the chosen File object
 * @param {object} spec  — one entry from _LOGO_SLOT_SPECS
 * @returns {Promise<string>} — resolves with a data: URL, rejects with a user-readable error string
 */
function _processLogoFile(file, spec) {
  return new Promise((resolve, reject) => {
    // ── Validation ────────────────────────────────────────────────
    const allowed = spec.accept.split(',').map(s => s.trim());
    if (!allowed.includes(file.type) && !(file.type === '' && file.name.endsWith('.svg'))) {
      return reject(`Unsupported file type "${file.type || file.name.split('.').pop()}". Accepted: ${spec.fmt}.`);
    }
    if (file.size > _LOGO_MAX_BYTES) {
      return reject(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 2 MB.`);
    }

    const reader = new FileReader();
    reader.onerror = () => reject('Could not read the file — please try again.');

    // SVG: store as-is without rasterising.
    if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
      return;
    }

    // Raster (PNG / JPG): fit-inside canvas resize → PNG data URL.
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject('Could not decode the image. Please check the file and try again.');
      img.onload = () => {
        const { maxW, maxH } = spec;
        // Fit-inside: scale down only, never up.
        const scale  = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
        const dw     = Math.round(img.naturalWidth  * scale);
        const dh     = Math.round(img.naturalHeight * scale);

        // Dimension guard — must produce at least 1×1.
        if (dw < 1 || dh < 1) return reject('Image dimensions are too small.');

        const canvas  = document.createElement('canvas');
        canvas.width  = dw;
        canvas.height = dh;
        const ctx     = canvas.getContext('2d');
        // Clear to transparent before drawing so PNG alpha is preserved.
        ctx.clearRect(0, 0, dw, dh);
        ctx.drawImage(img, 0, 0, dw, dh);

        try {
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          reject('Could not export the image. The file may be cross-origin or corrupted.');
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Commit a processed data: URL into workspaceIdentity.logos[slot], persist,
 * and cloud-sync. Then trigger live updates across the shell.
 */
function _commitLogoUpload(slot, dataUrl) {
  const identity = ensureWorkspaceIdentity();
  if (typeof identity.logos !== 'object' || identity.logos === null) identity.logos = {};
  identity.logos[slot] = dataUrl;
  saveLumioState();
  cloudSyncWorkspace('workspaceIdentity');
}

/**
 * Remove a custom logo from a slot, restoring the Lumio default fallback.
 */
function _removeLogoUpload(slot) {
  const identity = ensureWorkspaceIdentity();
  if (identity.logos && slot in identity.logos) {
    delete identity.logos[slot];
    saveLumioState();
    cloudSyncWorkspace('workspaceIdentity');
  }
}


// ── Helpers ───────────────────────────────────────────────────────

// Temporarily overrides iconPack state to call platformIcon() for card previews,
// then restores the original value. Never persists — safe to call mid-render.
function _packPreviewIcons(packId) {
  const identity = ensureWorkspaceIdentity();
  const saved    = identity.iconPack ? { ...identity.iconPack } : {};
  identity.iconPack = { packId };
  const html = ['projects', 'search', 'settings', 'notifications']
    .map(id => platformIcon(id)).join('');
  identity.iconPack = saved;
  return html;
}

// Apply an icon pack by id. Only COMPLETE packs are selectable.
// Mirrors the pattern of selectWorkspaceTheme() — writes to workspaceIdentity,
// persists to localStorage, and cloud-syncs. Callers re-render the screen
// so all platformIcon() call-sites in the DOM update simultaneously.
function selectWorkspaceIconPack(packId) {
  const allowed = _SELECTABLE_ICON_PACKS.map(p => p.id);
  if (!allowed.includes(packId)) {
    console.warn('[Lumio] Icon pack not available:', packId);
    return;
  }
  const identity = ensureWorkspaceIdentity();
  if (!identity.iconPack) identity.iconPack = {};
  identity.iconPack.packId = packId;
  saveLumioState();
  cloudSyncWorkspace('workspaceIdentity');
}

// Derive a short name from workspace name (first letter of each word, max 3).
function _deriveShortName(name) {
  const initials = (name || '').split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join('');
  return initials.slice(0, 3) || (name || 'WS').slice(0, 2).toUpperCase();
}

// ── Section builders ──────────────────────────────────────────────

function _wsPreviewSection() {
  const navItems  = ['projects', 'recent', 'settings', 'notifications'];
  const navLabels = ['Projects', 'Recent', 'Settings', 'Notifications'];
  const wsName    = getWorkspaceDisplayName();
  const navHtml   = navItems.map((id, i) => `
    <div class="ws-prev-nav${i === 0 ? ' ws-prev-nav--active' : ''}">
      <span class="ws-prev-nav__ic">${platformIcon(id)}</span>
      <span class="ws-prev-nav__label">${navLabels[i]}</span>
    </div>`).join('');

  return `
    <div class="card card-pad mb-24">
      <div class="ws-section-header mb-16">
        <div>
          <div class="prop-section-title mb-2">Live Preview</div>
          <p class="text-sm text-muted">Reflects your workspace name, active theme, icon pack, and logos. Updates immediately when you save changes.</p>
        </div>
      </div>
      <div class="ws-prev-frame">
        <div class="ws-prev-chrome">
          <span class="ws-prev-dot" style="background:#FF5F57;"></span>
          <span class="ws-prev-dot" style="background:#FFBD2E;"></span>
          <span class="ws-prev-dot" style="background:#28C840;"></span>
          <div class="ws-prev-url">${escapeHtml(wsName)} · Lumio</div>
        </div>
        <div class="ws-prev-shell">
          <div class="ws-prev-sidebar">
            <div class="ws-prev-sidebar__logo">
              ${renderWorkspaceLogo(LOGO_SLOTS.SIDEBAR)}
              <span class="ws-prev-sidebar__name">${escapeHtml(wsName)}</span>
            </div>
            <nav class="ws-prev-sidebar__nav">${navHtml}</nav>
          </div>
          <div class="ws-prev-main">
            <div class="ws-prev-topbar">
              <span class="ws-prev-topbar__title">All Projects</span>
              <div class="ws-prev-topbar__btn">+ New</div>
            </div>
            <div class="ws-prev-content">
              <div class="ws-prev-card">
                <div class="ws-prev-card__title">Onboarding Programme</div>
                <div class="ws-prev-card__meta">Draft · 5 lessons</div>
              </div>
              <div class="ws-prev-card">
                <div class="ws-prev-card__title">Compliance Training</div>
                <div class="ws-prev-card__meta">Published · 12 lessons</div>
              </div>
            </div>
          </div>
        </div>
        <div class="ws-prev-swatches">
          ${['primary','secondary','accent'].map(k => `
            <div class="ws-prev-swatch-cell">
              <div class="ws-prev-swatch" style="background:var(--ws-${k},#7C3AED);"></div>
              <span class="ws-prev-swatch-label">${k}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function _wsIdentitySection() {
  const identity  = ensureWorkspaceIdentity();
  const name      = getWorkspaceDisplayName();
  const shortName = getWorkspaceShortName();
  // Saved values for the inputs — blank string if the user hasn't set them yet
  // (in that case the resolved display value is shown as placeholder).
  const savedName      = identity.name      || '';
  const savedShortName = identity.shortName || '';
  return `
    <div class="card card-pad mb-24">
      <div class="ws-section-header mb-16">
        <div>
          <div class="prop-section-title mb-2">Workspace Identity</div>
          <p class="text-sm text-muted">Your workspace's name and branding identity.</p>
        </div>
      </div>
      <div class="ws-identity-row">
        <div class="ws-identity-logo-col">
          <div class="ws-identity-logo-frame">
            ${renderWorkspaceLogo(LOGO_SLOTS.SIDEBAR)}
          </div>
          <span class="ws-identity-logo-hint">Sidebar logo</span>
        </div>
        <div class="ws-identity-fields">
          <div class="ws-identity-field">
            <label class="ws-identity-label" for="ws-id-name">Workspace Name</label>
            <input
              class="ws-identity-input"
              id="ws-id-name"
              type="text"
              maxlength="60"
              value="${escapeHtml(savedName)}"
              placeholder="${escapeHtml(name)}"
              autocomplete="off"
            />
            <div class="ws-identity-input-error" id="ws-id-name-err"></div>
          </div>
          <div class="ws-identity-field">
            <label class="ws-identity-label" for="ws-id-short">Short Name</label>
            <input
              class="ws-identity-input ws-identity-input--short"
              id="ws-id-short"
              type="text"
              maxlength="8"
              value="${escapeHtml(savedShortName)}"
              placeholder="${escapeHtml(shortName)}"
              autocomplete="off"
            />
            <div class="ws-identity-note">Leave blank to auto-generate from initials.</div>
            <div class="ws-identity-input-error" id="ws-id-short-err"></div>
          </div>
          <div class="ws-identity-actions">
            <button class="btn btn-primary btn-sm" id="ws-id-save" disabled>Save Changes</button>
            <button class="btn btn-ghost btn-sm" id="ws-id-cancel" disabled>Cancel</button>
            <span class="ws-identity-save-feedback" id="ws-id-feedback" aria-live="polite"></span>
          </div>
        </div>
      </div>
    </div>`;
}

function _saveWorkspaceIdentityName() {
  const nameInput  = document.getElementById('ws-id-name');
  const shortInput = document.getElementById('ws-id-short');
  const nameErr    = document.getElementById('ws-id-name-err');
  const shortErr   = document.getElementById('ws-id-short-err');
  if (!nameInput || !shortInput) return;

  nameErr.textContent  = '';
  shortErr.textContent = '';

  const rawName  = nameInput.value.trim();
  const rawShort = shortInput.value.trim();
  let valid = true;

  if (rawName.length > 60) {
    nameErr.textContent = 'Workspace name must be 60 characters or fewer.';
    valid = false;
  }
  if (rawShort.length > 8) {
    shortErr.textContent = 'Short name must be 8 characters or fewer.';
    valid = false;
  }
  if (!valid) return;

  const identity   = ensureWorkspaceIdentity();
  identity.name      = rawName;
  identity.shortName = rawShort;
  saveLumioState();
  cloudSyncWorkspace('workspaceIdentity');

  // Re-render the full shell first (replaces DOM), then find the new
  // feedback element in the rebuilt DOM and show "Saved" there.
  renderWorkspaceSettings();
  const newFeedback = document.getElementById('ws-id-feedback');
  if (newFeedback) {
    newFeedback.textContent = 'Saved';
    setTimeout(() => { const el = document.getElementById('ws-id-feedback'); if (el) el.textContent = ''; }, 2000);
  }
}

// Parse rgba(r,g,b,a) from a box-shadow string. Returns { hex, strength }.
function _parseShadow(shadowStr) {
  const m = (shadowStr || '').match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!m) return { hex: '#1f1b3a', strength: 0.06 };
  const r = Math.round(parseFloat(m[1])), g = Math.round(parseFloat(m[2])), b = Math.round(parseFloat(m[3]));
  const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  return { hex, strength: m[4] != null ? parseFloat(m[4]) : 1 };
}

// Rebuild box-shadow preserving existing offsets/blur, replacing color+alpha.
function _buildShadow(existingCss, hex, strength) {
  const prefix = (existingCss || '0 8px 24px').replace(/rgba?\([^)]*\)/i, '').trim() || '0 8px 24px';
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `${prefix} rgba(${r}, ${g}, ${b}, ${parseFloat(strength).toFixed(2)})`;
}

function _wsThemeSection(selectedTheme) {
  const themeCard = (theme) => {
    const isSelected = theme.id === selectedTheme;
    const t = theme.tokens;
    return `
      <div class="ws-theme-card${isSelected ? ' ws-theme-card--selected' : ''}" data-select-theme="${theme.id}" role="button" tabindex="0" aria-pressed="${isSelected}">
        <div class="ws-theme-card__preview">
          <div class="ws-tc-sidebar" style="background:${t.sidebarBg};border-right:1.5px solid ${t.border};"></div>
          <div class="ws-tc-main" style="background:${t.surfaceAlt};">
            <div class="ws-tc-topbar" style="background:${t.topbarBg};border-bottom:1px solid ${t.border};"></div>
            <div class="ws-tc-body">
              <div class="ws-tc-bar" style="background:${t.primary};"></div>
              <div class="ws-tc-bar ws-tc-bar--sm" style="background:${t.accent};"></div>
              <div class="ws-tc-bar ws-tc-bar--xs" style="background:${t.border};"></div>
            </div>
          </div>
        </div>
        <div class="ws-theme-card__footer">
          <span class="ws-theme-card__name">${escapeHtml(theme.name)}</span>
          ${theme.locked ? '<span class="pill pill-grey" style="font-size:10px;padding:2px 6px;">Built-in</span>' : ''}
          ${isSelected ? '<span class="ws-theme-card__check">✓</span>' : ''}
        </div>
      </div>`;
  };

  const isCustom = selectedTheme === 'custom';
  const ct = isCustom
    ? (ensureWorkspaceIdentity().theme || {})
    : (BUILTIN_THEMES.find(t => t.id === 'lumio') || BUILTIN_THEMES[0]).tokens;

  const customCard = `
    <div class="ws-theme-card${isCustom ? ' ws-theme-card--selected' : ''}" data-select-theme="custom" role="button" tabindex="0" aria-pressed="${isCustom}">
      <div class="ws-theme-card__preview">
        <div class="ws-tc-sidebar" style="background:${ct.sidebarBg || '#fff'};border-right:1.5px solid ${ct.border || '#eee'};"></div>
        <div class="ws-tc-main" style="background:${ct.surfaceAlt || '#f9f9f9'};">
          <div class="ws-tc-topbar" style="background:${ct.topbarBg || '#fff'};border-bottom:1px solid ${ct.border || '#eee'};"></div>
          <div class="ws-tc-body">
            <div class="ws-tc-bar" style="background:${ct.primary || '#7C3AED'};"></div>
            <div class="ws-tc-bar ws-tc-bar--sm" style="background:${ct.accent || '#06B6D4'};"></div>
            <div class="ws-tc-bar ws-tc-bar--xs" style="background:${ct.border || '#E5E5EE'};"></div>
          </div>
        </div>
      </div>
      <div class="ws-theme-card__footer">
        <span class="ws-theme-card__name">Custom</span>
        ${isCustom ? '<span class="ws-theme-card__check">✓</span>' : ''}
      </div>
    </div>`;

  // Token definitions: key → { label, type }.
  // 'color' tokens use <input type="color"> with hex values.
  // 'text' tokens use <input type="text"> for freeform CSS values.
  // 'shadow' token uses a visual colour + intensity editor.
  const _CTE_TOKENS = [
    { key: 'primary',    label: 'Primary',            type: 'color'  },
    { key: 'secondary',  label: 'Secondary',          type: 'color'  },
    { key: 'accent',     label: 'Accent',             type: 'color'  },
    { key: 'surface',    label: 'Surface',            type: 'color'  },
    { key: 'surfaceAlt', label: 'Surface Alt',        type: 'color'  },
    { key: 'border',     label: 'Border',             type: 'color'  },
    { key: 'text',       label: 'Text',               type: 'color'  },
    { key: 'textMuted',  label: 'Muted Text',         type: 'color'  },
    { key: 'sidebarBg',  label: 'Sidebar Background', type: 'color'  },
    { key: 'topbarBg',   label: 'Topbar Background',  type: 'color'  },
    { key: 'icon',       label: 'Icon Colour',        type: 'color'  },
    { key: 'radius',     label: 'Radius',             type: 'text'   },
    { key: 'shadow',     label: 'Shadow',             type: 'shadow' },
  ];

  const cteRows = _CTE_TOKENS.map(({ key, label, type }) => {
    const val = ct[key] || '';
    if (type === 'color') {
      return `
        <div class="ws-cte-row">
          <label class="ws-cte-label" for="ws-cte-${key}">${escapeHtml(label)}</label>
          <input class="ws-cte-color-input" id="ws-cte-${key}" type="color" value="${escapeHtml(val)}" data-token="${key}" />
          <span class="ws-cte-hex" id="ws-cte-hex-${key}">${escapeHtml(val)}</span>
        </div>`;
    }
    if (type === 'shadow') {
      const { hex, strength } = _parseShadow(val || '0 8px 24px rgba(31,27,58,0.06)');
      const pct = Math.round(strength * 100);
      return `
        <div class="ws-cte-row ws-cte-row--shadow">
          <label class="ws-cte-label">Shadow</label>
          <div class="ws-cte-shadow-editor">
            <input type="color" class="ws-cte-color-input ws-cte-shadow-color" id="ws-cte-shadow-color" value="${escapeHtml(hex)}" title="Shadow colour" />
            <input type="range" class="ws-cte-shadow-range" id="ws-cte-shadow-strength" min="0" max="40" step="1" value="${Math.round(strength * 100)}" title="Shadow intensity" />
            <span class="ws-cte-hex ws-cte-shadow-pct" id="ws-cte-shadow-pct">${pct}%</span>
          </div>
        </div>`;
    }
    return `
      <div class="ws-cte-row">
        <label class="ws-cte-label" for="ws-cte-${key}">${escapeHtml(label)}</label>
        <input class="ws-cte-text-input" id="ws-cte-${key}" type="text" value="${escapeHtml(val)}" data-token="${key}" placeholder="e.g. 20px" autocomplete="off" />
      </div>`;
  }).join('');

  const customEditor = isCustom ? `
    <div class="ws-cte-panel mt-16" id="ws-custom-theme-editor">
      <div class="ws-cte-grid">
        ${cteRows}
      </div>
    </div>` : '';

  return `
    <div class="card card-pad mb-24">
      <div class="ws-section-header mb-4">
        <div>
          <div class="prop-section-title mb-2">Workspace Theme</div>
          <p class="text-sm text-muted">Controls the colour palette of the platform shell. Course themes are completely separate and unaffected.</p>
        </div>
      </div>
      <div class="ws-theme-grid mt-16">
        ${BUILTIN_THEMES.map(themeCard).join('')}
        ${customCard}
      </div>
      ${customEditor}
    </div>`;
}

function _wsPackSection(selectedPack) {
  const packCard = (pack) => {
    const isSelected = pack.id === selectedPack;
    const preview    = _packPreviewIcons(pack.id);
    return `
      <div class="ws-pack-card${isSelected ? ' ws-pack-card--selected' : ''}" data-select-pack="${pack.id}" role="button" tabindex="0" aria-pressed="${isSelected}">
        <div class="ws-pack-card__preview">${preview}</div>
        <div class="ws-pack-card__footer">
          <span class="ws-pack-card__name">${escapeHtml(pack.name)}</span>
          <span class="pill pill-grey" style="font-size:10px;padding:2px 6px;">Built-in</span>
          ${isSelected ? '<span class="ws-theme-card__check">✓</span>' : ''}
        </div>
        <div class="ws-pack-card__desc">${escapeHtml(pack.description)}</div>
      </div>`;
  };

  const customPackCard = `
    <div class="ws-pack-card ws-pack-card--disabled" aria-disabled="true">
      <div class="ws-pack-card__preview ws-pack-card__preview--empty"></div>
      <div class="ws-pack-card__footer">
        <span class="ws-pack-card__name">Custom</span>
        <span class="pill pill-grey" style="font-size:10px;padding:2px 6px;">Coming Soon</span>
      </div>
      <div class="ws-pack-card__desc">Upload a custom SVG icon pack for your workspace.</div>
    </div>`;

  return `
    <div class="card card-pad mb-24">
      <div class="ws-section-header mb-4">
        <div>
          <div class="prop-section-title mb-2">Icon Pack</div>
          <p class="text-sm text-muted">Controls icon artwork throughout the platform interface. Course content icons are not affected.</p>
        </div>
      </div>
      <div class="ws-pack-grid mt-16">
        ${_SELECTABLE_ICON_PACKS.map(packCard).join('')}
        ${customPackCard}
      </div>
    </div>`;
}

// Render an upload slot card. hasCustom = whether a non-fallback logo is set.
function _wsLogoSlotCard(spec, hasCustom) {
  const logoHtml = renderWorkspaceLogo(spec.slot);
  const maxMB    = (_LOGO_MAX_BYTES / 1024 / 1024).toFixed(0);
  return `
    <div class="ws-logo-slot-card" data-logo-slot="${escapeHtml(spec.slot)}">
      <div class="ws-logo-slot-preview">
        <div class="ws-logo-slot-img-wrap">${logoHtml}</div>
      </div>
      <div class="ws-logo-slot-body">
        <div class="ws-logo-slot-name">${escapeHtml(spec.label)}</div>
        <div class="ws-logo-slot-desc">${escapeHtml(spec.desc)}</div>
        <div class="ws-logo-slot-specs">
          <span class="ws-logo-slot-spec">${escapeHtml(spec.size)}</span>
          <span class="ws-logo-slot-spec">${escapeHtml(spec.fmt)}</span>
          <span class="ws-logo-slot-spec">Max ${maxMB} MB</span>
        </div>
        <div class="ws-logo-upload-error" id="ws-logo-err-${escapeHtml(spec.slot)}" role="alert" aria-live="polite"></div>
        <div class="ws-logo-slot-actions">
          <label class="btn btn-secondary btn-sm ws-logo-upload-label" title="Upload a custom logo for this slot">
            ${hasCustom ? 'Replace' : 'Upload'}
            <input type="file" class="ws-logo-file-input" accept="${escapeHtml(spec.accept)}" data-upload-slot="${escapeHtml(spec.slot)}" aria-label="Upload logo for ${escapeHtml(spec.label)}" />
          </label>
          ${hasCustom ? `<button class="btn btn-ghost btn-sm ws-logo-remove-btn" data-remove-slot="${escapeHtml(spec.slot)}" title="Remove custom logo and restore default" aria-label="Remove logo for ${escapeHtml(spec.label)}">Remove</button>` : ''}
        </div>
      </div>
    </div>`;
}

function _wsLogoSection() {
  const logos   = ensureWorkspaceIdentity().logos || {};
  const FALLBACK = 'assets/lumio-logo-transparent.png';

  return `
    <div class="card card-pad mb-24">
      <div class="ws-section-header mb-4">
        <div>
          <div class="prop-section-title mb-2">Workspace Logos</div>
          <p class="text-sm text-muted">Upload custom logos for each platform context. Changing a logo updates every location where it appears — no manual updates required.</p>
        </div>
      </div>
      <div class="ws-logo-slot-grid mt-16">
        ${_LOGO_SLOT_SPECS.map(spec => _wsLogoSlotCard(spec, !!(logos[spec.slot] && logos[spec.slot] !== FALLBACK))).join('')}
      </div>
    </div>`;
}

function _wsLoginBrandSection() {
  const logos        = ensureWorkspaceIdentity().logos || {};
  const FALLBACK     = 'assets/lumio-logo-transparent.png';
  const maxMB        = (_LOGO_MAX_BYTES / 1024 / 1024).toFixed(0);
  const badgeSpec    = _LOGO_LOGIN_SPECS.find(s => s.slot === 'login-badge');
  const bgSpec       = _LOGO_LOGIN_SPECS.find(s => s.slot === 'login-background');
  const hasBadge     = !!(logos['login-badge']      && logos['login-badge']      !== FALLBACK);
  const hasBg        = !!(logos['login-background']);
  const bgSrc        = logos['login-background'] || 'assets/lumio-login-backdrop.png';

  return `
    <div class="card card-pad mb-24">
      <div class="ws-section-header mb-4">
        <div>
          <div class="prop-section-title mb-2">Login Branding</div>
          <p class="text-sm text-muted">Customise how the login screen presents your workspace. Changes appear on the login page immediately.</p>
        </div>
      </div>
      <div class="ws-login-brand-layout mt-16">
        <div class="ws-login-mini-frame">
          <div class="ws-login-mini-chrome">
            <span class="ws-prev-dot" style="background:#FF5F57;"></span>
            <span class="ws-prev-dot" style="background:#FFBD2E;"></span>
            <span class="ws-prev-dot" style="background:#28C840;"></span>
          </div>
          <div class="ws-login-mini-body">
            <div class="ws-login-mini-backdrop">
              <img src="${escapeHtml(bgSrc)}" alt="" />
              <div class="ws-login-mini-badge">${renderWorkspaceLogo(LOGO_SLOTS.LOGIN_BADGE)}</div>
            </div>
            <div class="ws-login-mini-auth">
              <div class="ws-login-mini-heading">Welcome back</div>
              <div class="ws-login-mini-field"></div>
              <div class="ws-login-mini-field"></div>
              <div class="ws-login-mini-btn" style="background:var(--ws-primary,#7C3AED);">Sign In</div>
            </div>
          </div>
        </div>
        <div class="ws-login-brand-slots">
          <div class="ws-logo-slot-card" data-logo-slot="login-badge" style="flex:1;">
            <div class="ws-logo-slot-preview" style="background:var(--surface-alt);">
              <div class="ws-logo-slot-img-wrap">${renderWorkspaceLogo(LOGO_SLOTS.LOGIN_BADGE)}</div>
            </div>
            <div class="ws-logo-slot-body">
              <div class="ws-logo-slot-name">Login Badge <span class="pill pill-teal" style="font-size:10px;padding:1px 6px;margin-left:4px;">Live</span></div>
              <div class="ws-logo-slot-desc">Brand badge displayed in the login page backdrop corner.</div>
              <div class="ws-logo-slot-specs">
                <span class="ws-logo-slot-spec">40 × 40 px</span>
                <span class="ws-logo-slot-spec">PNG · SVG</span>
                <span class="ws-logo-slot-spec">Max ${maxMB} MB</span>
              </div>
              <div class="ws-logo-upload-error" id="ws-logo-err-login-badge-brand" role="alert" aria-live="polite"></div>
              <div class="ws-logo-slot-actions">
                <label class="btn btn-secondary btn-sm ws-logo-upload-label" title="Upload a custom login badge">
                  ${hasBadge ? 'Replace' : 'Upload'}
                  <input type="file" class="ws-logo-file-input" accept="${escapeHtml(badgeSpec.accept)}" data-upload-slot="login-badge" aria-label="Upload login badge" />
                </label>
                ${hasBadge ? `<button class="btn btn-ghost btn-sm ws-logo-remove-btn" data-remove-slot="login-badge" title="Remove custom badge and restore default">Remove</button>` : ''}
              </div>
            </div>
          </div>
          <div class="ws-logo-slot-card" data-logo-slot="login-background" style="flex:1;">
            <div class="ws-logo-slot-preview" style="background:var(--surface-alt); overflow:hidden; padding:0; position:relative;">
              ${hasBg
                ? `<img src="${escapeHtml(logos['login-background'])}" alt="" style="width:100%; height:100%; object-fit:cover; display:block;" />`
                : `<img src="assets/lumio-login-backdrop.png" alt="" style="width:100%; height:100%; object-fit:cover; display:block; opacity:0.5;" />`}
            </div>
            <div class="ws-logo-slot-body">
              <div class="ws-logo-slot-name">Login Background <span class="pill pill-teal" style="font-size:10px;padding:1px 6px;margin-left:4px;">Live</span></div>
              <div class="ws-logo-slot-desc">Full-bleed image covering the left panel of the login page. Defaults to the Lumio artwork.</div>
              <div class="ws-logo-slot-specs">
                <span class="ws-logo-slot-spec">Any size</span>
                <span class="ws-logo-slot-spec">PNG · JPG · SVG</span>
                <span class="ws-logo-slot-spec">Max ${maxMB} MB</span>
              </div>
              <div class="ws-logo-upload-error" id="ws-logo-err-login-background" role="alert" aria-live="polite"></div>
              <div class="ws-logo-slot-actions">
                <label class="btn btn-secondary btn-sm ws-logo-upload-label" title="Upload a custom login background">
                  ${hasBg ? 'Replace' : 'Upload'}
                  <input type="file" class="ws-logo-file-input" accept="${escapeHtml(bgSpec.accept)}" data-upload-slot="login-background" aria-label="Upload login background" />
                </label>
                ${hasBg ? `<button class="btn btn-ghost btn-sm ws-logo-remove-btn" data-remove-slot="login-background" title="Remove custom background and restore Lumio artwork">Remove</button>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

// ── Appearance Manager ────────────────────────────────────────────────────────

function _wsAppearanceManager() {
  const identity    = ensureWorkspaceIdentity();
  const profiles    = identity.profiles || {};
  const activeId    = identity.activeProfileId || 'default';
  const customList  = Object.values(profiles);
  const customCount = customList.length;

  // Build mini preview strip from token values.
  const _previewStrip = (primary, sidebarBg, surfaceAlt, border) => `
    <div class="ws-ap-card__preview-sidebar" style="background:${sidebarBg};"></div>
    <div class="ws-ap-card__preview-main" style="background:${surfaceAlt};">
      <div style="height:6px;background:${primary};border-radius:2px;margin-bottom:4px;width:60%;"></div>
      <div style="height:4px;background:${border};border-radius:2px;width:40%;"></div>
    </div>`;

  const lumioTheme   = BUILTIN_THEMES.find(t => t.id === 'lumio') || BUILTIN_THEMES[0];
  const lt           = lumioTheme.tokens;
  const isDefaultActive = activeId === 'default';

  const defaultCard = `
    <div class="ws-ap-card${isDefaultActive ? ' ws-ap-card--active' : ''}"
         data-ap-activate="default" role="button" tabindex="0"
         title="${isDefaultActive ? 'Currently active' : 'Click to activate'}">
      <div class="ws-ap-card__preview">
        ${_previewStrip(lt.primary, lt.sidebarBg, lt.surfaceAlt, lt.border)}
      </div>
      <div class="ws-ap-card__footer">
        <div style="min-width:0;flex:1;">
          <div class="ws-ap-card__name">Lumio</div>
          <div class="ws-ap-card__subtitle">Default</div>
        </div>
        ${isDefaultActive ? '<span class="ws-ap-card__active-badge">✓ Active</span>' : ''}
      </div>
    </div>`;

  const customCards = customList.map(p => {
    const isActive   = p.id === activeId;
    const baseTheme  = BUILTIN_THEMES.find(t => t.id === p.selectedThemeId) || BUILTIN_THEMES[0];
    const t          = (p.theme && Object.keys(p.theme).length) ? p.theme : baseTheme.tokens;
    return `
      <div class="ws-ap-card${isActive ? ' ws-ap-card--active' : ''}" data-ap-id="${escapeHtml(p.id)}">
        <div class="ws-ap-card__preview">
          ${_previewStrip(t.primary, t.sidebarBg, t.surfaceAlt, t.border)}
        </div>
        <div class="ws-ap-card__footer">
          <div class="ws-ap-card__meta">
            <div class="ws-ap-card__name">${escapeHtml(p.name)}</div>
            ${isActive ? '<div class="ws-ap-card__status">✓ Active</div>' : ''}
          </div>
          <div class="ws-ap-overflow-wrap">
            <button class="ws-ap-overflow-btn" data-ap-menu="${escapeHtml(p.id)}" aria-label="Options for ${escapeHtml(p.name)}">⋯</button>
            <div class="ws-ap-menu" id="ws-ap-menu-${escapeHtml(p.id)}" hidden>
              ${isActive
                ? `<div class="ws-ap-menu-active-row">✓ Active</div>
                   <div class="ws-ap-menu-divider"></div>`
                : `<button class="ws-ap-menu-item" data-ap-activate="${escapeHtml(p.id)}">Activate</button>
                   <div class="ws-ap-menu-divider"></div>`}
              <button class="ws-ap-menu-item" data-ap-edit="${escapeHtml(p.id)}">Edit</button>
              <button class="ws-ap-menu-item" data-ap-dupe="${escapeHtml(p.id)}">Duplicate</button>
              <button class="ws-ap-menu-item ws-ap-menu-item--danger" data-ap-delete="${escapeHtml(p.id)}">Delete</button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  const addCard = customCount < 2 ? `
    <div class="ws-ap-card ws-ap-card--add" id="ws-ap-add-btn" role="button" tabindex="0">
      <div class="ws-ap-card__preview ws-ap-card__preview--add">
        <div class="ws-ap-card__add-icon">+</div>
      </div>
      <div class="ws-ap-card__footer">
        <div class="ws-ap-card__add-label">Add Appearance</div>
      </div>
    </div>` : '';

  return `
    <div class="ws-page-section">Workspace Appearance</div>
    <div class="ws-ap-grid mb-32">
      ${defaultCard}
      ${customCards}
      ${addCard}
    </div>`;
}

// ── Appearance Editor ─────────────────────────────────────────────────────────

function _wsAppearanceEditor(state) {
  const identity      = ensureWorkspaceIdentity();
  const selectedTheme = identity.selectedThemeId || 'lumio';
  const selectedPack  = identity.iconPack?.packId || 'lumio';
  const draftName     = state.draftName || '';
  const isNew         = state.mode === 'create';

  return `
    <div class="ws-editor-chrome">
      <div class="ws-editor-header mb-24">
        <div class="prop-section-title">${isNew ? 'New Appearance' : 'Edit Appearance'}</div>
        <div class="ws-editor-header-actions">
          <button class="btn btn-ghost btn-sm" id="ws-ap-editor-cancel">Cancel</button>
          <button class="btn btn-primary btn-sm" id="ws-ap-editor-save">Save Appearance</button>
        </div>
      </div>
      <div class="card card-pad mb-24">
        <div class="prop-section-title mb-2">Appearance Name</div>
        <p class="text-sm text-muted mb-12">Used to identify this appearance in the Appearance Manager.</p>
        <input class="ws-identity-input" id="ws-ap-name-input" type="text" maxlength="60"
               value="${escapeHtml(draftName)}" placeholder="e.g. Compliance Academy" autocomplete="off" />
        <div class="ws-identity-input-error" id="ws-ap-name-err"></div>
      </div>
      ${_wsIdentitySection()}
      <div class="ws-page-section">Workspace Branding</div>
      ${_wsLogoSection()}
      ${_wsLoginBrandSection()}
      <div class="ws-page-section">Theme &amp; Icons</div>
      ${_wsThemeSection(selectedTheme)}
      ${_wsPackSection(selectedPack)}
      <div class="ws-page-section">Live Preview</div>
      ${_wsPreviewSection()}
    </div>`;
}

// ── Tab dispatcher ────────────────────────────────────────────────────────────

function workspaceAppearanceTab() {
  if (_wsAppearanceEditorState) return _wsAppearanceEditor(_wsAppearanceEditorState);
  return _wsAppearanceManager();
}

// ── Binding: shared section logic (theme, pack, logos, identity name) ─────────

function _bindWorkspaceAppearanceSections() {
  const host = document.getElementById('ws-tab-content');
  if (!host) return;

  // ── Workspace Identity (name / short name) ────────────────────
  {
    const identity   = ensureWorkspaceIdentity();
    const nameInput  = host.querySelector('#ws-id-name');
    const shortInput = host.querySelector('#ws-id-short');
    const saveBtn    = host.querySelector('#ws-id-save');
    const cancelBtn  = host.querySelector('#ws-id-cancel');

    if (nameInput && shortInput && saveBtn && cancelBtn) {
      let shortNameUserOwned = !!(identity.shortName);

      function _wsIdUpdateButtons() {
        const dirty =
          nameInput.value.trim()  !== (identity.name      || '') ||
          shortInput.value.trim() !== (identity.shortName || '');
        saveBtn.disabled   = !dirty;
        cancelBtn.disabled = !dirty;
      }

      nameInput.addEventListener('input', () => {
        if (!shortNameUserOwned) {
          const n = nameInput.value.trim();
          const initials = n.split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join('');
          shortInput.placeholder = initials.slice(0, 3) || n.slice(0, 2).toUpperCase() || '';
        }
        _wsIdUpdateButtons();
      });

      shortInput.addEventListener('input', () => {
        shortNameUserOwned = true;
        _wsIdUpdateButtons();
      });

      saveBtn.addEventListener('click', _saveWorkspaceIdentityName);

      cancelBtn.addEventListener('click', () => {
        nameInput.value  = identity.name      || '';
        shortInput.value = identity.shortName || '';
        host.querySelector('#ws-id-name-err').textContent  = '';
        host.querySelector('#ws-id-short-err').textContent = '';
        shortNameUserOwned = !!(identity.shortName);
        if (!shortNameUserOwned) {
          const n = nameInput.value.trim();
          const initials = n.split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join('');
          shortInput.placeholder = initials.slice(0, 3) || n.slice(0, 2).toUpperCase() || getWorkspaceShortName();
        }
        _wsIdUpdateButtons();
      });
    }
  }

  // ── Theme selection ───────────────────────────────────────────
  host.querySelectorAll('[data-select-theme]').forEach(card => {
    const activate = () => {
      selectWorkspaceTheme(card.dataset.selectTheme);
      renderWorkspaceSettings();
    };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
  });

  // ── Icon pack selection ───────────────────────────────────────
  host.querySelectorAll('[data-select-pack]').forEach(card => {
    const activate = () => {
      selectWorkspaceIconPack(card.dataset.selectPack);
      renderWorkspaceSettings();
    };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
  });

  // ── Custom theme editor ───────────────────────────────────────
  // Color inputs: live preview on input, persist on change (picker close).
  host.querySelectorAll('.ws-cte-color-input[data-token]').forEach(input => {
    input.addEventListener('input', () => {
      const identity = ensureWorkspaceIdentity();
      if (!identity.theme) identity.theme = {};
      identity.theme[input.dataset.token] = input.value;
      applyWorkspaceIdentity();
      const hexEl = host.querySelector(`#ws-cte-hex-${input.dataset.token}`);
      if (hexEl) hexEl.textContent = input.value;
    });
    input.addEventListener('change', () => {
      saveLumioState();
      cloudSyncWorkspace('workspaceIdentity');
    });
  });
  // Text inputs (radius): live preview + persist on change.
  host.querySelectorAll('.ws-cte-text-input[data-token]').forEach(input => {
    input.addEventListener('input', () => {
      const identity = ensureWorkspaceIdentity();
      if (!identity.theme) identity.theme = {};
      identity.theme[input.dataset.token] = input.value;
      applyWorkspaceIdentity();
    });
    input.addEventListener('change', () => {
      saveLumioState();
      cloudSyncWorkspace('workspaceIdentity');
    });
  });

  // ── Shadow visual editor ──────────────────────────────────────
  (function() {
    const colorPicker = host.querySelector('#ws-cte-shadow-color');
    const strengthSlider = host.querySelector('#ws-cte-shadow-strength');
    const pctLabel = host.querySelector('#ws-cte-shadow-pct');
    if (!colorPicker || !strengthSlider) return;

    function _applyCurrentShadow() {
      const identity = ensureWorkspaceIdentity();
      if (!identity.theme) identity.theme = {};
      const existing = identity.theme.shadow || '0 8px 24px rgba(31,27,58,0.06)';
      const strength = parseInt(strengthSlider.value, 10) / 100;
      identity.theme.shadow = _buildShadow(existing, colorPicker.value, strength);
      applyWorkspaceIdentity();
      if (pctLabel) pctLabel.textContent = strengthSlider.value + '%';
    }

    colorPicker.addEventListener('input', _applyCurrentShadow);
    strengthSlider.addEventListener('input', _applyCurrentShadow);
    colorPicker.addEventListener('change', () => { saveLumioState(); cloudSyncWorkspace('workspaceIdentity'); });
    strengthSlider.addEventListener('change', () => { saveLumioState(); cloudSyncWorkspace('workspaceIdentity'); });
  })();

  // ── Logo file inputs ──────────────────────────────────────────
  host.querySelectorAll('.ws-logo-file-input[data-upload-slot]').forEach(input => {
    input.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const slot   = input.dataset.uploadSlot;
      const spec   = [..._LOGO_SLOT_SPECS, ..._LOGO_LOGIN_SPECS].find(s => s.slot === slot);
      if (!spec) return;

      // Show loading state on the upload label.
      const label  = input.closest('label');
      const origTxt = label ? label.childNodes[0].textContent.trim() : '';
      if (label) label.childNodes[0].textContent = 'Processing…';

      // Clear any previous error for this slot (both error elements if duplicated in Login Branding).
      host.querySelectorAll(`[id^="ws-logo-err-${slot}"]`).forEach(el => { el.textContent = ''; el.classList.remove('ws-logo-upload-error--visible'); });

      _processLogoFile(file, spec)
        .then(dataUrl => {
          _commitLogoUpload(slot, dataUrl);
          // Full re-render of the settings page updates Logos cards, Login Branding,
          // and the Live Preview. _refreshLogoInstances already updated sidebar/topbar.
          renderWorkspaceSettings();
        })
        .catch(errMsg => {
          // Restore label text.
          if (label) label.childNodes[0].textContent = origTxt;
          // Display inline error beneath the upload button.
          const errEl = host.querySelector(`#ws-logo-err-${slot}, [id^="ws-logo-err-${slot}"]`);
          if (errEl) {
            errEl.textContent = errMsg;
            errEl.classList.add('ws-logo-upload-error--visible');
          }
          // Reset the file input so the same file can be retried.
          input.value = '';
        });
    });
  });

  // ── Logo remove buttons ───────────────────────────────────────
  host.querySelectorAll('.ws-logo-remove-btn[data-remove-slot]').forEach(btn => {
    btn.addEventListener('click', () => {
      const slot = btn.dataset.removeSlot;
      _removeLogoUpload(slot);
      renderWorkspaceSettings();
    });
  });
}

// Dispatcher — called by renderWorkspaceSettingsTab().
function bindWorkspaceAppearanceTab() {
  if (_wsAppearanceEditorState) {
    bindWorkspaceAppearanceEditor();
  } else {
    bindWorkspaceAppearanceManager();
  }
}

// ── Binding: Appearance Manager ───────────────────────────────────────────────

function bindWorkspaceAppearanceManager() {
  const host = document.getElementById('ws-tab-content');
  if (!host) return;

  // Snapshot the current flat identity before entering the editor.
  function _snapshotIdentity() {
    const id = ensureWorkspaceIdentity();
    return {
      selectedThemeId: id.selectedThemeId,
      theme:    { ...(id.theme    || {}) },
      logos:    { ...(id.logos    || {}) },
      iconPack: { ...(id.iconPack || {}) },
      name:     id.name      || '',
      shortName:id.shortName || '',
    };
  }

  // Load a source object into the flat mirror and apply CSS.
  function _loadIntoMirror(src) {
    const id = ensureWorkspaceIdentity();
    id.selectedThemeId = src.selectedThemeId || 'lumio';
    id.theme    = { ...(src.theme    || {}) };
    id.logos    = { ...(src.logos    || {}) };
    id.iconPack = { ...(src.iconPack || { packId: 'lumio' }) };
    id.name     = src.name      || '';
    id.shortName= src.shortName || '';
    applyWorkspaceIdentity();
  }

  // ── + Add Appearance ──────────────────────────────────────────
  const addBtn = host.querySelector('#ws-ap-add-btn');
  if (addBtn) {
    const openCreate = () => {
      const snapshot = _snapshotIdentity();
      // Reset flat mirror to Lumio defaults for the new appearance canvas.
      const lumioTheme = BUILTIN_THEMES.find(t => t.id === 'lumio') || BUILTIN_THEMES[0];
      _loadIntoMirror({
        selectedThemeId: lumioTheme.id,
        theme:    { ...lumioTheme.tokens },
        logos:    {},
        iconPack: { packId: 'lumio' },
        name:     '',
        shortName:'',
      });
      _wsAppearanceEditorState = { mode: 'create', draftName: '', snapshot };
      renderWorkspaceSettings();
    };
    addBtn.addEventListener('click', openCreate);
    addBtn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCreate(); } });
  }

  // ── Default card click (activate) ────────────────────────────
  host.querySelectorAll('[data-ap-activate="default"]').forEach(el => {
    el.addEventListener('click', () => {
      if ((ensureWorkspaceIdentity().activeProfileId || 'default') === 'default') return;
      selectAppearanceProfile('default');
      renderWorkspaceSettings();
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
  });

  // ── Activate (now inside overflow menu) ──────────────────────
  host.querySelectorAll('[data-ap-activate]:not([data-ap-activate="default"])').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _closeAllMenus();
      selectAppearanceProfile(btn.dataset.apActivate);
      renderWorkspaceSettings();
    });
  });

  // ── Overflow menu: close helper ───────────────────────────────
  function _closeAllMenus() {
    host.querySelectorAll('.ws-ap-menu').forEach(m => { m.hidden = true; });
  }

  // ── Overflow menu: toggle ─────────────────────────────────────
  host.querySelectorAll('.ws-ap-overflow-btn[data-ap-menu]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id      = btn.dataset.apMenu;
      const menu    = host.querySelector(`#ws-ap-menu-${id}`);
      if (!menu) return;
      const opening = menu.hidden;
      _closeAllMenus();
      menu.hidden = !opening;
    });
  });

  // ── Overflow menu: close on outside click ─────────────────────
  function _onOutsideClick(e) {
    if (!e.target.closest('.ws-ap-overflow-wrap')) _closeAllMenus();
  }
  document.addEventListener('click', _onOutsideClick);
  // Remove listener when the host is replaced (next renderWorkspaceSettings).
  new MutationObserver(() => {
    if (!document.contains(host)) {
      document.removeEventListener('click', _onOutsideClick);
    }
  }).observe(document.body, { childList: true, subtree: true });

  // ── Overflow menu: close on Escape ───────────────────────────
  function _onEscape(e) {
    if (e.key === 'Escape') { _closeAllMenus(); }
  }
  document.addEventListener('keydown', _onEscape);
  new MutationObserver(() => {
    if (!document.contains(host)) {
      document.removeEventListener('keydown', _onEscape);
    }
  }).observe(document.body, { childList: true, subtree: true });

  // ── Edit ──────────────────────────────────────────────────────
  host.querySelectorAll('[data-ap-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id      = btn.dataset.apEdit;
      const profile = (ensureWorkspaceIdentity().profiles || {})[id];
      if (!profile) return;
      const snapshot = _snapshotIdentity();
      _loadIntoMirror({
        selectedThemeId: profile.selectedThemeId,
        theme:    profile.theme,
        logos:    profile.logos,
        iconPack: profile.iconPack,
        name:     profile.wsName,
        shortName:profile.wsShortName,
      });
      _wsAppearanceEditorState = { mode: 'edit', id, draftName: profile.name, snapshot };
      renderWorkspaceSettings();
    });
  });

  // ── Duplicate ─────────────────────────────────────────────────
  host.querySelectorAll('[data-ap-dupe]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id      = btn.dataset.apDupe;
      const identity = ensureWorkspaceIdentity();
      const profile  = (identity.profiles || {})[id];
      if (!profile) return;
      if (Object.keys(identity.profiles || {}).length >= 2) return;
      const snapshot = _snapshotIdentity();
      _loadIntoMirror({
        selectedThemeId: profile.selectedThemeId,
        theme:    profile.theme,
        logos:    profile.logos,
        iconPack: profile.iconPack,
        name:     profile.wsName,
        shortName:profile.wsShortName,
      });
      _wsAppearanceEditorState = { mode: 'create', draftName: profile.name + ' (Copy)', snapshot };
      renderWorkspaceSettings();
    });
  });

  // ── Delete ────────────────────────────────────────────────────
  host.querySelectorAll('[data-ap-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id       = btn.dataset.apDelete;
      const identity = ensureWorkspaceIdentity();
      if (!identity.profiles || !identity.profiles[id]) return;
      const wasActive = identity.activeProfileId === id;
      delete identity.profiles[id];
      if (wasActive) {
        selectAppearanceProfile('default'); // also saves + syncs
      } else {
        saveLumioState();
        cloudSyncWorkspace('workspaceIdentity');
      }
      renderWorkspaceSettings();
    });
  });
}

// ── Binding: Appearance Editor ────────────────────────────────────────────────

function bindWorkspaceAppearanceEditor() {
  const host  = document.getElementById('ws-tab-content');
  const state = _wsAppearanceEditorState;
  if (!host || !state) return;

  // Track draft name changes so re-renders preserve the typed value.
  const nameInput = host.querySelector('#ws-ap-name-input');
  if (nameInput) {
    nameInput.addEventListener('input', () => { state.draftName = nameInput.value; });
  }

  // ── Cancel ────────────────────────────────────────────────────
  const cancelBtn = host.querySelector('#ws-ap-editor-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      // Restore the snapshot so the live workspace reverts to what it was.
      const identity = ensureWorkspaceIdentity();
      const snap     = state.snapshot;
      identity.selectedThemeId = snap.selectedThemeId;
      identity.theme    = snap.theme;
      identity.logos    = snap.logos;
      identity.iconPack = snap.iconPack;
      identity.name     = snap.name;
      identity.shortName= snap.shortName;
      applyWorkspaceIdentity();
      _wsAppearanceEditorState = null;
      renderWorkspaceSettings();
    });
  }

  // ── Save ──────────────────────────────────────────────────────
  const saveBtn = host.querySelector('#ws-ap-editor-save');
  const nameErr = host.querySelector('#ws-ap-name-err');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const rawName = nameInput ? nameInput.value.trim() : (state.draftName || '').trim();
      if (!rawName) {
        if (nameErr) nameErr.textContent = 'Please enter an appearance name.';
        if (nameInput) nameInput.focus();
        return;
      }
      if (nameErr) nameErr.textContent = '';

      const identity = ensureWorkspaceIdentity();
      if (!identity.profiles) identity.profiles = {};

      const id = state.mode === 'edit' ? state.id : ('custom-' + Date.now());

      // Persist a snapshot of the current flat mirror as the profile.
      identity.profiles[id] = {
        id,
        name:            rawName,
        selectedThemeId: identity.selectedThemeId || 'lumio',
        theme:           { ...(identity.theme    || {}) },
        logos:           { ...(identity.logos    || {}) },
        iconPack:        { ...(identity.iconPack || { packId: 'lumio' }) },
        wsName:          identity.name      || '',
        wsShortName:     identity.shortName || '',
      };

      // Activate the newly created profile.
      if (state.mode === 'create') identity.activeProfileId = id;

      saveLumioState();
      cloudSyncWorkspace('workspaceIdentity');
      _wsAppearanceEditorState = null;
      renderWorkspaceSettings();
    });
  }

  // Wire all existing section interactions (identity name, theme, pack, logos).
  _bindWorkspaceAppearanceSections();
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
        <button class="btn btn-ghost btn-sm text-destructive" data-user-remove="${user.id}">🗑️ Remove</button>
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
        <button class="btn btn-ghost btn-sm text-destructive" data-invite-revoke="${inv.id}">🗑️ Revoke</button>
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
    addNotification(workspace.ownerId, `${canonicalUser.displayName || canonicalUser.email} accepted your invitation and joined as Administrator.`, null, {
      type: 'system', dest: { route: 'workspace-settings' },
    });
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
        toast('At least one Workspace Owner is required. Promote another user before changing this role.', platformIcon('warning'));
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
          toast('You cannot disable your own account.', platformIcon('warning'));
          return;
        }
        if (user.role === ROLE_WORKSPACE_OWNER && workspaceOwnerCount() <= 1) {
          toast('At least one Workspace Owner is required. You cannot disable the only remaining Workspace Owner.', platformIcon('warning'));
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
          toast('You are the only Workspace Owner — at least one Workspace Owner is required.', platformIcon('warning'));
        } else {
          toast('You cannot remove your own account.', platformIcon('warning'));
        }
        return;
      }
      if (user.role === ROLE_WORKSPACE_OWNER && workspaceOwnerCount() <= 1) {
        toast('At least one Workspace Owner is required. You cannot remove the only remaining Workspace Owner.', platformIcon('warning'));
        return;
      }

      // Removes this user's MEMBERSHIP in the current workspace only — their
      // users[] account (and any other workspace they belong to) is
      // untouched. This is the correct semantics now that users[] is the
      // sole user repository: "Remove" here always meant "remove from this
      // workspace," never "delete the account."
      const ws = getCurrentWorkspace();
      if (ws) LumioState.workspaceMemberships = LumioState.workspaceMemberships.filter(m => !(m.userId === id && m.workspaceId === ws.id));
      toast(`Removed ${user.firstName} ${user.lastName}`, platformIcon('delete'));
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
      feedback.style.color = ok ? 'var(--color-success)' : 'var(--color-destructive)';
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
    addNotification(invitation.invitedBy, `Invitation sent to ${email} as ${ROLE_LABELS[role]}.`, null, {
      type: 'system', dest: { route: 'workspace-settings' },
    });

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

  // Password visibility toggle + caps lock for invitation password fields.
  ['#accept-password', '#accept-password-confirm'].forEach(function (sel) {
    const el = app.querySelector(sel);
    if (el) {
      LumioPasswordField.attachToggle(el);
      LumioPasswordField.attachCapsLock(el);
    }
  });

  // Local account: validate + create password
  app.querySelector('#accept-activate-btn')?.addEventListener('click', () => {
    const pw = app.querySelector('#accept-password').value;
    const pw2 = app.querySelector('#accept-password-confirm').value;
    const fb = app.querySelector('#accept-password-feedback');
    const show = (msg, ok) => { fb.textContent = msg; fb.style.display = 'block'; fb.style.color = ok ? 'var(--color-success)' : 'var(--color-destructive)'; };
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

