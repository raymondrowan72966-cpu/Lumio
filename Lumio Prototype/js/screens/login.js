/* ============================================================
   LOGIN SCREEN
   Backed by LumioAuth (see app.js) — Google/Microsoft/Apple are mock
   providers (Phase 8 of the Auth Architecture Sprint); Email is a real
   local register/sign-in flow against LumioState.users[]. No data leaves
   the browser; no real OAuth SDK is connected yet.
   ============================================================ */

// Official brand marks for the SSO sign-in buttons. Inline SVG so sizing,
// alignment, and DPI rendering are consistent and theme-safe.
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
  apple: `<svg class="social-icon" viewBox="0 0 384 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#000" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C53.3 141 0 184.5 0 271.5c0 32.4 5.9 65.9 17.7 100.5 15.8 45.9 72.8 158.2 132.2 156.4 31.1-.8 53-22 93.5-22 39.2 0 59.5 22 93.5 22 59.9-.9 111.6-103.5 126.6-149.5-80.2-37.8-64.8-110.9-64.8-110.2zM254.7 90.3c33-39 30-74.5 29-87.3-29.5 1.7-63.6 19.8-82.8 42.1-21.2 24.1-33.7 53.9-31 87 32.1 2.5 61.4-14 84.8-41.8z"/>
  </svg>`,
};

let LumioLoginMode = 'signin'; // 'signin' | 'register'

function renderLogin() {
  LumioLoginMode = 'signin';
  paintLogin();
}

function paintLogin() {
  const app = document.getElementById('app');
  const isRegister = LumioLoginMode === 'register';
  app.innerHTML = `
    <div class="login-shell" style="display:flex; min-height:100vh; background:var(--surface-50); position:relative; overflow:hidden;">

      <!-- Left: Approved Lumio Backdrop Artwork -->
      <div class="login-backdrop" style="flex:1 1 0%; position:relative; z-index:1; min-width:0; overflow:hidden; background:var(--surface-50);">
        <img src="assets/lumio-login-backdrop.png" alt="Lumio — Learn. Design. Inspire."
          style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:30% center; display:block;" />

        <div class="glass-card login-logo-badge" style="position:absolute; top:28px; left:28px; padding:8px 16px 8px 8px; display:flex; align-items:center; gap:10px;">
          <img src="assets/lumio-logo-transparent.png" alt="Lumio logo" style="width:40px; height:40px; border-radius:10px; object-fit:cover; display:block;" />
          <span style="font-weight:700; font-size:17px; font-family:var(--font-display); color:var(--ink-900); letter-spacing:0.04em;">LUMIO</span>
        </div>

        <div class="glass-card login-info-pill" style="position:absolute; top:28px; right:28px; max-width:280px; padding:12px 16px; display:flex; align-items:center; gap:10px;">
          <span style="font-size:18px; flex-shrink:0;">✨</span>
          <p style="font-size:12px; line-height:1.4; color:var(--ink-900);"><strong>New here?</strong> No experience required — Lumio teaches you as you go.</p>
        </div>
      </div>

      <!-- Right: Auth Card -->
      <div class="login-auth" style="flex:0 1 35%; max-width:560px; min-width:420px; background:var(--surface-0); display:flex; flex-direction:column; justify-content:center; padding:88px 48px 32px; box-shadow:-8px 0 32px rgba(31,27,58,0.04); position:relative; z-index:1;">

        <h2 style="font-size:24px; margin-bottom:8px;">${isRegister ? 'Create your account ✨' : 'Welcome back 👋'}</h2>
        <p class="text-muted mb-24" style="font-size:14px;">${isRegister ? 'Set up a new Lumio account with email.' : 'Sign in to your Lumio workspace.'}</p>

        <div id="login-feedback" class="text-sm mb-16" style="display:none; padding:10px 12px; border-radius:8px; background:#FEEAEA; color:#E5484D;"></div>

        ${isRegister ? `
        <div class="flex gap-16" style="flex-wrap:wrap;">
          <div class="field" style="flex:1; min-width:160px;">
            <label>First Name</label>
            <input class="input" id="login-first-name" type="text" placeholder="Jordan" />
          </div>
          <div class="field" style="flex:1; min-width:160px;">
            <label>Last Name</label>
            <input class="input" id="login-last-name" type="text" placeholder="Reyes" />
          </div>
        </div>` : ''}

        <div class="field">
          <label>Email Address</label>
          <div class="input-icon-wrap">
            <span class="icon">✉️</span>
            <input class="input" id="login-email" type="email" placeholder="you@company.com" value="${isRegister ? '' : 'raymondrowan72966@gmail.com'}" />
          </div>
        </div>
        <div class="field">
          <label>Password</label>
          <div class="input-icon-wrap">
            <span class="icon">🔒</span>
            <input class="input" id="login-password" type="password" placeholder="${isRegister ? 'Create a password (min. 6 characters)' : 'Enter your password'}" value="${isRegister ? '' : 'md@7296666'}" />
          </div>
        </div>
        ${!isRegister ? `
        <div class="flex justify-between items-center mb-16" style="font-size:13px;">
          <label class="flex items-center gap-8" style="cursor:pointer;">
            <input type="checkbox" id="login-remember-me" checked /> Remember me
          </label>
          <a href="#" onclick="return false;">Forgot password?</a>
        </div>` : '<div class="mb-16"></div>'}
        <button class="btn btn-primary w-full btn-lg" id="signin-btn">${isRegister ? 'Create Account →' : 'Sign In →'}</button>

        <p class="text-sm text-muted mt-16" style="text-align:center;">
          ${isRegister
            ? `Already have an account? <a href="#" id="login-toggle-mode">Sign in</a>`
            : `New to Lumio? <a href="#" id="login-toggle-mode">Create an account</a>`}
        </p>

        <div class="flex items-center gap-12 mt-24 mb-16" style="color:var(--ink-400); font-size:12px;">
          <div style="flex:1; height:1px; background:var(--border);"></div>
          OR
          <div style="flex:1; height:1px; background:var(--border);"></div>
        </div>

        <div class="flex-col gap-8">
          <button class="btn btn-secondary w-full social-login-btn" id="google-signin-btn">${SOCIAL_ICONS.google} Continue with Google</button>
          <button class="btn btn-secondary w-full social-login-btn" id="microsoft-signin-btn">${SOCIAL_ICONS.microsoft} Continue with Microsoft</button>
          <button class="btn btn-secondary w-full social-login-btn" id="apple-signin-btn">${SOCIAL_ICONS.apple} Continue with Apple</button>
        </div>

      </div>

      <style>
        .login-logo-badge, .login-info-pill { box-shadow: var(--shadow-soft); }
      </style>
    </div>
  `;

  bindLoginEvents();
}

