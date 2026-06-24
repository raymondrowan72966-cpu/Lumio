/* ============================================================
   LUMIO PROTOTYPE — SAMPLE DATA & SIMULATED AI
   ============================================================ */

const LumioData = {
  folders: [
    { id: 'f1', name: 'Onboarding', color: 'indigo', icon: '📁' },
    { id: 'f2', name: 'Compliance', color: 'orange', icon: '📁' },
    { id: 'f3', name: 'Product Training', color: 'magenta', icon: '📁' },
  ],

  // gradient thumbnail presets, rotated across cards
  thumbGradients: [
    'linear-gradient(135deg,#7C3AED,#4F46E5)',
    'linear-gradient(135deg,#06B6D4,#14B8A6)',
    'linear-gradient(135deg,#F97316,#D946EF)',
    'linear-gradient(135deg,#4F46E5,#06B6D4)',
    'linear-gradient(135deg,#D946EF,#7C3AED)',
  ],

  projects: [
    {
      id: 'p1', title: 'New Hire Onboarding', type: 'Course', folder: 'f1',
      modified: 'Edited 2 hours ago', status: 'draft', thumb: 0, health: 82,
      lastAccessed: Date.now() - 2 * 3600 * 1000, deleted: false, deletedAt: null,
      ownerId: 'u-owner', sharedWith: [], sharedScope: null, sharedPermission: 'view',
      reviewStatus: null, reviewedBy: null, reviewedAt: null, reviewComments: null, submittedBy: null, submittedAt: null,
    },
    {
      id: 'p2', title: 'Workplace Safety Basics', type: 'Microlearning', folder: 'f2',
      modified: 'Edited yesterday', status: 'published', thumb: 1, health: 91,
      lastAccessed: Date.now() - 24 * 3600 * 1000, deleted: false, deletedAt: null,
      ownerId: 'u-owner', sharedWith: [], sharedScope: null, sharedPermission: 'view',
      reviewStatus: null, reviewedBy: null, reviewedAt: null, reviewComments: null, submittedBy: null, submittedAt: null,
    },
    {
      id: 'p3', title: 'Customer Service Excellence', type: 'Course', folder: 'f3',
      modified: 'Edited 3 days ago', status: 'draft', thumb: 2, health: 64,
      lastAccessed: Date.now() - 3 * 24 * 3600 * 1000, deleted: false, deletedAt: null,
      ownerId: 'u-owner', sharedWith: [], sharedScope: null, sharedPermission: 'view',
      reviewStatus: null, reviewedBy: null, reviewedAt: null, reviewComments: null, submittedBy: null, submittedAt: null,
    },
    {
      id: 'p4', title: 'Product Knowledge: Q3 Launch', type: 'Microlearning', folder: 'f1',
      modified: 'Edited 5 days ago', status: 'in_review', thumb: 3, health: 75,
      lastAccessed: Date.now() - 5 * 24 * 3600 * 1000, deleted: false, deletedAt: null,
      ownerId: 'u-owner', sharedWith: [], sharedScope: null, sharedPermission: 'view',
      reviewStatus: 'pending', reviewedBy: null, reviewedAt: null, reviewComments: null, submittedBy: 'u-owner', submittedAt: Date.now() - 5 * 24 * 3600 * 1000,
    },
    {
      id: 'p5', title: 'Leadership Fundamentals', type: 'Course', folder: null,
      modified: 'Edited 1 week ago', status: 'draft', thumb: 4, health: 58,
      lastAccessed: Date.now() - 7 * 24 * 3600 * 1000, deleted: false, deletedAt: null,
      ownerId: 'u-owner', sharedWith: [], sharedScope: null, sharedPermission: 'view',
      reviewStatus: null, reviewedBy: null, reviewedAt: null, reviewComments: null, submittedBy: null, submittedAt: null,
    },
    {
      id: 'p6', title: 'Data Privacy Essentials', type: 'Microlearning', folder: 'f2',
      modified: 'Edited 2 weeks ago', status: 'published', thumb: 1, health: 88,
      lastAccessed: Date.now() - 14 * 24 * 3600 * 1000, deleted: false, deletedAt: null,
      ownerId: 'u-owner', sharedWith: [], sharedScope: null, sharedPermission: 'view',
      reviewStatus: null, reviewedBy: null, reviewedAt: null, reviewComments: null, submittedBy: null, submittedAt: null,
    },
    {
      id: 'p7', title: 'Formula 1 Fundamentals', type: 'Course', folder: 'f3',
      modified: 'Edited 3 hours ago', status: 'draft', thumb: 2, health: 78,
      lastAccessed: Date.now() - 3 * 3600 * 1000, deleted: false, deletedAt: null,
      ownerId: 'u-owner', sharedWith: [], sharedScope: null, sharedPermission: 'view',
      reviewStatus: null, reviewedBy: null, reviewedAt: null, reviewComments: null, submittedBy: null, submittedAt: null,
    },
    // Governance Workflow & Review Management Audit Sprint: every other
    // Microlearning seed project is already in_review or published — there
    // was no Draft Microlearning in the demo data at all, which made the
    // "Submit For Review" action (correctly status-gated, not type-gated)
    // impossible to find when testing against Microlearning specifically.
    // This entry restores full Draft-state parity between the two types.
    {
      id: 'p8', title: 'Onboarding Microlesson: Security Basics', type: 'Microlearning', folder: 'f2',
      modified: 'Edited 4 hours ago', status: 'draft', thumb: 3, health: 70,
      lastAccessed: Date.now() - 4 * 3600 * 1000, deleted: false, deletedAt: null,
      ownerId: 'u-owner', sharedWith: [], sharedScope: null, sharedPermission: 'view',
      reviewStatus: null, reviewedBy: null, reviewedAt: null, reviewComments: null, submittedBy: null, submittedAt: null,
    },
  ],

  // ============================================================
  // INSTRUCTIONAL DESIGN ACADEMY — 9 LEARNING PATHS
  // ============================================================
  academyPaths: [
    {
      id: 'foundations', title: 'Foundations', icon: '🧭', color: 'var(--violet)', pill: 'pill-indigo',
      description: 'The big-picture ideas every instructional designer should know.',
      topics: [
        { id: 'what-is-id', title: 'What is Instructional Design?', duration: '4 min read', icon: '🧭',
          summary: 'A friendly introduction to instructional design — what it is, why it matters, and how it differs from "just making slides."',
          body: `<p style="line-height:1.7;">Instructional design is the practice of creating learning experiences that help people gain specific knowledge or skills — efficiently, effectively, and enjoyably. It blends a bit of psychology, a bit of storytelling, and a bit of project management.</p>
                 <div class="card card-pad mt-16" style="background:var(--pastel-lavender); border:none;">
                   <p class="text-sm">Great instructional design starts with the <strong>learner's goal</strong>, not the content you already have.</p>
                 </div>` },
        { id: 'addie', title: 'The ADDIE Model', duration: '5 min read', icon: '🔁',
          summary: 'Analyze, Design, Develop, Implement, Evaluate — the classic five-phase framework for building learning.',
          body: `<p style="line-height:1.7;">ADDIE breaks course development into five phases: <strong>Analyze</strong> the problem and audience, <strong>Design</strong> the learning plan, <strong>Develop</strong> the content, <strong>Implement</strong> it with learners, and <strong>Evaluate</strong> the results.</p>
                 <div class="card card-pad mt-16" style="background:var(--pastel-cyan); border:none;">
                   <p class="text-sm">Lumio's Course Wizard mirrors ADDIE — the early steps (audience, objectives) are Analyze &amp; Design; the AI Blueprint kicks off Develop.</p>
                 </div>` },
        { id: 'sam', title: 'SAM (Successive Approximation Model)', duration: '4 min read', icon: '🔄',
          summary: 'A faster, iterative alternative to ADDIE built around quick prototypes and feedback loops.',
          body: `<p style="line-height:1.7;">SAM favors rapid, repeated cycles of <em>prototype → review → refine</em> instead of one long linear process. Build something small, get feedback early, and adjust before investing in a full course.</p>` },
        { id: 'agile-ld', title: 'Agile Learning Design', duration: '5 min read', icon: '⚡',
          summary: 'Borrowing sprints, backlogs, and MVPs from software teams to ship learning faster.',
          body: `<p style="line-height:1.7;">Treat your course like a product: maintain a backlog of lessons, ship a minimum viable course, and improve it in sprints based on learner feedback and data.</p>` },
        { id: 'adult-learning', title: 'Adult Learning Principles', duration: '6 min read', icon: '✨',
          summary: 'Understand andragogy — how adult learners differ from students, and what motivates them.',
          body: `<div class="card card-pad" style="background:var(--pastel-pink); border:none;">
                   <p class="text-sm">Adult learners want to know <strong>"what's in it for me?"</strong> Frame outcomes around real tasks they'll do, not abstract topics.</p>
                 </div>` },
      ],
    },
    {
      id: 'objectives', title: 'Learning Objectives', icon: '🎯', color: 'var(--pillar-learn)', pill: 'pill-indigo',
      description: 'Set clear, measurable destinations for every course and lesson.',
      topics: [
        { id: 'writing-objectives', title: 'Writing Measurable Learning Objectives', duration: '6 min read', icon: '🎯',
          summary: 'Use Bloom’s Taxonomy to write objectives that are specific, observable, and easy to assess.',
          body: `<div class="card card-pad" style="background:var(--pastel-lavender); border:none;">
                   <p class="text-sm"><strong>Try this formula:</strong></p>
                   <p class="text-sm mt-8">"By the end of this lesson, learners will be able to <strong>[verb]</strong> [content] [condition]."</p>
                   <p class="text-sm text-muted mt-8">Example: "...will be able to <strong>identify</strong> the five steps of our return process when shown a customer scenario."</p>
                 </div>` },
        { id: 'blooms-verbs', title: 'Bloom’s Taxonomy Verb Bank', duration: '2 min read', icon: '📖',
          summary: 'A reference list of strong, measurable verbs for every level — from Remember to Create.',
          body: `<div class="card card-pad" style="background:var(--pastel-pink); border:none;">
                   <p class="text-sm"><strong>Remember:</strong> List, Recall, Identify, Name, Define<br/>
                   <strong>Understand:</strong> Explain, Summarize, Describe, Classify<br/>
                   <strong>Apply:</strong> Demonstrate, Use, Solve, Implement<br/>
                   <strong>Analyze:</strong> Compare, Differentiate, Organize, Examine<br/>
                   <strong>Evaluate:</strong> Justify, Critique, Assess, Recommend<br/>
                   <strong>Create:</strong> Design, Develop, Construct, Compose</p>
                 </div>` },
        { id: 'constructive-alignment', title: 'Constructive Alignment 101', duration: '4 min read', icon: '🔗',
          summary: 'Make sure your objectives, content, and assessments all point in the same direction.',
          body: `<div class="card card-pad" style="background:var(--pastel-lavender); border:none;">
                   <p class="text-sm">Constructive alignment means your <strong>objectives</strong>, <strong>content</strong>, and <strong>assessments</strong> all point at the same outcome. If you assess something you never taught, learners will struggle — and it's not their fault.</p>
                 </div>` },
        { id: 'avoiding-vague-verbs', title: 'Avoiding Vague Verbs', duration: '3 min read', icon: '🚫',
          summary: 'Why words like "understand" and "know" make objectives hard to assess — and what to use instead.',
          body: `<p style="line-height:1.7;">Vague verbs like <em>understand</em>, <em>know</em>, <em>learn about</em>, <em>be familiar with</em>, and <em>appreciate</em> can't be observed or measured. Swap them for action verbs from Bloom's Taxonomy that describe something a learner can <em>do</em>.</p>` },
      ],
    },
    {
      id: 'assessment', title: 'Assessment Design', icon: '✅', color: 'var(--pillar-success)', pill: 'pill-teal',
      description: 'Check for understanding in ways that are fair, useful, and aligned to your goals.',
      topics: [
        { id: 'course-vs-micro', title: 'Choosing Course vs. Microlearning', duration: '3 min read', icon: '⚖️',
          summary: 'A quick guide to picking the right format based on your goal, audience, and content volume.',
          body: `<div class="card card-pad" style="background:var(--pastel-cyan); border:none;">
                   <p class="text-sm">Choose <strong>Course</strong> for multi-topic content that builds over 30+ minutes. Choose <strong>Microlearning</strong> for a single focused topic under 10 minutes.</p>
                 </div>` },
        { id: 'kc-types', title: 'Types of Knowledge Checks', duration: '5 min read', icon: '❓',
          summary: 'Multiple choice, multiple response, matching, ordering, fill-the-gap — when to use each.',
          body: `<p style="line-height:1.7;">Match the question type to the skill: use <strong>Ordering</strong> for sequences/processes, <strong>Matching</strong> for terminology, <strong>Multiple Response</strong> when more than one answer is correct, and <strong>Fill the Gap</strong> for recall of exact terms.</p>` },
        { id: 'aligning-assessments', title: 'Aligning Assessments to Objectives', duration: '4 min read', icon: '🔗',
          summary: 'Every objective deserves at least one check — here\'s how to map them cleanly.',
          body: `<p style="line-height:1.7;">For every learning objective, ask: "How would a learner prove they can do this?" That answer is your assessment. Lumio's AI Blueprint maps each suggested knowledge check back to an objective automatically.</p>` },
        { id: 'feedback-design', title: 'Designing Helpful Feedback', duration: '3 min read', icon: '💬',
          summary: 'Why "Incorrect, try again" isn\'t enough — and what to write instead.',
          body: `<p style="line-height:1.7;">Good feedback explains <em>why</em> an answer is right or wrong and points learners back to the relevant content — turning a quiz into one more learning moment.</p>` },
      ],
    },
    {
      id: 'content', title: 'Content Design', icon: '🧩', color: 'var(--pillar-design)', pill: 'pill-orange',
      description: 'Structure and write content that\'s easy to follow and easy to remember.',
      topics: [
        { id: 'chunking', title: 'Chunking Content for Retention', duration: '5 min read', icon: '🧩',
          summary: 'Discover why breaking lessons into small, focused chunks improves how much learners actually remember.',
          body: `<div class="card card-pad" style="background:var(--pastel-cyan); border:none;">
                   <p class="text-sm">Aim for lessons of <strong>5–10 minutes</strong>. If a topic feels bigger than that, split it into two lessons or add a "Continue" divider to pace reveal.</p>
                 </div>` },
        { id: 'cognitive-load', title: 'Cognitive Load Theory', duration: '5 min read', icon: '🧠',
          summary: 'How to avoid overwhelming working memory — and design content that sticks.',
          body: `<p style="line-height:1.7;">Working memory can only hold a handful of new ideas at once. Reduce <em>extraneous</em> load (clutter, decoration) so learners can spend their mental effort on the concept itself.</p>` },
        { id: 'storyboarding', title: 'Storyboarding Basics', duration: '6 min read', icon: '🗂️',
          summary: 'Plan your lesson flow before you build — block by block.',
          body: `<p style="line-height:1.7;">A storyboard is a rough sketch of every screen: what's shown, what's said, and what the learner does. Sketching this out before opening the Lesson Builder saves rework later.</p>` },
        { id: 'writing-for-elearning', title: 'Writing for eLearning', duration: '4 min read', icon: '✍️',
          summary: 'Short sentences, active voice, and a conversational tone go a long way.',
          body: `<p style="line-height:1.7;">Write the way you'd explain something to a colleague — short sentences, active voice, and a friendly tone. Cut any sentence that doesn't help the learner act.</p>` },
      ],
    },
    {
      id: 'engagement', title: 'Engagement', icon: '🌟', color: 'var(--pillar-inspire)', pill: 'pill-magenta',
      description: 'Keep learners curious, motivated, and coming back.',
      topics: [
        { id: 'scenario-based', title: 'Scenario-Based Learning', duration: '6 min read', icon: '🌳',
          summary: 'Put learners in realistic situations where their choices have consequences.',
          body: `<p style="line-height:1.7;">Scenarios let learners practice judgment in a safe space. Branch the story based on choices, and use the Scenario block to map decisions to outcomes.</p>` },
        { id: 'microlearning-strategies', title: 'Microlearning Strategies', duration: '4 min read', icon: '⏱️',
          summary: 'Designing short, focused experiences that fit into a learner\'s day.',
          body: `<p style="line-height:1.7;">Microlearning works best for a single objective, a single skill, or a quick refresher — think "just enough, just in time."</p>` },
        { id: 'gamification', title: 'Gamification Basics', duration: '5 min read', icon: '🎮',
          summary: 'Points, progress, and play — used thoughtfully, not just for decoration.',
          body: `<p style="line-height:1.7;">Gamification works when it reinforces the learning goal — progress bars, flashcards, and friendly challenges all add motivation without distracting from the content.</p>` },
        { id: 'interactive-elements', title: 'Choosing Interactive Elements', duration: '4 min read', icon: '🧩',
          summary: 'Accordions, tabs, flashcards, processes — match the interaction to the content.',
          body: `<p style="line-height:1.7;">Use <strong>Accordions/Tabs</strong> to let learners explore optional depth, <strong>Process</strong> blocks for sequences, and <strong>Flashcards</strong> for vocabulary or quick recall practice.</p>` },
      ],
    },
    {
      id: 'visual-design', title: 'Visual Design', icon: '🎨', color: 'var(--orange)', pill: 'pill-orange',
      description: 'Make your courses beautiful, on-brand, and easy on the eyes.',
      topics: [
        { id: 'visual-hierarchy', title: 'Visual Hierarchy', duration: '4 min read', icon: '🪜',
          summary: 'Guide the eye with size, weight, color, and spacing.',
          body: `<p style="line-height:1.7;">The most important thing on a screen should look the most important. Use heading size, color, and whitespace to create a clear path for the eye.</p>` },
        { id: 'color-typography', title: 'Color & Typography', duration: '5 min read', icon: '🎨',
          summary: 'Pick palettes and fonts that feel cohesive — and how Lumio\'s Theme Designer helps.',
          body: `<p style="line-height:1.7;">Pick one primary color, one accent, and a neutral background. Pair a distinctive display font for headings with a highly readable body font — exactly what Lumio's Theme Designer sets up for you.</p>` },
        { id: 'using-imagery', title: 'Using Imagery Effectively', duration: '4 min read', icon: '🖼️',
          summary: 'Choosing images that support the message instead of just filling space.',
          body: `<p style="line-height:1.7;">Every image should answer "what is this helping the learner understand?" If it's purely decorative, consider a simpler background or color block instead.</p>` },
        { id: 'branding-consistency', title: 'Branding & Consistency', duration: '3 min read', icon: '🏷️',
          summary: 'Why a consistent theme across lessons builds trust and polish.',
          body: `<p style="line-height:1.7;">Apply your theme — colors, fonts, button styles — consistently across the landing page and every lesson so the course feels like one cohesive product.</p>` },
      ],
    },
    {
      id: 'multimedia', title: 'Multimedia Design', icon: '🎬', color: 'var(--indigo)', pill: 'pill-indigo',
      description: 'Use audio, video, and graphics with purpose and accessibility in mind.',
      topics: [
        { id: 'audio-video-best-practices', title: 'Audio & Video Best Practices', duration: '5 min read', icon: '🎬',
          summary: 'Length, captions, and when video actually beats text.',
          body: `<p style="line-height:1.7;">Keep videos short and purposeful, always provide captions, and avoid autoplay with sound — let the learner choose when to engage.</p>` },
        { id: 'designing-graphics', title: 'Designing Effective Graphics', duration: '4 min read', icon: '📊',
          summary: 'Charts, diagrams, and labelled graphics that clarify rather than decorate.',
          body: `<p style="line-height:1.7;">A diagram should reduce text, not add to it. Use labelled graphics to connect parts of an image directly to explanations.</p>` },
        { id: 'multimedia-accessibility', title: 'Accessibility for Multimedia', duration: '5 min read', icon: '♿',
          summary: 'Captions, transcripts, alt text, and color contrast — designing for everyone.',
          body: `<p style="line-height:1.7;">Add alt text to every image, captions to every video, and transcripts for audio. Check color contrast so text stays readable for learners with low vision.</p>` },
      ],
    },
    {
      id: 'ai-learning-design', title: 'AI for Learning Design', icon: '🤖', color: 'var(--pillar-ai)', pill: 'pill-cyan',
      description: 'Use Lumio\'s AI as a creative partner — without losing your voice.',
      topics: [
        { id: 'ai-drafting', title: 'Using AI to Draft Content', duration: '4 min read', icon: '✨',
          summary: 'Letting AI generate a first pass, then making it your own.',
          body: `<p style="line-height:1.7;">AI is great at first drafts — outlines, descriptions, objectives. Treat its output as a starting point: review, simplify, and add your own examples.</p>` },
        { id: 'ai-assessments', title: 'AI-Assisted Assessment Writing', duration: '4 min read', icon: '✅',
          summary: 'Generating knowledge checks that are aligned and not too easy.',
          body: `<p style="line-height:1.7;">Ask AI to generate a knowledge check from your lesson content, then check that the distractors (wrong answers) are plausible — not obviously silly.</p>` },
        { id: 'reviewing-ai', title: 'Reviewing AI Suggestions Critically', duration: '4 min read', icon: '🔍',
          summary: 'Spotting generic, inaccurate, or off-tone AI output before it ships.',
          body: `<p style="line-height:1.7;">Always fact-check AI-generated content against your source material, and rewrite anything that sounds generic so it matches your organization's voice.</p>` },
      ],
    },
    {
      id: 'evaluation', title: 'Learning Evaluation', icon: '📈', color: 'var(--teal)', pill: 'pill-teal',
      description: 'Find out if your course actually worked — and improve it.',
      topics: [
        { id: 'kirkpatrick', title: 'Kirkpatrick\'s Four Levels', duration: '5 min read', icon: '📈',
          summary: 'Reaction, Learning, Behavior, Results — the classic evaluation framework.',
          body: `<p style="line-height:1.7;">Level 1 (Reaction) asks "did they like it?" Level 4 (Results) asks "did it move the business needle?" Most teams start at Level 1-2 and grow from there.</p>` },
        { id: 'gathering-feedback', title: 'Gathering Learner Feedback', duration: '3 min read', icon: '🗣️',
          summary: 'Quick surveys and signals that tell you what to fix next.',
          body: `<p style="line-height:1.7;">A single end-of-course question — "What's one thing that was unclear?" — often surfaces more useful feedback than a 10-question survey.</p>` },
        { id: 'iterating-on-data', title: 'Iterating Based on Data', duration: '4 min read', icon: '🔁',
          summary: 'Using completion rates and quiz scores to find weak spots.',
          body: `<p style="line-height:1.7;">If most learners miss the same knowledge check question, the issue is usually the content before it, not the learner. Revisit that lesson first.</p>` },
      ],
    },
  ],

  // ============================================================
  // CONTEXTUAL AI COACHING RULES
  // Each rule: a check function (course, lessons) -> boolean, plus the
  // recommended academy path/topic and a message to show.
  // ============================================================
  coachingRules: [
    {
      id: 'cr-assessment-coverage',
      message: (course) => `Your course "${course.title}" has ${course.lessons.length} lesson${course.lessons.length===1?'':'s'} but only ${course.assessments.length} assessment${course.assessments.length===1?'':'s'}. Aligning a check to each objective helps learners (and you) confirm it landed.`,
      pathId: 'assessment', topicId: 'aligning-assessments',
      test: (course) => course.lessons.length >= 2 && course.assessments.length < Math.ceil(course.objectives.length / 2),
    },
    {
      id: 'cr-chunking',
      message: () => `One of your lessons has a lot of text in a row. Breaking it into smaller chunks (with a "Continue" divider) tends to improve retention.`,
      pathId: 'content', topicId: 'chunking',
      test: (course, lessonBlocks) => {
        if (!lessonBlocks) return false;
        const textTypes = ['paragraph','heading_paragraph','stmt_info','stmt_tip','stmt_success','stmt_warning','stmt_error','stmt_note'];
        let streak = 0;
        for (const b of lessonBlocks) {
          if (textTypes.includes(b.type)) { streak++; if (streak >= 4) return true; }
          else streak = 0;
        }
        return false;
      },
    },
    {
      id: 'cr-weak-objectives',
      message: () => `A couple of your learning objectives use vague verbs like "understand" or "know" — these are hard to assess. Want to tighten them up?`,
      pathId: 'objectives', topicId: 'avoiding-vague-verbs',
      test: (course) => course.objectives.some(o => LumioData.vagueVerbs.includes((o.verb||'').toLowerCase())),
    },
    {
      id: 'cr-no-interactivity',
      message: () => `This course is mostly text and images so far. A scenario, accordion, or flashcard set can boost engagement without much extra work.`,
      pathId: 'engagement', topicId: 'interactive-elements',
      test: (course, lessonBlocks) => {
        if (!lessonBlocks) return false;
        const interactiveTypes = ['accordion','tabs','labelled_graphic','process','scenario','flashcard_grid','flashcard_stack','carousel'];
        return !lessonBlocks.some(b => interactiveTypes.includes(b.type));
      },
    },
  ],

  bloomVerbs: {
    'Remember': ['List', 'Recall', 'Identify', 'Name', 'Define'],
    'Understand': ['Explain', 'Summarize', 'Describe', 'Classify'],
    'Apply': ['Demonstrate', 'Use', 'Solve', 'Implement'],
    'Analyze': ['Compare', 'Differentiate', 'Organize', 'Examine'],
    'Evaluate': ['Justify', 'Critique', 'Assess', 'Recommend'],
    'Create': ['Design', 'Develop', 'Construct', 'Compose'],
  },

  vagueVerbs: ['understand', 'know', 'learn about', 'be familiar with', 'appreciate'],

  themes: [
    { id: 't1', name: 'Indigo Focus', gradient: 'linear-gradient(135deg,#4F46E5,#06B6D4)' },
    { id: 't2', name: 'Warm Coral', gradient: 'linear-gradient(135deg,#F97316,#D946EF)' },
    { id: 't3', name: 'Teal Calm', gradient: 'linear-gradient(135deg,#14B8A6,#06B6D4)' },
    { id: 't4', name: 'Violet Studio', gradient: 'linear-gradient(135deg,#7C3AED,#D946EF)' },
  ],

  // ============================================================
  // THEME DESIGNER OPTIONS (Wizard Step 7 + Course Settings)
  // ============================================================
  themeDesigner: {
    presetPalettes: [
      { primary: '#7C3AED', secondary: '#4F46E5', accent: '#06B6D4', name: 'Violet Studio' },
      { primary: '#4F46E5', secondary: '#06B6D4', accent: '#14B8A6', name: 'Indigo Focus' },
      { primary: '#F97316', secondary: '#D946EF', accent: '#7C3AED', name: 'Warm Coral' },
      { primary: '#14B8A6', secondary: '#06B6D4', accent: '#4F46E5', name: 'Teal Calm' },
      { primary: '#D946EF', secondary: '#7C3AED', accent: '#F97316', name: 'Magenta Pop' },
      { primary: '#06B6D4', secondary: '#14B8A6', accent: '#FACC15', name: 'Cyan Bright' },
      { primary: '#F97316', secondary: '#FACC15', accent: '#7C3AED', name: 'Sunset' },
      { primary: '#4F46E5', secondary: '#D946EF', accent: '#06B6D4', name: 'Cosmic' },
    ],
    fontFamilies: [
      { id: 'poppins-inter', display: "'Poppins', sans-serif", body: "'Inter', sans-serif", label: 'Poppins + Inter' },
      { id: 'playfair-source', display: "'Playfair Display', serif", body: "'Source Sans Pro', sans-serif", label: 'Playfair + Source Sans' },
      { id: 'montserrat-nunito', display: "'Montserrat', sans-serif", body: "'Nunito Sans', sans-serif", label: 'Montserrat + Nunito' },
      { id: 'space-grotesk', display: "'Space Grotesk', sans-serif", body: "'Inter', sans-serif", label: 'Space Grotesk + Inter' },
      { id: 'merriweather-lato', display: "'Merriweather', serif", body: "'Lato', sans-serif", label: 'Merriweather + Lato' },
    ],
    fontSizes: [
      { id: 'sm', label: 'Small', value: '14px' },
      { id: 'md', label: 'Medium', value: '16px' },
      { id: 'lg', label: 'Large', value: '18px' },
    ],
    buttonStyles: [
      { id: 'pill', label: 'Pill', value: 'var(--r-pill)' },
      { id: 'rounded', label: 'Rounded', value: 'var(--r-md)' },
      { id: 'square', label: 'Square', value: '4px' },
    ],
    cornerRadii: [
      { id: 'sharp', label: 'Sharp', value: '4px' },
      { id: 'soft', label: 'Soft', value: 'var(--r-lg)' },
      { id: 'round', label: 'Round', value: 'var(--r-xl)' },
    ],
    backgroundStyles: [
      { id: 'white', label: 'White', value: '#FFFFFF' },
      { id: 'light-grey', label: 'Light Grey', value: '#F1F1F4' },
      { id: 'flat', label: 'Flat Theme', value: 'var(--surface-50)' },
      { id: 'mesh', label: 'Aurora Mesh', value: 'var(--gradient-mesh)' },
      { id: 'soft-gradient', label: 'Soft Gradient', value: 'linear-gradient(180deg, var(--pastel-lavender), var(--surface-0))' },
    ],
  },

  // ============================================================
  // COURSE LANDING PAGE LAYOUTS
  // ============================================================
  landingLayouts: [
    { id: 'A', name: 'Centered', icon: '🎯', description: 'Hero image fills the top, title and description centered below — clean and classic.', isDefault: true },
    { id: 'B', name: 'Text Left / Image Right', icon: '◧', description: 'Title and description on the left, hero image on the right — great for a strong visual.' },
    { id: 'C', name: 'Full Banner', icon: '▭', description: 'Full-width hero banner with text overlaid — bold, magazine-style opener.' },
    { id: 'D', name: 'Split Screen', icon: '◫', description: 'Two equal halves — image on one side, content on the other, edge to edge.' },
    { id: 'E', name: 'Minimal', icon: '—', description: 'No hero image — just title, description, and a clean call to action.' },
  ],

  // ============================================================
  // HELP ME DECIDE — EXPANDED Q&A
  // ============================================================
  decideQuestions: [
    { id: 'audience', label: 'Who is this for?', type: 'choice', options: [
      { value: 'new-hires', label: 'New hires / onboarding' },
      { value: 'all-staff', label: 'All staff / broad audience' },
      { value: 'specialists', label: 'A specific role or team' },
    ]},
    { id: 'objectives', label: 'How many distinct things should learners walk away knowing how to do?', type: 'choice', options: [
      { value: 'one', label: 'Just one' },
      { value: 'few', label: 'A few related things' },
      { value: 'many', label: 'Many — it builds over time' },
    ]},
    { id: 'contentVolume', label: 'How much content do you already have?', type: 'choice', options: [
      { value: 'a-little', label: 'A little — a page or two' },
      { value: 'some', label: 'A moderate amount' },
      { value: 'a-lot', label: 'A lot — multiple documents or topics' },
    ]},
    { id: 'time', label: 'How much time should this take learners?', type: 'choice', options: [
      { value: 'under-10', label: 'Under 10 minutes' },
      { value: '10-30', label: '10–30 minutes' },
      { value: 'over-30', label: 'Over 30 minutes' },
    ]},
  ],

  // sample course created via wizard (used as default for course landing / lesson builder)
  courseTemplate: {
    id: 'c1',
    title: 'New Hire Onboarding',
    description: 'A friendly introduction to our company, culture, tools, and your first 30 days — designed to help new team members feel confident and connected from day one.',
    audience: 'New employees, all departments, no prior company knowledge required',
    duration: '30-45 min',
    objectives: [
      { verb: 'Identify', text: 'the company’s mission, values, and organizational structure' },
      { verb: 'Explain', text: 'how to use core workplace tools (email, chat, HR portal)' },
      { verb: 'Demonstrate', text: 'the steps to complete your first-week checklist' },
    ],
    learnerOutcomes: [
      'Understand what we stand for and how teams fit together',
      'Get comfortable with the tools you’ll use every day',
      'Know exactly what to do in your first week',
    ],
    theme: 't1',
    lessons: [
      { id: 'l1', title: 'Welcome to the Team', objectiveIndex: 0, duration: '8 min' },
      { id: 'l2', title: 'Your Toolkit: Apps & Access', objectiveIndex: 1, duration: '10 min' },
      { id: 'l3', title: 'Your First Week Checklist', objectiveIndex: 2, duration: '7 min' },
    ],
    assessments: [
      { id: 'a1', title: 'Onboarding Knowledge Check', type: 'Quiz', objectives: [0,1,2] },
    ],
  },

  // ============================================================
  // CLIENT DEMONSTRATION DATASET
  // Three fully-populated demo courses (distinct themes, hero
  // layouts, landing configurations, and lesson structures).
  // Seeded into LumioState.courses / LumioState.lessons on first
  // load — see bootstrapDemoCourses() in js/app.js.
  // ============================================================
  demoCourses: {
    // ---- Project p1: New Hire Onboarding (Indigo Focus theme) ----
    p1: {
      id: 'p1',
      title: 'New Hire Onboarding',
      description: 'A friendly introduction to our company, culture, tools, and your first 30 days — designed to help new team members feel confident and connected from day one.',
      audience: 'New employees, all departments, no prior company knowledge required',
      duration: '30-45 min',
      objectives: [
        { verb: 'Identify', text: 'the company’s mission, values, and organizational structure' },
        { verb: 'Explain', text: 'how to use core workplace tools (email, chat, HR portal)' },
        { verb: 'Demonstrate', text: 'the steps to complete your first-week checklist' },
      ],
      learnerOutcomes: [
        'Understand what we stand for and how teams fit together',
        'Get comfortable with the tools you’ll use every day',
        'Know exactly what to do in your first week',
      ],
      theme: 't1',
      themeDesign: {
        primary: '#4F46E5', secondary: '#06B6D4', accent: '#14B8A6',
        fontId: 'poppins-inter', fontSizeId: 'md', buttonStyleId: 'pill', radiusId: 'soft', bgStyleId: 'soft-gradient',
      },
      landingLayout: 'A',
      heroImage: { src: null, fileName: null, mimeType: null, displayMode: 'cover', posX: 'center', posY: 'center', scale: 100 },
      heroSettings: { height: 'medium', overlay: { mode: 'theme', opacity: 0.35 }, roundedCorners: true, titlePosition: 'bottom', textAlign: 'center', textColor: 'auto' },
      lessons: [
        { id: 'p1-l1', title: 'Welcome to the Team', objectiveIndex: 0, duration: '8 min' },
        { id: 'p1-l2', title: 'Your Toolkit: Apps & Access', objectiveIndex: 1, duration: '10 min' },
        { id: 'p1-l3', title: 'Your First Week Checklist', objectiveIndex: 2, duration: '7 min' },
      ],
      assessments: [
        { id: 'p1-a1', title: 'Onboarding Knowledge Check', type: 'Quiz', objectives: [0,1,2] },
      ],
    },

    // ---- Project p2: Workplace Safety Basics (Teal Calm theme) ----
    p2: {
      id: 'p2',
      title: 'Workplace Safety Basics',
      description: 'A practical introduction to staying safe at work — covering common hazards, personal protective equipment, and what to do in an emergency.',
      audience: 'All staff working in office, workshop, and warehouse environments',
      duration: '20-25 min',
      objectives: [
        { verb: 'Identify', text: 'common workplace hazards and how to report them' },
        { verb: 'Explain', text: 'when and how to use personal protective equipment (PPE)' },
        { verb: 'Demonstrate', text: 'the correct response to common workplace emergencies' },
      ],
      learnerOutcomes: [
        'Recognise hazards before they cause harm',
        'Know which PPE to wear and when',
        'Respond confidently if something goes wrong',
      ],
      theme: 't3',
      themeDesign: {
        primary: '#14B8A6', secondary: '#06B6D4', accent: '#4F46E5',
        fontId: 'montserrat-nunito', fontSizeId: 'md', buttonStyleId: 'square', radiusId: 'round', bgStyleId: 'light-grey',
      },
      landingLayout: 'B',
      heroImage: { src: null, fileName: null, mimeType: null, displayMode: 'cover', posX: 'center', posY: 'center', scale: 100 },
      heroSettings: { height: 'small', overlay: { mode: 'light', opacity: 0.3 }, roundedCorners: true, titlePosition: 'top', textAlign: 'left', textColor: 'auto' },
      lessons: [
        { id: 'ws1', title: 'Recognising Workplace Hazards', objectiveIndex: 0, duration: '6 min' },
        { id: 'ws2', title: 'Personal Protective Equipment', objectiveIndex: 1, duration: '8 min' },
        { id: 'ws3', title: 'Emergency Procedures & Reporting', objectiveIndex: 2, duration: '6 min' },
      ],
      assessments: [
        { id: 'wsa1', title: 'Safety Knowledge Check', type: 'Quiz', objectives: [0,1,2] },
      ],
    },

    // ---- Project p7: Formula 1 Fundamentals (Sunset theme) ----
    p7: {
      id: 'p7',
      title: 'Formula 1 Fundamentals',
      description: 'A fast-paced introduction to Formula 1 — the cars, the teams, how a race weekend works, and the basics of scoring and strategy.',
      audience: 'New starters and partner staff with little or no prior F1 knowledge',
      duration: '20-25 min',
      objectives: [
        { verb: 'Identify', text: 'the key components of an F1 car and the roles within a race team' },
        { verb: 'Explain', text: 'the format of a typical race weekend' },
        { verb: 'Demonstrate', text: 'an understanding of scoring, strategy basics, and paddock etiquette' },
      ],
      learnerOutcomes: [
        'Talk confidently about the cars and the people behind them',
        'Follow a race weekend from practice to chequered flag',
        'Understand how points, strategy, and etiquette fit together',
      ],
      theme: 't2',
      themeDesign: {
        primary: '#F97316', secondary: '#FACC15', accent: '#7C3AED',
        fontId: 'space-grotesk', fontSizeId: 'lg', buttonStyleId: 'rounded', radiusId: 'sharp', bgStyleId: 'white',
      },
      landingLayout: 'C',
      heroImage: { src: null, fileName: null, mimeType: null, displayMode: 'cover', posX: 'center', posY: 'center', scale: 100 },
      heroSettings: { height: 'large', overlay: { mode: 'dark', opacity: 0.45 }, roundedCorners: true, titlePosition: 'center', textAlign: 'center', textColor: 'light' },
      lessons: [
        { id: 'f1a', title: 'The Cars & The Teams', objectiveIndex: 0, duration: '9 min' },
        { id: 'f1b', title: 'Race Weekend Format', objectiveIndex: 1, duration: '8 min' },
        { id: 'f1c', title: 'Scoring, Strategy & Etiquette', objectiveIndex: 2, duration: '7 min' },
      ],
      assessments: [
        { id: 'f1qz', title: 'F1 Fundamentals Quiz', type: 'Quiz', objectives: [0,1,2] },
      ],
    },
  },

  // Lesson content for the demo dataset, keyed by lesson id.
  // l1 (Welcome to the Team) reuses sampleLessonBlocks below.
  demoLessons: {
    l2: [
      { type: 'heading_paragraph', data: {
        heading: 'Your Toolkit: Apps & Access',
        body: 'Here’s a quick tour of the apps and accounts you’ll use every day — most are already set up and waiting for you.'
      }},
      { type: 'list_bullet', data: {
        heading: 'Tools you’ll use every day',
        items: ['Email & Calendar (Google Workspace)', 'Team Chat (Slack)', 'HR Portal (BambooHR)', 'Project Tracker (Linear)', 'Knowledge Base (Notion)']
      }},
      { type: 'stmt_info', data: { text: 'Most accounts are provisioned automatically before your start date. If something is missing, raise a ticket with IT — it’s usually sorted within a few hours.' } },
      { type: 'table', data: {
        rows: [
          ['Tool', 'Purpose', 'Access'],
          ['Slack', 'Team communication', 'Auto-provisioned on day 1'],
          ['BambooHR', 'Leave & payroll', 'Auto-provisioned on day 1'],
          ['Linear', 'Project tracking', 'Request via IT portal'],
        ]
      }},
      { type: 'stmt_warning', data: { text: 'Never share your login credentials with anyone, including colleagues — use shared logins or password managers for shared accounts instead.' } },
      { type: 'continue', data: { label: 'Continue' } },
      { type: 'kc_multiple_choice', data: {
        question: 'Where would you go to check your remaining annual leave?',
        options: ['Slack', 'BambooHR', 'Linear', 'Notion'],
        correct: 1,
      }},
    ],
    l3: [
      { type: 'heading_paragraph', data: {
        heading: 'Your First Week Checklist',
        body: 'Your first week is about getting set up, meeting people, and finding your feet. Here’s what to focus on.'
      }},
      { type: 'list_checkbox', data: {
        heading: 'Complete these by Friday',
        items: ['Set up your workstation & accounts', 'Meet your onboarding buddy', 'Complete mandatory compliance training', 'Schedule a 1:1 with your manager', 'Join your team’s weekly stand-up']
      }},
      { type: 'accordion', data: {
        heading: 'Who to contact',
        items: [
          { title: 'IT Support', content: 'For account access, hardware issues, or software requests — reach out on the #it-support Slack channel.' },
          { title: 'HR Team', content: 'For questions about pay, benefits, or leave — email hr@company.com or check BambooHR.' },
          { title: 'Your Manager', content: 'For anything about your role, priorities, or how you’re settling in — your manager is your first point of contact.' },
        ]
      }},
      { type: 'stmt_success', data: { text: 'You’re all set! Once you’ve worked through this checklist, you’ll be ready to dive into your first projects.' } },
      { type: 'kc_multiple_choice', data: {
        question: 'Who should you contact first with questions about your role and priorities?',
        options: ['IT Support', 'HR Team', 'Your Manager', 'Finance'],
        correct: 2,
      }},
    ],
    ws1: [
      { type: 'heading_paragraph', data: {
        heading: 'Recognising Workplace Hazards',
        body: 'A hazard is anything that could cause harm. Learning to spot them quickly is the first step to keeping yourself and others safe.'
      }},
      { type: 'list_bullet', data: {
        heading: 'Common hazard categories',
        items: ['Slips, trips, and falls', 'Manual handling injuries', 'Electrical hazards', 'Fire hazards', 'Chemical exposure']
      }},
      { type: 'image_text', data: {
        heading: 'Spot the hazard',
        body: 'Hazard signage uses consistent colours and shapes — yellow and black for caution, red for prohibition, and green for safe conditions or emergency exits.',
        imageLabel: 'Hazard signage examples'
      }},
      { type: 'stmt_warning', data: { text: 'If you spot a hazard, report it to your supervisor or facilities team immediately — don’t attempt repairs yourself unless trained and authorised.' } },
      { type: 'continue', data: { label: 'Continue' } },
      { type: 'kc_multiple_choice', data: {
        question: 'What should you do if you notice a frayed electrical cable?',
        options: ['Tape it up yourself', 'Ignore it, it’s probably fine', 'Report it to your supervisor or facilities team', 'Unplug it and take it home to fix'],
        correct: 2,
      }},
    ],
    ws2: [
      { type: 'heading_paragraph', data: {
        heading: 'Personal Protective Equipment',
        body: 'Personal Protective Equipment (PPE) is your last line of defence against workplace hazards. Knowing what to wear, and when, matters.'
      }},
      { type: 'table', data: {
        rows: [
          ['PPE Item', 'Required In', 'Notes'],
          ['Safety glasses', 'Workshop & warehouse', 'Must be worn at all times in marked zones'],
          ['Hi-vis vest', 'Loading bay', 'Required for all staff and visitors'],
          ['Steel-toe boots', 'Warehouse floor', 'Provided during induction'],
          ['Hearing protection', 'Machine areas', 'Required near equipment over 85dB'],
        ]
      }},
      { type: 'stmt_tip', data: { text: 'Check your PPE for damage or wear before each use — a cracked lens or worn strap can mean it won’t protect you when it counts.' } },
      { type: 'stmt_error', data: { text: 'Never operate machinery or enter a marked PPE zone without the required equipment, even for a moment.' } },
      { type: 'kc_multiple_choice', data: {
        question: 'Which item of PPE is required in the loading bay?',
        options: ['Hearing protection', 'Hi-vis vest', 'Safety glasses', 'None — PPE isn’t required there'],
        correct: 1,
      }},
    ],
    ws3: [
      { type: 'heading_paragraph', data: {
        heading: 'Emergency Procedures & Reporting',
        body: 'Knowing what to do — and who to tell — in the first few moments of an emergency can make all the difference.'
      }},
      { type: 'accordion', data: {
        heading: 'In case of…',
        items: [
          { title: 'Fire', content: 'Raise the alarm, leave via your nearest marked exit, and assemble at the designated point. Do not use lifts.' },
          { title: 'Injury', content: 'Call for a qualified first aider and notify your supervisor. Do not move a seriously injured person unless there is immediate danger.' },
          { title: 'Chemical spill', content: 'Evacuate the immediate area, alert your supervisor, and do not attempt cleanup unless trained for that substance.' },
        ]
      }},
      { type: 'list_numbered', data: {
        heading: 'If you witness an incident',
        items: ['Ensure your own safety first', 'Alert nearby colleagues and your supervisor', 'Call emergency services if required', 'Complete an incident report within 24 hours']
      }},
      { type: 'stmt_success', data: { text: 'Reporting near-misses — not just incidents — helps us spot patterns and prevent future injuries before they happen.' } },
      { type: 'continue', data: { label: 'Continue' } },
      { type: 'kc_multiple_choice', data: {
        question: 'What is the first thing you should do if you witness an incident?',
        options: ['Complete an incident report', 'Ensure your own safety first', 'Call your manager', 'Take a photo for the report'],
        correct: 1,
      }},
    ],
    f1a: [
      { type: 'heading_paragraph', data: {
        heading: 'The Cars & The Teams',
        body: 'Every Formula 1 car is a highly tuned machine built by one of ten teams, each fielding two drivers across a 24-race season.'
      }},
      { type: 'image_text', data: {
        heading: 'Anatomy of an F1 car',
        body: 'From the front wing to the rear diffuser, every surface is designed to manage airflow, generate downforce, and keep the car stable at speeds over 300km/h.',
        imageLabel: 'F1 car diagram'
      }},
      { type: 'list_bullet', data: {
        heading: 'Key roles in a race team',
        items: ['Drivers — two per team, racing for points and the championship', 'Race Engineer — works directly with the driver on car setup', 'Strategist — plans pit stops, tyre choices, and race tactics', 'Pit Crew — performs pit stops in under three seconds', 'Team Principal — leads the team’s overall operation']
      }},
      { type: 'stmt_info', data: { text: 'There are 10 teams and 20 drivers on the grid each season, competing for both the Drivers’ and Constructors’ Championships.' } },
      { type: 'continue', data: { label: 'Continue' } },
      { type: 'kc_multiple_choice', data: {
        question: 'Who is responsible for planning pit stops and tyre strategy?',
        options: ['The Team Principal', 'The Race Engineer', 'The Strategist', 'The Pit Crew'],
        correct: 2,
      }},
    ],
    f1b: [
      { type: 'heading_paragraph', data: {
        heading: 'Race Weekend Format',
        body: 'A typical Grand Prix weekend builds from free practice, through qualifying, to the race itself — each session serving a different purpose.'
      }},
      { type: 'list_numbered', data: {
        heading: 'A typical race weekend',
        items: ['Practice sessions (FP1–FP3) — car setup and tyre testing', 'Qualifying — sets the starting grid for the race', 'Sprint — a short-format race held on selected weekends', 'The Grand Prix — the main, points-paying event']
      }},
      { type: 'table', data: {
        rows: [
          ['Session', 'Purpose', 'Duration'],
          ['Practice', 'Car setup & tyre testing', '60 minutes each'],
          ['Qualifying', 'Determines grid order', 'Approx. 1 hour'],
          ['Race', 'Points-paying main event', 'Race distance ~305km'],
        ]
      }},
      { type: 'stmt_tip', data: { text: 'Weather can change everything — a sudden rain shower during qualifying or the race often shakes up the order completely.' } },
      { type: 'kc_multiple_choice', data: {
        question: 'What determines the starting grid order for the race?',
        options: ['Practice session times', 'Qualifying', 'Championship standings', 'A random draw'],
        correct: 1,
      }},
    ],
    f1c: [
      { type: 'heading_paragraph', data: {
        heading: 'Scoring, Strategy & Etiquette',
        body: 'Points decide the championship, but strategy decides how teams get there — and a little etiquette goes a long way in the paddock.'
      }},
      { type: 'list_bullet', data: {
        heading: 'Points for the top 10 finishers',
        items: ['1st: 25 points', '2nd: 18 points', '3rd: 15 points', '4th: 12 points', '5th: 10 points', '6th–10th: 8, 6, 4, 2, 1 points', 'Plus 1 bonus point for the fastest lap (if finishing in the top 10)']
      }},
      { type: 'accordion', data: {
        heading: 'Strategy basics',
        items: [
          { title: 'Tyre strategy', content: 'Teams choose between tyre compounds, balancing grip and durability — most races require at least one pit stop for a tyre change.' },
          { title: 'Pit stops', content: 'A pit stop changes all four tyres in under three seconds, but timing it well relative to rivals is a major part of race strategy.' },
          { title: 'Safety cars', content: 'When a safety car is deployed, the field bunches up — often creating a strategic opportunity (or risk) for an early pit stop.' },
        ]
      }},
      { type: 'stmt_note', data: { text: 'In the paddock: wear your pass visibly at all times, follow photography restrictions in team areas, and give team personnel space when they’re working.' } },
      { type: 'continue', data: { label: 'Continue' } },
      { type: 'kc_multiple_choice', data: {
        question: 'How many points does a race winner receive?',
        options: ['10', '18', '25', '30'],
        correct: 2,
      }},
    ],
  },

  // ============================================================
  // BLOCK LIBRARY DEFINITION
  // ============================================================
  blockLibrary: [
    { category: 'Recommended', dynamic: true, icon: '✨', blocks: [] },
    { category: 'Text', icon: '📝', blocks: [
      { id: 'paragraph', name: 'Paragraph', icon: '¶' },
      { id: 'heading_paragraph', name: 'Heading & Paragraph', icon: 'H¶' },
      { id: 'heading', name: 'Heading', icon: 'H' },
      { id: 'columns', name: 'Columns', icon: '▥' },
      { id: 'table', name: 'Table', icon: '▦' },
    ]},
    { category: 'Statements', icon: '💬', blocks: [
      { id: 'stmt_info', name: 'Information', icon: 'ℹ️' },
      { id: 'stmt_tip', name: 'Tip', icon: '💡' },
      { id: 'stmt_success', name: 'Success', icon: '✅' },
      { id: 'stmt_warning', name: 'Warning', icon: '⚠️' },
      { id: 'stmt_error', name: 'Error / Critical Alert', icon: '⛔' },
      { id: 'stmt_note', name: 'Note', icon: '📝' },
    ]},
    { category: 'Quotes', icon: '”', blocks: [
      { id: 'quote1', name: 'Quote Style 1', icon: '”' },
      { id: 'quote2', name: 'Quote Style 2', icon: '”' },
      { id: 'quote3', name: 'Quote Style 3', icon: '”' },
      { id: 'quote4', name: 'Quote Style 4', icon: '”' },
      { id: 'quote_image', name: 'Quote on Image', icon: '🖼”' },
      { id: 'quote_carousel', name: 'Quote Carousel', icon: '🔄' },
    ]},
    { category: 'Lists', icon: '☰', blocks: [
      { id: 'list_numbered', name: 'Numbered', icon: '1.' },
      { id: 'list_checkbox', name: 'Checkbox', icon: '☑' },
      { id: 'list_bullet', name: 'Bullet', icon: '•' },
    ]},
    { category: 'Images', icon: '🖼️', blocks: [
      { id: 'image', name: 'Image', icon: '🖼' },
      { id: 'image_text', name: 'Image & Text', icon: '🖼¶' },
      { id: 'text_on_image', name: 'Text on Image', icon: '🖼T' },
    ]},
    { category: 'Gallery', icon: '🎞️', blocks: [
      { id: 'carousel', name: 'Carousel', icon: '🔄' },
      { id: 'column_grid', name: 'Column Grid', icon: '▦' },
    ]},
    { category: 'Multimedia', icon: '🎬', blocks: [
      { id: 'audio', name: 'Audio', icon: '🔊' },
      { id: 'video', name: 'Video', icon: '▶' },
      { id: 'file', name: 'File Attachment', icon: '📎' },
    ]},
    { category: 'Interactive', icon: '🧩', blocks: [
      { id: 'accordion', name: 'Accordion', icon: '⬇' },
      { id: 'tabs', name: 'Tabs', icon: '🗂' },
      { id: 'labelled_graphic', name: 'Labelled Graphics', icon: '📍' },
      { id: 'process', name: 'Process', icon: '➡' },
      { id: 'scenario', name: 'Scenario', icon: '🌳' },
      { id: 'flashcard_grid', name: 'Flashcard Grid', icon: '🗃' },
      { id: 'flashcard_stack', name: 'Flashcard Stack', icon: '🗂' },
      { id: 'button', name: 'Button', icon: '🔘' },
    ]},
    { category: 'Charts', icon: '📊', blocks: [
      { id: 'chart_bar', name: 'Bar', icon: '📊' },
      { id: 'chart_line', name: 'Line', icon: '📈' },
      { id: 'chart_pie', name: 'Pie', icon: '🥧' },
    ]},
    { category: 'Dividers', icon: '➖', blocks: [
      { id: 'continue', name: 'Continue', icon: '⏵' },
      { id: 'numbered_divider', name: 'Numbered Divider', icon: '①' },
      { id: 'line_divider', name: 'Line Divider', icon: '—' },
      { id: 'spacer', name: 'Spacer', icon: '⬜' },
    ]},
    { category: 'Knowledge Checks', icon: '✅', blocks: [
      { id: 'kc_multiple_choice', name: 'Multiple Choice', icon: '◉' },
      { id: 'kc_multiple_response', name: 'Multiple Response', icon: '☑' },
      { id: 'kc_matching', name: 'Matching', icon: '⇄' },
      { id: 'kc_fill_gap', name: 'Fill the Gap', icon: '▭' },
      { id: 'kc_ordering', name: 'Ordering', icon: '↕' },
    ]},
  ],

  // sample pre-populated lesson content for "Welcome to the Team"
  sampleLessonBlocks: [
    {
      type: 'heading_paragraph',
      data: {
        heading: 'Welcome to the Team! 👋',
        body: 'We’re so glad you’re here. This lesson will introduce you to our mission, our values, and how our teams work together — the foundation for everything else in your onboarding.'
      }
    },
    {
      type: 'image_text',
      data: {
        heading: 'Our Mission',
        body: 'We exist to help people turn what they know into learning experiences that genuinely help others grow. Every team, from Engineering to Customer Success, plays a part in that mission.',
        imageLabel: 'Team photo placeholder'
      }
    },
    {
      type: 'stmt_tip',
      data: { text: '“Great onboarding isn’t a single day — it’s the first chapter of a much longer story.”' }
    },
    {
      type: 'list_bullet',
      data: {
        heading: 'Our Core Values',
        items: ['Curiosity over certainty', 'Clarity over cleverness', 'Progress over perfection', 'People over process']
      }
    },
    {
      type: 'continue',
      data: { label: 'Continue' }
    },
    {
      type: 'accordion',
      data: {
        heading: 'How Our Teams Fit Together',
        items: [
          { title: 'Product & Engineering', content: 'Builds and maintains the Lumio platform.' },
          { title: 'Customer Success', content: 'Helps customers get the most out of Lumio.' },
          { title: 'Marketing & Sales', content: 'Shares our story and brings new customers on board.' },
        ]
      }
    },
    {
      type: 'kc_multiple_choice',
      data: {
        question: 'Which of the following best reflects one of our core values?',
        options: ['Perfection over progress', 'Certainty over curiosity', 'Clarity over cleverness', 'Process over people'],
        correct: 2,
      }
    },
  ],

  // ============================================================
  // SIMULATED AI RESPONSES
  // ============================================================
  ai: {
    formatRecommendation(answers) {
      // simple weighted scoring across audience, objectives, content volume, and time
      let score = 0;
      if (answers.objectives === 'many') score += 2;
      else if (answers.objectives === 'few') score += 1;

      if (answers.contentVolume === 'a-lot') score += 2;
      else if (answers.contentVolume === 'some') score += 1;

      if (answers.time === 'over-30') score += 2;
      else if (answers.time === '10-30') score += 1;

      if (answers.audience === 'all-staff') score += 1;

      if (score >= 3) {
        return {
          format: 'Course',
          rationale: 'Based on your answers, a Course works best — you have multiple related topics that build on each other, which benefits from structured lessons, a clear sequence, and aligned assessments.'
        };
      }
      return {
        format: 'Microlearning',
        rationale: 'Based on your answers, Microlearning works best — your goal is focused on one or two topics, and learners will get the most value from a short, targeted experience.'
      };
    },
    // Delegates to LumioAI (js/lumioAI.js) — the single source of truth for
    // all generated content. Kept here so existing call sites (wizard.js,
    // courseLanding.js, learnerPreview.js) don't need to change.
    generateDescription(title) {
      return LumioAI.generateDescription(title);
    },
    suggestObjectives(title, audience) {
      return LumioAI.generateObjectives({ title, audience });
    },
    blueprintFromObjectives(objectives) {
      return LumioAI.blueprintFromObjectives(objectives);
    },
    rewriteOutcomes(objectives) {
      return LumioAI.rewriteOutcomes(objectives);
    },
    navigationTips(lessonCount, assessmentCount, duration) {
      return LumioAI.generateNavigationTips({ lessonCount, assessmentCount, duration });
    },
    assistantReplies: {
      default: "I'm Lumio AI — I can help you draft content, suggest blocks, generate knowledge checks, or explain instructional design concepts. Try asking me something like “draft this lesson” or “suggest a knowledge check”.",
      'draft this lesson': "Here's a suggested structure: start with a Heading & Paragraph introduction, add an Image & Text block to illustrate the concept, include a Statement for emphasis, then a Knowledge Check to reinforce learning. I've added a few starter blocks to your canvas — feel free to edit them!",
      'suggest a knowledge check': "Based on this lesson's content, here's a suggested question: “Which of the following best reflects one of our core values?” with 4 multiple-choice options. I've added it to the bottom of your canvas.",
      'how am i doing': "This lesson looks great so far! You've got a good mix of text, visuals, and one interactive check. Consider adding one more visual element to break up the text in the middle section.",
      'generate alt text': "I've drafted alt text for your images based on the surrounding content — you can review and edit it in each image block's Content tab.",
    }
  }
};

// Config Update: single source of truth for the default themeDesign given to
// a brand-new course. Previously duplicated verbatim (and independently
// drifting) in wizard.js's ensureThemeDesign() and courseLanding.js's
// ensureCourseDesign() — both now call this instead of hardcoding their own
// copy. Does not affect any course that already has a themeDesign object
// (existing/imported/exported courses), since both call sites only invoke
// this when themeDesign is missing entirely.
function defaultThemeDesign() {
  const preset = LumioData.themeDesigner.presetPalettes[0];
  return {
    primary: preset.primary, secondary: preset.secondary, accent: preset.accent,
    fontId: 'poppins-inter', fontSizeId: 'md', buttonStyleId: 'pill', radiusId: 'soft', bgStyleId: 'white',
  };
}
