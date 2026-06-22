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

let LumioLoginMode = 'signin'; // 'signin' | 'register' | 'forgot'
// Forgot Password flow state (Account Management Finalization Sprint,
// Phase 4) — 'request' (enter email) -> 'sent' (link generated, no real
// email delivery exists so the link is shown directly on screen, same
// documented limitation as invitations).
let LumioForgotState = { step: 'request', link: null };

function renderLogin() {
  LumioLoginMode = 'signin';
  paintLogin();
}

function loginAuthCardShell(innerHtml) {
  return `
    <div class="login-shell" style="display:flex; min-height:100vh; background:var(--surface-50); position:relative; overflow:hidden;">
      <div class="login-backdrop" style="flex:1 1 0%; position:relative; z-index:1; min-width:0; overflow:hidden; background:var(--surface-50);">
        <img src="assets/lumio-login-backdrop.png" alt="Lumio — Learn. Design. Inspire."
          style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:30% center; display:block;" />
        <div class="glass-card login-logo-badge" style="position:absolute; top:28px; left:28px; padding:8px 16px 8px 8px; display:flex; align-items:center; gap:10px;">
          <img src="assets/lumio-logo-transparent.png" alt="Lumio logo" style="width:40px; height:40px; border-radius:10px; object-fit:cover; display:block;" />
          <span style="font-weight:700; font-size:17px; font-family:var(--font-display); color:var(--ink-900); letter-spacing:0.04em;">LUMIO</span>
        </div>
      </div>
      <div class="login-auth" style="flex:0 1 35%; max-width:560px; min-width:420px; background:var(--surface-0); display:flex; flex-direction:column; justify-content:center; padding:88px 48px 32px; box-shadow:-8px 0 32px rgba(31,27,58,0.04); position:relative; z-index:1;">
        ${innerHtml}
      </div>
      <style>
        .login-logo-badge, .login-info-pill { box-shadow: var(--shadow-soft); }
      </style>
    </div>
  `;
}

