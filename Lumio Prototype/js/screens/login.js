/* ============================================================
   LOGIN SCREEN
   ============================================================ */

// Official brand marks for social sign-in buttons. Inline SVG (not emoji)
// so sizing, alignment and DPI rendering are consistent and theme-safe.
const SOCIAL_ICONS = {
  google: `<svg class="social-icon" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.9C16.66 14.2 17.64 11.92 17.64 9.2z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.81.54-1.85.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.97v2.33A8.997 8.997 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.97A8.997 8.997 0 0 0 0 9c0 1.45.35 2.83.97 4.03l2.98-2.33z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58A8.59 8.59 0 0 0 9 0 8.997 8.997 0 0 0 .97 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z"/>
  </svg>`,
  microsoft: `<svg class="social-icon" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
  </svg>`,
  apple: `<svg class="social-icon" viewBox="0 0 17 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#000000" d="M14.07 10.6c-.03-2.07 1.7-3.07 1.78-3.12-.97-1.41-2.47-1.6-3-1.63-1.4-.14-2.6.79-3.27.79-.69 0-1.78-.77-2.93-.75-1.5.02-2.9.87-3.66 2.21-1.57 2.71-.4 6.93 1.13 9.2.75 1.1 1.64 2.34 2.81 2.29 1.13-.04 1.55-.73 2.92-.73 1.37 0 1.75.73 2.93.71 1.21-.02 1.98-1.1 2.72-2.2.85-1.27 1.2-2.5 1.22-2.57-.03-.01-2.34-.9-2.36-3.2zM11.5 3.6c.62-.75 1.04-1.79.92-2.83-.89.04-1.97.6-2.61 1.34-.57.65-1.07 1.71-.93 2.72.99.08 2-.5 2.62-1.23z"/>
  </svg>`,
};

