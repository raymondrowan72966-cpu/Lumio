/* ============================================================
   LOGIN SCREEN
   ============================================================ */

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
        <button class="btn btn-secondary w-full">🔵 Google</button>
        <button class="btn btn-secondary w-full">🪟 Microsoft</button>
        <button class="btn btn-secondary w-full">🍎 Apple</button>
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