function paintLogin() {
  const app = document.getElementById('app');
  if (LumioLoginMode === 'forgot') { paintForgotPassword(); return; }
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
            <input class="input" id="login-first-name" type="text" placeholder="First name" />
          </div>
          <div class="field" style="flex:1; min-width:160px;">
            <label>Last Name</label>
            <input class="input" id="login-last-name" type="text" placeholder="Last name" />
          </div>
        </div>` : ''}

        <div class="field">
          <label>Email Address</label>
          <div class="input-icon-wrap">
            <span class="icon">✉️</span>
            <input class="input" id="login-email" type="email" placeholder="you@company.com" />
          </div>
        </div>
        <div class="field">
          <label>Password</label>
          <div class="input-icon-wrap">
            <span class="icon">🔒</span>
            <input class="input" id="login-password" type="password" placeholder="${isRegister ? 'Create a password (min. 6 characters)' : 'Enter your password'}" />
          </div>
        </div>
        ${!isRegister ? `
        <div class="flex justify-between items-center mb-16" style="font-size:13px;">
          <label class="flex items-center gap-8" style="cursor:pointer;">
            <input type="checkbox" id="login-remember-me" checked /> Remember me
          </label>
          <a href="#" id="login-forgot-password">Forgot password?</a>
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

  app.querySelector('#login-forgot-password')?.addEventListener('click', (e) => {
    e.preventDefault();
    LumioLoginMode = 'forgot';
    LumioForgotState = { step: 'request', link: null };
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

/* ============================================================
   FORGOT PASSWORD (Account Management Finalization Sprint, Phase 4)
   Complete local-only workflow: email entry -> account validation ->
   token generation -> reset link display (no real email provider exists,
   same documented limitation as the invitation system) -> set new
   password -> sign in with the new password.
   ============================================================ */
function paintForgotPassword() {
  const app = document.getElementById('app');
  const step = LumioForgotState.step;

  const inner = `
    <h2 style="font-size:24px; margin-bottom:8px;">Reset your password 🔑</h2>
    <p class="text-muted mb-24" style="font-size:14px;">${step === 'request' ? "Enter the email on your account and we'll generate a reset link." : 'A reset link has been generated below.'}</p>
    <div id="forgot-feedback" class="text-sm mb-16" style="display:none; padding:10px 12px; border-radius:8px; background:#FEEAEA; color:#E5484D;"></div>
    ${step === 'request' ? `
      <div class="field">
        <label>Email Address</label>
        <div class="input-icon-wrap">
          <span class="icon">✉️</span>
          <input class="input" id="forgot-email" type="email" placeholder="you@company.com" />
        </div>
      </div>
      <button class="btn btn-primary w-full btn-lg" id="forgot-send-btn">Send Reset Link →</button>
    ` : `
      <div class="text-sm mb-16" style="padding:10px 12px; border-radius:8px; background:#EAF7F0; color:#22A06B; word-break:break-all;">
        Email delivery isn't connected yet, so here's your reset link directly:<br/>
        <a href="${LumioForgotState.link}" id="forgot-link-anchor">${LumioForgotState.link}</a>
      </div>
      <button class="btn btn-secondary w-full" id="forgot-continue-btn">Continue to Reset Password →</button>
    `}
    <p class="text-sm text-muted mt-16" style="text-align:center;">
      <a href="#" id="forgot-back-to-login">Back to sign in</a>
    </p>
  `;

  app.innerHTML = loginAuthCardShell(inner);

  const showError = (msg) => {
    const el = app.querySelector('#forgot-feedback');
    el.textContent = msg;
    el.style.display = 'block';
  };

  app.querySelector('#forgot-back-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    LumioLoginMode = 'signin';
    paintLogin();
  });

  if (step === 'request') {
    app.querySelector('#forgot-send-btn').addEventListener('click', () => {
      const email = app.querySelector('#forgot-email').value.trim();
      const result = LumioAuth.requestPasswordReset(email);
      if (!result.ok) { showError(result.reason); return; }
      LumioForgotState = { step: 'sent', link: result.link };
      paintForgotPassword();
      toast('Reset link generated', '🔑');
    });
  } else {
    app.querySelector('#forgot-continue-btn').addEventListener('click', (e) => {
      e.preventDefault();
      navigate(LumioForgotState.link.split('#')[1] ? '#' + LumioForgotState.link.split('#')[1] : '#/login');
    });
    app.querySelector('#forgot-link-anchor').addEventListener('click', (e) => {
      e.preventDefault();
      navigate(LumioForgotState.link.split('#')[1] ? '#' + LumioForgotState.link.split('#')[1] : '#/login');
    });
  }
}

/* ---------------- SET NEW PASSWORD (from a reset link/token) ---------------- */
function renderResetPassword(token) {
  const app = document.getElementById('app');
  const check = LumioAuth.validateResetToken(token);

  const inner = !check.ok ? `
    <h2 style="font-size:24px; margin-bottom:8px;">Reset link invalid</h2>
    <p class="text-muted mb-24" style="font-size:14px;">${escapeHtml(check.reason)}</p>
    <a href="#/login" class="btn btn-secondary w-full" style="text-align:center; display:block;">Back to sign in</a>
  ` : `
    <h2 style="font-size:24px; margin-bottom:8px;">Set a new password 🔒</h2>
    <p class="text-muted mb-24" style="font-size:14px;">Choose a new password for ${escapeHtml(check.reset.email)}.</p>
    <div id="reset-feedback" class="text-sm mb-16" style="display:none; padding:10px 12px; border-radius:8px; background:#FEEAEA; color:#E5484D;"></div>
    <div class="field">
      <label>New Password</label>
      <input class="input" id="reset-new-password" type="password" placeholder="Create a password (min. 6 characters)" />
    </div>
    <div class="field">
      <label>Confirm New Password</label>
      <input class="input" id="reset-confirm-password" type="password" placeholder="Re-enter the new password" />
    </div>
    <button class="btn btn-primary w-full btn-lg" id="reset-submit-btn">Reset Password →</button>
  `;

  app.innerHTML = loginAuthCardShell(inner);
  if (!check.ok) return;

  const showError = (msg) => {
    const el = app.querySelector('#reset-feedback');
    el.textContent = msg;
    el.style.display = 'block';
  };

  app.querySelector('#reset-submit-btn').addEventListener('click', () => {
    const next = app.querySelector('#reset-new-password').value;
    const confirm = app.querySelector('#reset-confirm-password').value;
    if (next !== confirm) { showError('Passwords do not match.'); return; }
    const result = LumioAuth.resetPassword(token, next);
    if (!result.ok) { showError(result.reason); return; }
    toast('Password reset — please sign in', '✅');
    LumioLoginMode = 'signin';
    navigate('#/login');
  });
}