function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-shell" style="display:flex; min-height:100vh; background:var(--surface-50); position:relative; overflow:hidden;">

      <!-- Left: Approved Lumio Backdrop Artwork — supports the login experience, ~55-60% of the screen -->
      <div class="login-backdrop" style="flex:1 1 0%; position:relative; z-index:1; min-width:0; overflow:hidden; background:var(--surface-50);">
        <img src="assets/lumio-login-backdrop.png" alt="Lumio — Learn. Design. Inspire."
          style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:30% center; display:block;" />

        <!-- Approved Lumio Logo -->
        <div class="glass-card login-logo-badge" style="position:absolute; top:28px; left:28px; padding:8px 16px 8px 8px; display:flex; align-items:center; gap:10px;">
          <img src="assets/lumio-logo-transparent.png" alt="Lumio logo" style="width:40px; height:40px; border-radius:10px; object-fit:cover; display:block;" />
          <span style="font-weight:700; font-size:17px; font-family:var(--font-display); color:var(--ink-900); letter-spacing:0.04em;">LUMIO</span>
        </div>

        <!-- "New here?" — compact pill in the top-right corner, complements rather than covers the artwork -->
        <div class="glass-card login-info-pill" style="position:absolute; top:28px; right:28px; max-width:280px; padding:12px 16px; display:flex; align-items:center; gap:10px;">
          <span style="font-size:18px; flex-shrink:0;">✨</span>
          <p style="font-size:12px; line-height:1.4; color:var(--ink-900);"><strong>New here?</strong> No experience required — Lumio teaches you as you go.</p>
        </div>
      </div>

      <!-- Right: Auth Card -->
      <div class="login-auth" style="flex:0 1 35%; max-width:560px; min-width:420px; background:var(--surface-0); display:flex; flex-direction:column; justify-content:center; padding:88px 48px 32px; box-shadow:-8px 0 32px rgba(31,27,58,0.04); position:relative; z-index:1;">
        <div class="tabs mb-24" id="auth-tabs">
          <div class="tab active" data-tab="signin">Sign In</div>
          <div class="tab" data-tab="register">Register</div>
        </div>

        <div id="auth-content"></div>
      </div>

      <style>
        .login-logo-badge, .login-info-pill { box-shadow: var(--shadow-soft); }
      </style>
    </div>
  `;

  renderAuthTab('signin');

  app.querySelectorAll('#auth-tabs .tab').forEach(t => {
    t.addEventListener('click', () => {
      app.querySelectorAll('#auth-tabs .tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      renderAuthTab(t.dataset.tab);
    });
  });
}

function renderAuthTab(tab) {
  const content = document.getElementById('auth-content');
  if (tab === 'signin') {
    content.innerHTML = `
      <h2 style="font-size:24px;">Welcome back! 👋</h2>
      <p class="text-muted mt-8 mb-24" style="font-size:14px;">Sign in to continue your learning journey with Lumio.</p>

      <div class="field">
        <label>Email address</label>
        <div class="input-icon-wrap">
          <span class="icon">✉️</span>
          <input class="input" type="email" placeholder="you@company.com" value="jordan@lumio.app" />
        </div>
      </div>
      <div class="field">
        <label>Password</label>
        <div class="input-icon-wrap">
          <span class="icon">🔒</span>
          <input class="input" type="password" placeholder="Enter your password" value="••••••••" />
        </div>
      </div>
      <div class="flex justify-between items-center mb-16" style="font-size:13px;">
        <label class="flex items-center gap-8" style="cursor:pointer;">
          <input type="checkbox" checked /> Remember me
        </label>
        <a href="#" onclick="return false;">Forgot password?</a>
      </div>
      <button class="btn btn-primary w-full btn-lg" id="signin-btn">Sign In →</button>

      <div class="flex items-center gap-12 mt-24 mb-16" style="color:var(--ink-400); font-size:12px;">
        <div style="flex:1; height:1px; background:var(--border);"></div>
        or continue with
        <div style="flex:1; height:1px; background:var(--border);"></div>
      </div>

      <div class="flex gap-8">
        <button class="btn btn-secondary w-full social-login-btn">${SOCIAL_ICONS.google} Google</button>
        <button class="btn btn-secondary w-full social-login-btn">${SOCIAL_ICONS.microsoft} Microsoft</button>
        <button class="btn btn-secondary w-full social-login-btn">${SOCIAL_ICONS.apple} Apple</button>
      </div>

      <p class="text-center text-sm text-muted mt-24">
        New to Lumio? <a href="#" id="create-account-link">Create an account</a>
      </p>
    `;
    document.getElementById('signin-btn').addEventListener('click', () => navigate('#/welcome'));
    document.getElementById('create-account-link').addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('#auth-tabs .tab').forEach(x => x.classList.remove('active'));
      document.querySelector('#auth-tabs .tab[data-tab="register"]').classList.add('active');
      renderAuthTab('register');
    });
  } else {
    content.innerHTML = `
      <h2 style="font-size:24px;">Create your account ✨</h2>
      <p class="text-muted mt-8 mb-24" style="font-size:14px;">Start turning your expertise into learning experiences.</p>

      <div class="field">
        <label>Full name</label>
        <div class="input-icon-wrap">
          <span class="icon">👤</span>
          <input class="input" type="text" placeholder="Your name" />
        </div>
      </div>
      <div class="field">
        <label>Email address</label>
        <div class="input-icon-wrap">
          <span class="icon">✉️</span>
          <input class="input" type="email" placeholder="you@company.com" />
        </div>
      </div>
      <div class="field">
        <label>Password</label>
        <div class="input-icon-wrap">
          <span class="icon">🔒</span>
          <input class="input" type="password" placeholder="Create a password" />
        </div>
      </div>
      <button class="btn btn-primary w-full btn-lg" id="register-btn">Create Account →</button>

      <p class="text-center text-sm text-muted mt-24">
        Already have an account? <a href="#" id="signin-link">Sign in</a>
      </p>
    `;
    document.getElementById('register-btn').addEventListener('click', () => navigate('#/welcome'));
    document.getElementById('signin-link').addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('#auth-tabs .tab').forEach(x => x.classList.remove('active'));
      document.querySelector('#auth-tabs .tab[data-tab="signin"]').classList.add('active');
      renderAuthTab('signin');
    });
  }
}
