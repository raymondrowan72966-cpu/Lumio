/* ============================================================
   WELCOME SCREEN (post-login)
   ============================================================ */

const WELCOME_TOUR_STEPS = [
  { icon: '🗂️', title: 'Projects Dashboard', body: 'Your creative workspace — organize courses and microlearning into folders, see status and progress at a glance.' },
  { icon: '🧙', title: 'Course Builder', body: 'A guided wizard takes you from idea to AI-generated course blueprint in minutes.' },
  { icon: '🎨', title: 'Theme Designer', body: 'Pick colors, fonts, and styles for your course — and preview them live before you publish.' },
  { icon: '🧩', title: 'Lesson Builder', body: 'Drag in blocks — text, images, video, interactions, knowledge checks — and arrange them on the canvas.' },
  { icon: '✨', title: 'AI Assistant', body: 'Your built-in creative partner — drafts content, suggests blocks, and gives contextual coaching as you build.' },
  { icon: '🚀', title: 'Publishing', body: 'When you\'re ready, publish your course and share it with learners — or keep refining anytime.' },
];

function renderWelcome() {
  const app = document.getElementById('app');
  const firstName = LumioState.currentUser.firstName;
  app.innerHTML = `
    <div style="min-height:100vh; position:relative; overflow:hidden; background:var(--surface-50); padding:48px 24px;">
      <div class="mesh-bg"></div>
      ${ambientBlobs([
        ['var(--pastel-lavender)', '500px', '500px', '-180px', '-160px', null, null],
        ['var(--pastel-cyan)', '420px', '420px', null, null, '-140px', '-120px'],
        ['var(--pastel-pink)', '320px', '320px', '8%', '8%', null, null],
      ])}

      <div class="fade-in" style="position:relative; z-index:1; max-width:1040px; margin:0 auto; text-align:center;">
        <img src="assets/lumio-logo-transparent.png" alt="Lumio logo" style="width:240px; height:240px; margin:0 auto 20px; object-fit:contain; display:block;" />

        <h1 style="font-size:38px; line-height:1.25;">
          Welcome to <span class="gradient-text">Lumio</span>, ${firstName}!
        </h1>
        <p style="font-size:17px; color:var(--ink-700); margin-top:14px;">
          How would you like to begin?
        </p>

        <div class="mt-32" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px,1fr)); gap:24px; text-align:left;">

          <div class="choice-card" id="card-new-to-id">
            <div class="choice-glow" style="background:var(--violet);"></div>
            <div class="choice-icon" style="background:var(--gradient-primary);">🧠</div>
            <h3 style="font-size:17px; margin-bottom:8px;">New to Instructional Design?</h3>
            <p class="text-sm text-muted mb-16">
              Start with the Instructional Design Academy — bite-sized lessons on the concepts every great course uses.
            </p>
            <ul class="text-sm text-muted" style="list-style:none; padding:0; margin:0 0 20px; display:grid; gap:4px;">
              <li>🧭 What is Instructional Design? · ADDIE · SAM</li>
              <li>🎯 Bloom's Taxonomy · Adult Learning Principles</li>
              <li>🧩 Cognitive Load · Scenario-Based Learning</li>
              <li>♿ Storyboarding · Microlearning · Accessibility</li>
            </ul>
            <button class="btn btn-primary w-full" id="start-learning-btn">Start Learning →</button>
          </div>

          <div class="choice-card" id="card-tour">
            <div class="choice-glow" style="background:var(--cyan);"></div>
            <div class="choice-icon" style="background:linear-gradient(135deg, var(--cyan), var(--teal));">🧭</div>
            <h3 style="font-size:17px; margin-bottom:8px;">Take a Quick Tour</h3>
            <p class="text-sm text-muted mb-16">
              See how Lumio fits together in under a minute.
            </p>
            <ul class="text-sm text-muted" style="list-style:none; padding:0; margin:0 0 20px; display:grid; gap:4px;">
              ${WELCOME_TOUR_STEPS.map(s => `<li>${s.icon} ${s.title}</li>`).join('')}
            </ul>
            <button class="btn btn-secondary w-full" id="start-tour-btn">Start Tour →</button>
          </div>

          <div class="choice-card" id="card-create-course">
            <div class="choice-glow" style="background:var(--magenta);"></div>
            <div class="choice-icon" style="background:var(--gradient-warm);">🚀</div>
            <h3 style="font-size:17px; margin-bottom:8px;">Build Your First Course</h3>
            <p class="text-sm text-muted mb-16">
              Jump straight into the Course Wizard — Lumio's AI will help shape your idea into a full blueprint.
            </p>
            <div class="card card-pad" style="background:var(--pastel-lavender); border:none; margin-bottom:20px;">
              <div class="flex items-center gap-12">
                <div style="font-size:22px;">✨</div>
                <p class="text-sm" style="margin:0;">Tell us your topic and audience — we'll suggest objectives, lessons, and a theme.</p>
              </div>
            </div>
            <button class="btn btn-primary w-full" id="create-course-btn">Create Course →</button>
          </div>

        </div>

        <p class="text-sm text-muted mt-32">
          Or <a href="#" id="skip-link">go straight to your Projects</a>
        </p>
      </div>
    </div>
  `;

  document.getElementById('start-learning-btn').addEventListener('click', () => navigate('#/hub'));
  document.getElementById('create-course-btn').addEventListener('click', () => navigate('#/wizard'));
  document.getElementById('start-tour-btn').addEventListener('click', () => openWelcomeTour());
  document.getElementById('skip-link').addEventListener('click', (e) => {
    e.preventDefault();
    navigate('#/projects');
  });
}

function openWelcomeTour() {
  let step = 0;
  const overlay = el(`<div class="overlay"><div class="modal" style="width:480px; min-height:420px; padding:48px 44px; display:flex; flex-direction:column; justify-content:center; box-sizing:border-box;" id="tour-content"></div></div>`);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  function renderStep() {
    const content = overlay.querySelector('#tour-content');
    const s = WELCOME_TOUR_STEPS[step];
    content.innerHTML = `
      <div class="flex gap-6" style="margin-bottom:32px;">
        ${WELCOME_TOUR_STEPS.map((_, i) => `<div style="height:4px; flex:1; border-radius:var(--r-pill); background:${i <= step ? 'var(--gradient-primary)' : 'var(--border)'};"></div>`).join('')}
      </div>
      <div class="choice-icon" style="background:var(--gradient-aurora);">${s.icon}</div>
      <h2 style="font-size:20px; margin-top:24px;">${s.title}</h2>
      <p class="text-sm text-muted mt-16" style="line-height:1.7; margin-bottom:36px;">${s.body}</p>
      <div class="flex justify-between items-center">
        <span class="text-sm text-muted">${step + 1} / ${WELCOME_TOUR_STEPS.length}</span>
        <div class="flex gap-12">
          <button class="btn btn-ghost" id="tour-skip">Skip</button>
          <button class="btn btn-primary" id="tour-next">${step === WELCOME_TOUR_STEPS.length - 1 ? 'Finish' : 'Next →'}</button>
        </div>
      </div>
    `;
    content.querySelector('#tour-skip').addEventListener('click', () => overlay.remove());
    content.querySelector('#tour-next').addEventListener('click', () => {
      if (step === WELCOME_TOUR_STEPS.length - 1) {
        overlay.remove();
        navigate('#/projects');
      } else {
        step++; renderStep();
      }
    });
  }
  renderStep();
}