function bindLoginEvents() {
  const app = document.getElementById('app');
  const isRegister = LumioLoginMode === 'register';

  const showError = (msg) => {
    const el = app.querySelector('#login-feedback');
    el.textContent = msg;
    el.style.display = 'block';
  };

  app.querySelector('#login-toggle-mode').addEventListener('click', (e) => {
    e.preventDefault();
    LumioLoginMode = isRegister ? 'signin' : 'register';
    paintLogin();
  });

  app.querySelector('#signin-btn').addEventListener('click', () => {
    const email = app.querySelector('#login-email').value.trim();
    const password = app.querySelector('#login-password').value;

    if (isRegister) {
      const firstName = app.querySelector('#login-first-name').value.trim();
      const lastName = app.querySelector('#login-last-name').value.trim();
      const result = LumioAuth.registerEmail(email, password, firstName, lastName, true);
      if (!result.ok) { showError(result.reason); return; }
      toast(`Welcome to Lumio, ${result.user.displayName}!`, '🎉');
      navigate('#/welcome');
      return;
    }

    const rememberMe = app.querySelector('#login-remember-me').checked;
    const result = LumioAuth.loginWithEmail(email, password, rememberMe);
    if (!result.ok) { showError(result.reason); return; }
    navigate('#/welcome');
  });

  const rememberCheckbox = app.querySelector('#login-remember-me');
  const syncRememberMe = () => { LumioUI.rememberMe = rememberCheckbox ? rememberCheckbox.checked : true; };

  app.querySelector('#microsoft-signin-btn').addEventListener('click', () => { syncRememberMe(); authenticateMicrosoft(); });
  app.querySelector('#google-signin-btn').addEventListener('click', () => { syncRememberMe(); authenticateGoogle(); });
  app.querySelector('#apple-signin-btn').addEventListener('click', () => { syncRememberMe(); authenticateApple(); });
}
