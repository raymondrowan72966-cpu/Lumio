/* ============================================================
   THE LUMIO INSTRUCTIONAL DESIGN ACADEMY
   ============================================================ */

const HubUI = {
  activePath: null, // null = path grid, else academyPaths[].id
};

function getActiveCoachingTips() {
  const course = LumioState.courses[LumioState.currentCourseId];
  if (!course) return [];
  const lessonBlocks = LumioState.lessons[Object.keys(LumioState.lessons)[0]];
  return LumioData.coachingRules
    .filter(rule => {
      try { return rule.test(course, lessonBlocks); } catch (e) { return false; }
    })
    .map(rule => ({
      message: rule.message(course),
      path: LumioData.academyPaths.find(p => p.id === rule.pathId),
      topicId: rule.topicId,
    }))
    .filter(t => t.path);
}

function renderHub() {
  if (HubUI.activePath) {
    renderAcademyPath(HubUI.activePath);
    return;
  }

  const tips = getActiveCoachingTips();

  const content = `
    <header class="app-topbar">
      <div>
        <h2 style="font-size:20px;">The Lumio Instructional Design Academy</h2>
        <p class="text-sm text-muted">Your AI learning design mentor — practical lessons, organized into learning paths.</p>
      </div>
      <div class="input-icon-wrap" style="width:280px;">
        <span class="icon">🔍</span>
        <input class="input" placeholder="Search topics..." />
      </div>
    </header>
    <main class="app-content">
      ${ambientBlobs([
        ['var(--pastel-lavender)', '360px', '360px', '-100px', '-80px', null, null],
      ])}
      <div style="position:relative; z-index:1;">

        ${tips.length ? `
        <div class="ai-card mb-24">
          <div class="ai-spark">✨</div>
          <div style="flex:1;">
            <div class="flex items-center gap-8 mb-8">
              <strong style="color:var(--ink-900); font-size:14px;">Lumio AI Coach</strong>
              <span class="pill pill-cyan">Based on your course</span>
            </div>
            ${tips.map((tip, i) => `
              <p class="text-sm ${i > 0 ? 'mt-12' : ''}">
                ${tip.message}
                <a href="#" class="coach-link" data-path="${tip.path.id}" data-topic="${tip.topicId}"> Open "${(tip.path.topics.find(t=>t.id===tip.topicId)||{}).title || tip.path.title}" →</a>
              </p>
            `).join('')}
          </div>
        </div>` : `
        <div class="ai-card mb-24">
          <div class="ai-spark">✨</div>
          <div>
            <div class="flex items-center gap-8 mb-8">
              <strong style="color:var(--ink-900); font-size:14px;">Lumio AI Coach</strong>
              <span class="pill pill-cyan">All clear</span>
            </div>
            <p class="text-sm">Your current course looks well-aligned. Explore a learning path below to keep leveling up your design skills.</p>
          </div>
        </div>`}

        <h3 class="mb-16" style="font-size:16px;">Learning Paths</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(290px,1fr)); gap:20px;" class="mb-32">
          ${LumioData.academyPaths.map(path => pathCard(path)).join('')}
        </div>

        <h3 class="mb-16" style="font-size:16px;">Quick Reference — Bloom's Taxonomy</h3>
        <div class="card card-pad" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:20px;">
          ${Object.entries(LumioData.bloomVerbs).map(([level, verbs]) => `
            <div>
              <div class="pill pill-indigo mb-12">${level}</div>
              <p class="text-sm text-muted">${verbs.join(', ')}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </main>
  `;
  renderShell('hub', content, { largeLogo: true });

  document.querySelectorAll('.coach-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      HubUI.activePath = link.dataset.path;
      renderHub();
      setTimeout(() => {
        const topic = LumioData.academyPaths.find(p => p.id === link.dataset.path).topics.find(t => t.id === link.dataset.topic);
        if (topic) showAcademyTopic(topic, LumioData.academyPaths.find(p => p.id === link.dataset.path));
      }, 0);
    });
  });

  document.querySelectorAll('.path-card').forEach(card => {
    card.addEventListener('click', () => {
      HubUI.activePath = card.dataset.id;
      renderHub();
    });
  });
}

function pathCard(path) {
  return `
    <div class="card card-premium card-interactive card-pad path-card" data-id="${path.id}" style="border-top:4px solid ${path.color};">
      <div class="flex justify-between items-start mb-16">
        <div style="font-size:28px;">${path.icon}</div>
        <span class="pill ${path.pill}">${path.topics.length} topics</span>
      </div>
      <h3 style="font-size:15px; margin-bottom:8px;">${path.title}</h3>
      <p class="text-sm text-muted">${path.description}</p>
    </div>
  `;
}

function renderAcademyPath(pathId) {
  const path = LumioData.academyPaths.find(p => p.id === pathId);
  const content = `
    <header class="app-topbar">
      <div>
        <button class="btn btn-ghost btn-sm mb-8" id="back-to-academy">← All Learning Paths</button>
        <h2 style="font-size:20px;">${path.icon} ${path.title}</h2>
        <p class="text-sm text-muted">${path.description}</p>
      </div>
    </header>
    <main class="app-content">
      ${ambientBlobs([
        ['var(--pastel-cyan)', '360px', '360px', '-100px', '-80px', null, null],
      ])}
      <div style="position:relative; z-index:1;">
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); gap:20px;">
          ${path.topics.map(topic => topicCard(topic, path)).join('')}
        </div>
      </div>
    </main>
  `;
  renderShell('hub', content, { largeLogo: true });

  document.getElementById('back-to-academy').addEventListener('click', () => {
    HubUI.activePath = null;
    renderHub();
  });

  document.querySelectorAll('.topic-card').forEach(card => {
    card.addEventListener('click', () => {
      const topic = path.topics.find(t => t.id === card.dataset.id);
      showAcademyTopic(topic, path);
    });
  });
}

function topicCard(topic, path) {
  return `
    <div class="card card-premium card-interactive card-pad topic-card" data-id="${topic.id}" style="border-top:4px solid ${path.color};">
      <div class="flex justify-between items-start mb-16">
        <div style="font-size:28px;">${topic.icon}</div>
        <span class="pill ${path.pill}">${path.title}</span>
      </div>
      <h3 style="font-size:15px; margin-bottom:8px;">${topic.title}</h3>
      <p class="text-sm text-muted">${topic.summary}</p>
      <p class="text-sm mt-16" style="color:var(--ink-400);">📖 ${topic.duration}</p>
    </div>
  `;
}

function showAcademyTopic(topic, path) {
  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:560px; padding:32px;">
        <div class="flex items-center gap-12 mb-16">
          <div style="font-size:32px;">${topic.icon}</div>
          <div>
            <span class="pill ${path.pill}">${path.title}</span>
            <h2 style="font-size:22px; margin-top:6px;">${topic.title}</h2>
          </div>
        </div>
        <p class="text-sm text-muted mb-16">📖 ${topic.duration}</p>
        <p style="line-height:1.7;">${topic.summary}</p>

        <div class="mt-16">${topic.body}</div>

        <div class="flex justify-between items-center mt-32">
          <button class="btn btn-ghost" id="close-lesson">Close</button>
          <button class="btn btn-primary" id="apply-lesson">Got it — apply this to my course</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  overlay.querySelector('#close-lesson').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#apply-lesson').addEventListener('click', () => {
    overlay.remove();
    toast('Tip applied — head to your course to see the suggestion', '✨');
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}
