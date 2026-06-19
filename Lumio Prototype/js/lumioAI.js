/* ============================================================
   LUMIO AI — Dummy AI Engine
   Offline, deterministic, template-driven content generation that
   stands in for a real LLM integration during development, demos,
   beta testing, and early customer evaluations.

   Single gateway: LumioAI.generate({ task, ...params })
   Direct capability methods are also exposed for callers that need
   a synchronous result (existing wizard/builder UI flows).

   No network calls. No API keys. No external dependencies.
   ============================================================ */

const LumioAI = (() => {

  /* ── deterministic pseudo-random helpers (same input → same output) ── */
  function _hash(str) {
    let h = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function _stripVerb(text) {
    return String(text || '').replace(/^[A-Za-z]+\s/, '');
  }

  function _titleCase(s) {
    return String(s || '').replace(/^./, c => c.toUpperCase());
  }

  function _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /* ============================================================
     CONTENT BANKS
     ============================================================ */

  const DESC_TEMPLATES = [
    lower => `This course gives learners a clear, practical path through ${lower}, combining real-world scenarios with focused practice so the skills stick long after the course ends.`,
    lower => `Designed for busy learners, this course breaks ${lower} into focused, bite-sized lessons — building confidence step by step through realistic examples and hands-on practice.`,
    lower => `A results-driven look at ${lower}, built around the situations learners actually face. Each lesson moves from core concept to applied skill, with checks for understanding along the way.`,
    lower => `Learners will leave this course with a working understanding of ${lower} — not just the theory, but the judgment to apply it confidently on the job.`,
  ];

  // Reuses LumioData.bloomVerbs (data.js) — the single source of truth for
  // verb vocabulary, so generated objectives always match the wizard's
  // verb dropdown options exactly. Maps difficulty levels onto Bloom's tiers.
  const BLOOM_TIER_ORDER = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
  const TIER_ORDER = ['beginner', 'intermediate', 'advanced'];
  const LEVEL_TO_BLOOM_TIERS = {
    beginner:     ['Remember', 'Understand'],
    intermediate: ['Apply', 'Analyze'],
    advanced:     ['Evaluate', 'Create'],
  };
  function _verbsForLevel(level) {
    const tiers = LEVEL_TO_BLOOM_TIERS[level] || LEVEL_TO_BLOOM_TIERS.beginner;
    return tiers.reduce((acc, tier) => acc.concat(LumioData.bloomVerbs[tier] || []), []);
  }

  const OBJECTIVE_FRAMES = [
    t => `the key concepts behind ${t}`,
    t => `how ${t} applies to day-to-day work`,
    t => `the steps involved in ${t}`,
    t => `common mistakes to avoid with ${t}`,
    t => `how to respond confidently when ${t} comes up on the job`,
  ];

  const LESSON_DURATIONS = ['5 min', '6 min', '7 min', '8 min', '10 min'];

  const KC_TYPE_ROTATION = ['multiple_choice', 'true_false', 'reflection'];
  const ASSESSMENT_TYPE_LABELS = {
    multiple_choice: 'Multiple Choice',
    true_false: 'True/False',
    reflection: 'Reflection',
  };

  const NAV_TIP_TEMPLATES = [
    (l, a, d) => `This course has ${l} lesson${l === 1 ? '' : 's'}${a ? ` and ${a} assessment${a === 1 ? '' : 's'}` : ''}, and takes about ${d} to complete. You can move through lessons in order, and revisit any lesson at any time using the course menu.`,
    (l, a, d) => `You're looking at ${l} lesson${l === 1 ? '' : 's'}${a ? ` with ${a} check${a === 1 ? '' : 's'} for understanding along the way` : ''} — roughly ${d} total. Work through them in order for the best experience, or jump back to review anytime from the course menu.`,
    (l, a, d) => `Plan for about ${d} to get through all ${l} lesson${l === 1 ? '' : 's'}${a ? ` and ${a} assessment${a === 1 ? '' : 's'}` : ''}. Each lesson builds on the last, so going in order will give you the most context — but you can always revisit earlier lessons from the menu.`,
  ];

  /* ============================================================
     1. COURSE DESCRIPTION GENERATION
     ============================================================ */
  function generateDescription(title) {
    const lower = (title || 'this topic').toLowerCase();
    const seed = _hash(title);
    return DESC_TEMPLATES[seed % DESC_TEMPLATES.length](lower);
  }

  /* ============================================================
     2. LEARNING OBJECTIVES GENERATION
     ============================================================ */
  function generateObjectives(opts = {}) {
    const title = opts.title || 'this topic';
    const audience = opts.audience || 'learners';
    const level = (opts.level || 'beginner').toLowerCase();
    const lower = title.toLowerCase();
    const startIdx = Math.max(0, TIER_ORDER.indexOf(level));
    const seed = _hash(title + audience + level);
    const count = 3 + (seed % 2); // 3 or 4 objectives, progressive difficulty

    // Progressive difficulty: early objectives draw from the level's own
    // tier, later ones reach slightly higher (e.g. beginner → also Apply).
    const levelsInOrder = TIER_ORDER.slice(startIdx).concat(TIER_ORDER.slice(0, startIdx));

    const objectives = [];
    for (let i = 0; i < count; i++) {
      const stepLevel = levelsInOrder[Math.min(levelsInOrder.length - 1, Math.floor((i * 2) / count))];
      const verbs = _verbsForLevel(stepLevel);
      const verb = verbs[(seed + i) % verbs.length];
      const frame = OBJECTIVE_FRAMES[(seed + i * 7) % OBJECTIVE_FRAMES.length];
      objectives.push({ verb, text: frame(lower) });
    }
    return objectives;
  }

  /* ============================================================
     3. LESSON STRUCTURE GENERATION
     ============================================================ */
  function generateLessons(opts = {}) {
    const objectives = opts.objectives || [];
    const seed = _hash(opts.title || objectives.map(o => o.text).join('|'));
    return objectives.map((o, i) => {
      const topic = _titleCase(_stripVerb(o.text));
      return {
        id: 'bl' + i,
        title: `Lesson ${i + 1}: ${topic}`,
        summary: `Learners ${o.verb.toLowerCase()} ${o.text} through a short explanation, a real-world example, and guided practice.`,
        objectiveIndex: i,
        duration: LESSON_DURATIONS[(seed + i) % LESSON_DURATIONS.length],
      };
    });
  }

  /* ============================================================
     4. NAVIGATION TIPS GENERATION
     ============================================================ */
  function generateNavigationTips(opts = {}) {
    const lessonCount = opts.lessonCount || 0;
    const assessmentCount = opts.assessmentCount || 0;
    const duration = opts.duration || '';
    const seed = _hash(`${lessonCount}-${assessmentCount}-${duration}`);
    return NAV_TIP_TEMPLATES[seed % NAV_TIP_TEMPLATES.length](lessonCount, assessmentCount, duration);
  }

  /* ============================================================
     5. KNOWLEDGE CHECK GENERATION
        (multiple choice / true-false / reflection)
     ============================================================ */
  function _mcOptionsFor(topic) {
    return [
      `It directly affects day-to-day decisions related to ${topic}`,
      `It only matters during onboarding`,
      `It has no impact on daily tasks`,
      `It is optional once initial training is complete`,
    ];
  }

  function _tfStatementFor(topic) {
    const truthy = _hash(topic) % 2 === 0;
    return {
      question: truthy
        ? `True or False: Understanding ${topic} helps you make better decisions on the job.`
        : `True or False: Once you've learned ${topic}, it never needs to be revisited.`,
      correct: truthy ? 0 : 1, // True = 0, False = 1
    };
  }

  function generateKnowledgeChecks(opts = {}) {
    const objectives = opts.objectives || [];
    const forceType = opts.forceType || null;
    return objectives.map((o, i) => {
      const topic = _stripVerb(o.text);
      const type = forceType || KC_TYPE_ROTATION[i % KC_TYPE_ROTATION.length];

      if (type === 'multiple_choice') {
        return {
          id: 'bk' + i, type: 'multiple_choice', objectiveIndex: i,
          question: `Which of the following best reflects a key point about ${topic}?`,
          options: _mcOptionsFor(topic),
          correct: 0,
        };
      }
      if (type === 'true_false') {
        const tf = _tfStatementFor(topic);
        return {
          id: 'bk' + i, type: 'true_false', objectiveIndex: i,
          question: tf.question, options: ['True', 'False'], correct: tf.correct,
        };
      }
      return {
        id: 'bk' + i, type: 'reflection', objectiveIndex: i,
        question: `Think of a recent situation where ${topic} came up. What would you do differently now?`,
      };
    });
  }

  /* Convenience: a single ready-to-insert kc_multiple_choice block.data payload. */
  function generateKnowledgeCheckBlockData(topic) {
    const t = topic || 'this lesson';
    return {
      question: `Which of the following best reflects a key point about ${t.toLowerCase()}?`,
      options: _mcOptionsFor(t.toLowerCase()),
      correct: 0,
    };
  }

  /* ============================================================
     6. COURSE BLUEPRINT GENERATION
        Input: title, audience, duration, difficulty
        Output: description, objectives, lesson structure, assessments
     ============================================================ */
  function generateBlueprint(opts = {}) {
    const title = opts.title || opts.prompt || 'New Course';
    const audience = opts.audience || 'learners';
    const difficulty = opts.difficulty || 'beginner';

    const objectives = generateObjectives({ title, audience, level: difficulty });
    const lessons = generateLessons({ title, objectives });
    const knowledgeChecks = generateKnowledgeChecks({ objectives });
    const interactionTypes = ['Scenario', 'Accordion', 'Flashcard Grid', 'Process', 'Tabs'];

    const assessments = knowledgeChecks.map((kc, i) => ({
      id: 'ba' + i,
      title: `Knowledge Check: ${_titleCase(_stripVerb(objectives[i].text))}`,
      type: ASSESSMENT_TYPE_LABELS[kc.type],
      objectiveIndex: i,
      knowledgeCheck: kc,
    }));
    const interactions = objectives.map((o, i) => ({
      id: 'bi' + i, type: interactionTypes[i % interactionTypes.length], objectiveIndex: i,
    }));
    const totalMinutes = lessons.reduce((sum, l) => sum + parseInt(l.duration), 0) + assessments.length * 3;

    return {
      description: generateDescription(title),
      objectives,
      lessons,
      assessments,
      interactions,
      estimatedDuration: `${totalMinutes}-${totalMinutes + 10} min`,
    };
  }

  /* Legacy-compatible path: build lessons/assessments/interactions directly
     from an existing objectives array (no title/audience/difficulty needed).
     Preserves the exact shape the wizard's blueprint screen already expects. */
  function blueprintFromObjectives(objectives) {
    const lessons = generateLessons({ objectives });
    const knowledgeChecks = generateKnowledgeChecks({ objectives });
    const interactionTypes = ['Scenario', 'Accordion', 'Flashcard Grid', 'Process', 'Tabs'];

    const assessments = knowledgeChecks.map((kc, i) => ({
      id: 'ba' + i,
      title: `Knowledge Check: ${_titleCase(_stripVerb(objectives[i].text))}`,
      type: ASSESSMENT_TYPE_LABELS[kc.type],
      objectiveIndex: i,
      knowledgeCheck: kc,
    }));
    const interactions = objectives.map((o, i) => ({
      id: 'bi' + i, type: interactionTypes[i % interactionTypes.length], objectiveIndex: i,
    }));
    const totalMinutes = lessons.reduce((sum, l) => sum + parseInt(l.duration), 0) + assessments.length * 3;

    return { lessons, assessments, interactions, estimatedDuration: `${totalMinutes}-${totalMinutes + 10} min` };
  }

  /* Rewrites Bloom's-verb objectives into learner-facing "You'll..." outcomes. */
  function rewriteOutcomes(objectives) {
    const map = {
      List: 'be able to list', Recall: 'know how to recall', Identify: 'know how to spot', Name: 'be able to name', Define: 'be able to define',
      Explain: 'be able to explain', Summarize: 'be able to summarize', Describe: 'be able to describe', Classify: 'be able to classify',
      Demonstrate: 'be able to demonstrate', Use: 'be able to use', Solve: 'be able to solve', Implement: 'be able to put into practice',
      Compare: 'be able to compare', Differentiate: 'be able to tell apart', Organize: 'be able to organize', Examine: 'be able to look closely at',
      Justify: 'be able to justify', Critique: 'be able to critique', Assess: 'be able to assess', Recommend: 'be able to recommend',
      Design: 'be able to design', Develop: 'be able to develop', Construct: 'be able to build', Compose: 'be able to put together',
    };
    return objectives.map(o => `You'll ${map[o.verb] || 'be able to apply'} ${_stripVerb(o.text)}`);
  }

  /* ============================================================
     SINGLE AI GATEWAY
     ============================================================ */
  async function generate(opts = {}) {
    const start = Date.now();
    const { task } = opts;
    let result;

    switch (task) {
      case 'blueprint':       result = generateBlueprint(opts); break;
      case 'objectives':      result = generateObjectives(opts); break;
      case 'lessons':         result = generateLessons(opts); break;
      case 'knowledgeChecks': result = generateKnowledgeChecks(opts); break;
      case 'navigationTips':  result = generateNavigationTips(opts); break;
      case 'description':     result = generateDescription(opts.title || opts.prompt); break;
      default:
        throw new Error(`[LumioAI] Unknown task: "${task}"`);
    }

    // Simulate realistic "thinking" time so the experience feels like AI is
    // actually working, without ever taking longer than necessary.
    const elapsed = Date.now() - start;
    if (elapsed < 500) {
      const targetDelay = 1000 + Math.floor(Math.random() * 2000); // 1–3s
      await _delay(targetDelay - elapsed);
    }
    return result;
  }

  return {
    generate,
    generateBlueprint,
    generateObjectives,
    generateLessons,
    generateKnowledgeChecks,
    generateKnowledgeCheckBlockData,
    generateNavigationTips,
    generateDescription,
    rewriteOutcomes,
    blueprintFromObjectives,
  };

})();
