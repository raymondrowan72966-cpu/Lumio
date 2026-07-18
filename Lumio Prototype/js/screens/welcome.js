/* ============================================================
   WELCOME SCREEN (post-login)
   ============================================================ */

const WELCOME_TOUR_STEPS = [
  { iconId: 'projects', title: 'Projects Dashboard', body: 'Your creative workspace — organize courses and microlearning into folders, see status and progress at a glance.' },
  { iconId: 'rocket', title: 'Course Builder', body: 'A guided wizard takes you from idea to AI-generated course blueprint in minutes.' },
  { iconId: 'cat-images', title: 'Theme Designer', body: 'Pick colors, fonts, and styles for your course — and preview them live before you publish.' },
  { iconId: 'cat-interactive', title: 'Lesson Builder', body: 'Drag in blocks — text, images, video, interactions, knowledge checks — and arrange them on the canvas.' },
  { iconId: 'ai', title: 'AI Assistant', body: 'Your built-in creative partner — drafts content, suggests blocks, and gives contextual coaching as you build.' },
  { iconId: 'publish', title: 'Publishing', body: 'When you\'re ready, publish your course and share it with learners — or keep refining anytime.' },
];

function renderWelcome() {
  const app = document.getElementById('app');
  const firstName = getCurrentUser()?.firstName || '';
  app.innerHTML = `
    <div style="min-height:100vh; position:relative; overflow:hidden; background:var(--ws-surface, var(--surface-50)); padding:48px 24px;">
      <div class="mesh-bg"></div>
      ${ambientBlobs([
        ['color-mix(in srgb, var(--ws-primary) 45%, transparent)', '400px', '400px', '-150px', '-130px', null, null],
        ['color-mix(in srgb, var(--ws-accent) 50%, transparent)', '340px', '340px', null, null, '-110px', '-90px'],
        ['color-mix(in srgb, var(--ws-secondary) 35%, transparent)', '280px', '280px', '12%', '6%', null, null],
      ])}

      <div class="fade-in" style="position:relative; z-index:1; max-width:1040px; margin:0 auto; text-align:center;">
        <div style="margin-bottom:20px;">${renderWorkspaceLogo(LOGO_SLOTS.WELCOME)}</div>

        <h1 style="font-size:38px; line-height:1.25;">
          Welcome to <span class="gradient-text">Lumio</span>, ${firstName}!
        </h1>
        <p style="font-size:17px; color:var(--ws-text); margin-top:14px;">
          How would you like to begin?
        </p>

        <div class="mt-32" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px,1fr)); gap:24px; text-align:left;">

          <div class="choice-card" id="card-new-to-id" style="background:var(--ws-surface); border-color:var(--ws-border);">
            <div class="choice-glow" style="background:var(--ws-primary);"></div>
            <div class="choice-icon" style="background:linear-gradient(135deg, var(--ws-primary), var(--ws-secondary));">${platformIcon('lightbulb')}</div>
            <h3 style="font-size:17px; margin-bottom:8px; color:var(--ws-text);">New to Instructional Design?</h3>
            <p class="text-sm text-muted mb-16">
              Start with the Instructional Design Academy — bite-sized lessons on the concepts every great course uses.
            </p>
            <ul class="text-sm text-muted" style="list-style:none; padding:0; margin:0 0 20px; display:grid; gap:4px;">
              <li>${platformIcon('hub')} What is Instructional Design? · ADDIE · SAM</li>
              <li>${platformIcon('target')} Bloom's Taxonomy · Adult Learning Principles</li>
              <li>${platformIcon('cat-interactive')} Cognitive Load · Scenario-Based Learning</li>
              <li>${platformIcon('notes')} Storyboarding · Microlearning · Accessibility</li>
            </ul>
            <button class="btn btn-primary w-full" id="start-learning-btn">Start Learning →</button>
          </div>

          <div class="choice-card" id="card-tour" style="background:var(--ws-surface); border-color:var(--ws-border);">
            <div class="choice-glow" style="background:var(--ws-accent);"></div>
            <div class="choice-icon" style="background:linear-gradient(135deg, var(--ws-accent), var(--ws-secondary));">${platformIcon('target')}</div>
            <h3 style="font-size:17px; margin-bottom:8px; color:var(--ws-text);">Take a Quick Tour</h3>
            <p class="text-sm text-muted mb-16">
              See how Lumio fits together in under a minute.
            </p>
            <ul class="text-sm text-muted" style="list-style:none; padding:0; margin:0 0 20px; display:grid; gap:4px;">
              ${WELCOME_TOUR_STEPS.map(s => `<li>${platformIcon(s.iconId)} ${s.title}</li>`).join('')}
            </ul>
            <button class="btn btn-secondary w-full" id="start-tour-btn">Start Tour →</button>
          </div>

          <div class="choice-card" id="card-create-course" style="background:var(--ws-surface); border-color:var(--ws-border);">
            <div class="choice-glow" style="background:var(--ws-secondary);"></div>
            <div class="choice-icon" style="background:linear-gradient(135deg, var(--ws-secondary), var(--ws-accent));">${platformIcon('rocket')}</div>
            <h3 style="font-size:17px; margin-bottom:8px; color:var(--ws-text);">Build Your First Course</h3>
            <p class="text-sm text-muted mb-16">
              Jump straight into the Course Wizard — Lumio's AI will help shape your idea into a full blueprint.
            </p>
            <div class="card card-pad" style="background:var(--ws-surface-alt); border:none; margin-bottom:20px;">
              <div class="flex items-center gap-12">
                <div style="font-size:22px;">${platformIcon('ai')}</div>
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
      <div class="choice-icon" style="background:var(--gradient-aurora);">${platformIcon(s.iconId)}</div>
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
