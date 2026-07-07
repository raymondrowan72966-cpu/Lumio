/* ============================================================
   LUMIO DATA â€” CONSTANTS, DESIGN TOKENS & INSTRUCTIONAL CONTENT
   ============================================================ */

const LumioData = {
  // gradient thumbnail presets, rotated across cards
  thumbGradients: [
    'linear-gradient(135deg,#7C3AED,#4F46E5)',
    'linear-gradient(135deg,#06B6D4,#14B8A6)',
    'linear-gradient(135deg,#F97316,#D946EF)',
    'linear-gradient(135deg,#4F46E5,#06B6D4)',
    'linear-gradient(135deg,#D946EF,#7C3AED)',
  ],

  // ============================================================
  // INSTRUCTIONAL DESIGN ACADEMY â€” 9 LEARNING PATHS
  // ============================================================
  academyPaths: [
    {
      id: 'foundations', title: 'Foundations', icon: 'ðŸ§­', color: 'var(--violet)', pill: 'pill-indigo',
      description: 'The big-picture ideas every instructional designer should know.',
      topics: [
        { id: 'what-is-id', title: 'What is Instructional Design?', duration: '4 min read', icon: 'ðŸ§­',
          summary: 'A friendly introduction to instructional design â€” what it is, why it matters, and how it differs from "just making slides."',
          body: `<p style="line-height:1.7;">Instructional design is the practice of creating learning experiences that help people gain specific knowledge or skills â€” efficiently, effectively, and enjoyably. It blends a bit of psychology, a bit of storytelling, and a bit of project management.</p>
                 <div class="card card-pad mt-16" style="background:var(--pastel-lavender); border:none;">
                   <p class="text-sm">Great instructional design starts with the <strong>learner's goal</strong>, not the content you already have.</p>
                 </div>` },
        { id: 'addie', title: 'The ADDIE Model', duration: '5 min read', icon: 'ðŸ”',
          summary: 'Analyze, Design, Develop, Implement, Evaluate â€” the classic five-phase framework for building learning.',
          body: `<p style="line-height:1.7;">ADDIE breaks course development into five phases: <strong>Analyze</strong> the problem and audience, <strong>Design</strong> the learning plan, <strong>Develop</strong> the content, <strong>Implement</strong> it with learners, and <strong>Evaluate</strong> the results.</p>
                 <div class="card card-pad mt-16" style="background:var(--pastel-cyan); border:none;">
                   <p class="text-sm">Lumio's Course Wizard mirrors ADDIE â€” the early steps (audience, objectives) are Analyze &amp; Design; the AI Blueprint kicks off Develop.</p>
                 </div>` },
        { id: 'sam', title: 'SAM (Successive Approximation Model)', duration: '4 min read', icon: 'ðŸ”„',
          summary: 'A faster, iterative alternative to ADDIE built around quick prototypes and feedback loops.',
          body: `<p style="line-height:1.7;">SAM favors rapid, repeated cycles of <em>prototype â†’ review â†’ refine</em> instead of one long linear process. Build something small, get feedback early, and adjust before investing in a full course.</p>` },
        { id: 'agile-ld', title: 'Agile Learning Design', duration: '5 min read', icon: 'âš¡',
          summary: 'Borrowing sprints, backlogs, and MVPs from software teams to ship learning faster.',
          body: `<p style="line-height:1.7;">Treat your course like a product: maintain a backlog of lessons, ship a minimum viable course, and improve it in sprints based on learner feedback and data.</p>` },
        { id: 'adult-learning', title: 'Adult Learning Principles', duration: '6 min read', icon: 'âœ¨',
          summary: 'Understand andragogy â€” how adult learners differ from students, and what motivates them.',
          body: `<div class="card card-pad" style="background:var(--pastel-pink); border:none;">
                   <p class="text-sm">Adult learners want to know <strong>"what's in it for me?"</strong> Frame outcomes around real tasks they'll do, not abstract topics.</p>
                 </div>` },
      ],
    },
    {
      id: 'objectives', title: 'Learning Objectives', icon: 'ðŸŽ¯', color: 'var(--pillar-learn)', pill: 'pill-indigo',
      description: 'Set clear, measurable destinations for every course and lesson.',
      topics: [
        { id: 'writing-objectives', title: 'Writing Measurable Learning Objectives', duration: '6 min read', icon: 'ðŸŽ¯',
          summary: 'Use Bloomâ€™s Taxonomy to write objectives that are specific, observable, and easy to assess.',
          body: `<div class="card card-pad" style="background:var(--pastel-lavender); border:none;">
                   <p class="text-sm"><strong>Try this formula:</strong></p>
                   <p class="text-sm mt-8">"By the end of this lesson, learners will be able to <strong>[verb]</strong> [content] [condition]."</p>
                   <p class="text-sm text-muted mt-8">Example: "...will be able to <strong>identify</strong> the five steps of our return process when shown a customer scenario."</p>
                 </div>` },
        { id: 'blooms-verbs', title: 'Bloomâ€™s Taxonomy Verb Bank', duration: '2 min read', icon: 'ðŸ“–',
          summary: 'A reference list of strong, measurable verbs for every level â€” from Remember to Create.',
          body: `<div class="card card-pad" style="background:var(--pastel-pink); border:none;">
                   <p class="text-sm"><strong>Remember:</strong> List, Recall, Identify, Name, Define<br/>
                   <strong>Understand:</strong> Explain, Summarize, Describe, Classify<br/>
                   <strong>Apply:</strong> Demonstrate, Use, Solve, Implement<br/>
                   <strong>Analyze:</strong> Compare, Differentiate, Organize, Examine<br/>
                   <strong>Evaluate:</strong> Justify, Critique, Assess, Recommend<br/>
                   <strong>Create:</strong> Design, Develop, Construct, Compose</p>
                 </div>` },
        { id: 'constructive-alignment', title: 'Constructive Alignment 101', duration: '4 min read', icon: 'ðŸ”—',
          summary: 'Make sure your objectives, content, and assessments all point in the same direction.',
          body: `<div class="card card-pad" style="background:var(--pastel-lavender); border:none;">
                   <p class="text-sm">Constructive alignment means your <strong>objectives</strong>, <strong>content</strong>, and <strong>assessments</strong> all point at the same outcome. If you assess something you never taught, learners will struggle â€” and it's not their fault.</p>
                 </div>` },
        { id: 'avoiding-vague-verbs', title: 'Avoiding Vague Verbs', duration: '3 min read', icon: 'ðŸš«',
          summary: 'Why words like "understand" and "know" make objectives hard to assess â€” and what to use instead.',
          body: `<p style="line-height:1.7;">Vague verbs like <em>understand</em>, <em>know</em>, <em>learn about</em>, <em>be familiar with</em>, and <em>appreciate</em> can't be observed or measured. Swap them for action verbs from Bloom's Taxonomy that describe something a learner can <em>do</em>.</p>` },
      ],
    },
    {
      id: 'assessment', title: 'Assessment Design', icon: 'âœ…', color: 'var(--pillar-success)', pill: 'pill-teal',
      description: 'Check for understanding in ways that are fair, useful, and aligned to your goals.',
      topics: [
        { id: 'course-vs-micro', title: 'Choosing Course vs. Microlearning', duration: '3 min read', icon: 'âš–ï¸',
          summary: 'A quick guide to picking the right format based on your goal, audience, and content volume.',
          body: `<div class="card card-pad" style="background:var(--pastel-cyan); border:none;">
                   <p class="text-sm">Choose <strong>Course</strong> for multi-topic content that builds over 30+ minutes. Choose <strong>Microlearning</strong> for a single focused topic under 10 minutes.</p>
                 </div>` },
        { id: 'kc-types', title: 'Types of Knowledge Checks', duration: '5 min read', icon: 'â“',
          summary: 'Multiple choice, multiple response, matching, ordering, fill-the-gap â€” when to use each.',
          body: `<p style="line-height:1.7;">Match the question type to the skill: use <strong>Ordering</strong> for sequences/processes, <strong>Matching</strong> for terminology, <strong>Multiple Response</strong> when more than one answer is correct, and <strong>Fill the Gap</strong> for recall of exact terms.</p>` },
        { id: 'aligning-assessments', title: 'Aligning Assessments to Objectives', duration: '4 min read', icon: 'ðŸ”—',
          summary: 'Every objective deserves at least one check â€” here\'s how to map them cleanly.',
          body: `<p style="line-height:1.7;">For every learning objective, ask: "How would a learner prove they can do this?" That answer is your assessment. Lumio's AI Blueprint maps each suggested knowledge check back to an objective automatically.</p>` },
        { id: 'feedback-design', title: 'Designing Helpful Feedback', duration: '3 min read', icon: 'ðŸ’¬',
          summary: 'Why "Incorrect, try again" isn\'t enough â€” and what to write instead.',
          body: `<p style="line-height:1.7;">Good feedback explains <em>why</em> an answer is right or wrong and points learners back to the relevant content â€” turning a quiz into one more learning moment.</p>` },
      ],
    },
    {
      id: 'content', title: 'Content Design', icon: 'ðŸ§©', color: 'var(--pillar-design)', pill: 'pill-orange',
      description: 'Structure and write content that\'s easy to follow and easy to remember.',
      topics: [
        { id: 'chunking', title: 'Chunking Content for Retention', duration: '5 min read', icon: 'ðŸ§©',
          summary: 'Discover why breaking lessons into small, focused chunks improves how much learners actually remember.',
          body: `<div class="card card-pad" style="background:var(--pastel-cyan); border:none;">
                   <p class="text-sm">Aim for lessons of <strong>5â€“10 minutes</strong>. If a topic feels bigger than that, split it into two lessons or add a "Continue" divider to pace reveal.</p>
                 </div>` },
        { id: 'cognitive-load', title: 'Cognitive Load Theory', duration: '5 min read', icon: 'ðŸ§ ',
          summary: 'How to avoid overwhelming working memory â€” and design content that sticks.',
          body: `<p style="line-height:1.7;">Working memory can only hold a handful of new ideas at once. Reduce <em>extraneous</em> load (clutter, decoration) so learners can spend their mental effort on the concept itself.</p>` },
        { id: 'storyboarding', title: 'Storyboarding Basics', duration: '6 min read', icon: 'ðŸ—‚ï¸',
          summary: 'Plan your lesson flow before you build â€” block by block.',
          body: `<p style="line-height:1.7;">A storyboard is a rough sketch of every screen: what's shown, what's said, and what the learner does. Sketching this out before opening the Lesson Builder saves rework later.</p>` },
        { id: 'writing-for-elearning', title: 'Writing for eLearning', duration: '4 min read', icon: 'âœï¸',
          summary: 'Short sentences, active voice, and a conversational tone go a long way.',
          body: `<p style="line-height:1.7;">Write the way you'd explain something to a colleague â€” short sentences, active voice, and a friendly tone. Cut any sentence that doesn't help the learner act.</p>` },
      ],
    },
    {
      id: 'engagement', title: 'Engagement', icon: 'ðŸŒŸ', color: 'var(--pillar-inspire)', pill: 'pill-magenta',
      description: 'Keep learners curious, motivated, and coming back.',
      topics: [
        { id: 'scenario-based', title: 'Scenario-Based Learning', duration: '6 min read', icon: 'ðŸŒ³',
          summary: 'Put learners in realistic situations where their choices have consequences.',
          body: `<p style="line-height:1.7;">Scenarios let learners practice judgment in a safe space. Branch the story based on choices, and use the Scenario block to map decisions to outcomes.</p>` },
        { id: 'microlearning-strategies', title: 'Microlearning Strategies', duration: '4 min read', icon: 'â±ï¸',
          summary: 'Designing short, focused experiences that fit into a learner\'s day.',
          body: `<p style="line-height:1.7;">Microlearning works best for a single objective, a single skill, or a quick refresher â€” think "just enough, just in time."</p>` },
        { id: 'gamification', title: 'Gamification Basics', duration: '5 min read', icon: 'ðŸŽ®',
          summary: 'Points, progress, and play â€” used thoughtfully, not just for decoration.',
          body: `<p style="line-height:1.7;">Gamification works when it reinforces the learning goal â€” progress bars, flashcards, and friendly challenges all add motivation without distracting from the content.</p>` },
        { id: 'interactive-elements', title: 'Choosing Interactive Elements', duration: '4 min read', icon: 'ðŸ§©',
          summary: 'Accordions, tabs, flashcards, processes â€” match the interaction to the content.',
          body: `<p style="line-height:1.7;">Use <strong>Accordions/Tabs</strong> to let learners explore optional depth, <strong>Process</strong> blocks for sequences, and <strong>Flashcards</strong> for vocabulary or quick recall practice.</p>` },
      ],
    },
    {
      id: 'visual-design', title: 'Visual Design', icon: 'ðŸŽ¨', color: 'var(--orange)', pill: 'pill-orange',
      description: 'Make your courses beautiful, on-brand, and easy on the eyes.',
      topics: [
        { id: 'visual-hierarchy', title: 'Visual Hierarchy', duration: '4 min read', icon: 'ðŸªœ',
          summary: 'Guide the eye with size, weight, color, and spacing.',
          body: `<p style="line-height:1.7;">The most important thing on a screen should look the most important. Use heading size, color, and whitespace to create a clear path for the eye.</p>` },
        { id: 'color-typography', title: 'Color & Typography', duration: '5 min read', icon: 'ðŸŽ¨',
          summary: 'Pick palettes and fonts that feel cohesive â€” and how Lumio\'s Theme Designer helps.',
          body: `<p style="line-height:1.7;">Pick one primary color, one accent, and a neutral background. Pair a distinctive display font for headings with a highly readable body font â€” exactly what Lumio's Theme Designer sets up for you.</p>` },
        { id: 'using-imagery', title: 'Using Imagery Effectively', duration: '4 min read', icon: 'ðŸ–¼ï¸',
          summary: 'Choosing images that support the message instead of just filling space.',
          body: `<p style="line-height:1.7;">Every image should answer "what is this helping the learner understand?" If it's purely decorative, consider a simpler background or color block instead.</p>` },
        { id: 'branding-consistency', title: 'Branding & Consistency', duration: '3 min read', icon: 'ðŸ·ï¸',
          summary: 'Why a consistent theme across lessons builds trust and polish.',
          body: `<p style="line-height:1.7;">Apply your theme â€” colors, fonts, button styles â€” consistently across the landing page and every lesson so the course feels like one cohesive product.</p>` },
      ],
    },
    {
      id: 'multimedia', title: 'Multimedia Design', icon: 'ðŸŽ¬', color: 'var(--indigo)', pill: 'pill-indigo',
      description: 'Use audio, video, and graphics with purpose and accessibility in mind.',
      topics: [
        { id: 'audio-video-best-practices', title: 'Audio & Video Best Practices', duration: '5 min read', icon: 'ðŸŽ¬',
          summary: 'Length, captions, and when video actually beats text.',
          body: `<p style="line-height:1.7;">Keep videos short and purposeful, always provide captions, and avoid autoplay with sound â€” let the learner choose when to engage.</p>` },
        { id: 'designing-graphics', title: 'Designing Effective Graphics', duration: '4 min read', icon: 'ðŸ“Š',
          summary: 'Charts, diagrams, and labelled graphics that clarify rather than decorate.',
          body: `<p style="line-height:1.7;">A diagram should reduce text, not add to it. Use labelled graphics to connect parts of an image directly to explanations.</p>` },
        { id: 'multimedia-accessibility', title: 'Accessibility for Multimedia', duration: '5 min read', icon: 'â™¿',
          summary: 'Captions, transcripts, alt text, and color contrast â€” designing for everyone.',
          body: `<p style="line-height:1.7;">Add alt text to every image, captions to every video, and transcripts for audio. Check color contrast so text stays readable for learners with low vision.</p>` },
      ],
    },
    {
      id: 'ai-learning-design', title: 'AI for Learning Design', icon: 'ðŸ¤–', color: 'var(--pillar-ai)', pill: 'pill-cyan',
      description: 'Use Lumio\'s AI as a creative partner â€” without losing your voice.',
      topics: [
        { id: 'ai-drafting', title: 'Using AI to Draft Content', duration: '4 min read', icon: 'âœ¨',
          summary: 'Letting AI generate a first pass, then making it your own.',
          body: `<p style="line-height:1.7;">AI is great at first drafts â€” outlines, descriptions, objectives. Treat its output as a starting point: review, simplify, and add your own examples.</p>` },
        { id: 'ai-assessments', title: 'AI-Assisted Assessment Writing', duration: '4 min read', icon: 'âœ…',
          summary: 'Generating knowledge checks that are aligned and not too easy.',
          body: `<p style="line-height:1.7;">Ask AI to generate a knowledge check from your lesson content, then check that the distractors (wrong answers) are plausible â€” not obviously silly.</p>` },
        { id: 'reviewing-ai', title: 'Reviewing AI Suggestions Critically', duration: '4 min read', icon: 'ðŸ”',
          summary: 'Spotting generic, inaccurate, or off-tone AI output before it ships.',
          body: `<p style="line-height:1.7;">Always fact-check AI-generated content against your source material, and rewrite anything that sounds generic so it matches your organization's voice.</p>` },
      ],
    },
    {
      id: 'evaluation', title: 'Learning Evaluation', icon: 'ðŸ“ˆ', color: 'var(--teal)', pill: 'pill-teal',
      description: 'Find out if your course actually worked â€” and improve it.',
      topics: [
        { id: 'kirkpatrick', title: 'Kirkpatrick\'s Four Levels', duration: '5 min read', icon: 'ðŸ“ˆ',
          summary: 'Reaction, Learning, Behavior, Results â€” the classic evaluation framework.',
          body: `<p style="line-height:1.7;">Level 1 (Reaction) asks "did they like it?" Level 4 (Results) asks "did it move the business needle?" Most teams start at Level 1-2 and grow from there.</p>` },
        { id: 'gathering-feedback', title: 'Gathering Learner Feedback', duration: '3 min read', icon: 'ðŸ—£ï¸',
          summary: 'Quick surveys and signals that tell you what to fix next.',
          body: `<p style="line-height:1.7;">A single end-of-course question â€” "What's one thing that was unclear?" â€” often surfaces more useful feedback than a 10-question survey.</p>` },
        { id: 'iterating-on-data', title: 'Iterating Based on Data', duration: '4 min read', icon: 'ðŸ”',
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
      message: () => `A couple of your learning objectives use vague verbs like "understand" or "know" â€” these are hard to assess. Want to tighten them up?`,
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
    { id: 'A', name: 'Centered', icon: 'ðŸŽ¯', description: 'Hero image fills the top, title and description centered below â€” clean and classic.', isDefault: true },
    { id: 'B', name: 'Text Left / Image Right', icon: 'â—§', description: 'Title and description on the left, hero image on the right â€” great for a strong visual.' },
    { id: 'C', name: 'Full Banner', icon: 'â–­', description: 'Full-width hero banner with text overlaid â€” bold, magazine-style opener.' },
    { id: 'D', name: 'Split Screen', icon: 'â—«', description: 'Two equal halves â€” image on one side, content on the other, edge to edge.' },
    { id: 'E', name: 'Minimal', icon: 'â€”', description: 'No hero image â€” just title, description, and a clean call to action.' },
  ],

  // ============================================================
  // HELP ME DECIDE â€” EXPANDED Q&A
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
      { value: 'many', label: 'Many â€” it builds over time' },
    ]},
    { id: 'contentVolume', label: 'How much content do you already have?', type: 'choice', options: [
      { value: 'a-little', label: 'A little â€” a page or two' },
      { value: 'some', label: 'A moderate amount' },
      { value: 'a-lot', label: 'A lot â€” multiple documents or topics' },
    ]},
    { id: 'time', label: 'How much time should this take learners?', type: 'choice', options: [
      { value: 'under-10', label: 'Under 10 minutes' },
      { value: '10-30', label: '10â€“30 minutes' },
      { value: 'over-30', label: 'Over 30 minutes' },
    ]},
  ],

  // ============================================================
  // BLOCK LIBRARY DEFINITION
  // ============================================================
  blockLibrary: [
    { category: 'Recommended', dynamic: true, icon: 'âœ¨', blocks: [] },
    { category: 'Text', icon: 'ðŸ“', blocks: [
      { id: 'heading', name: 'Heading', icon: 'H' },
      { id: 'heading_paragraph', name: 'Heading & Paragraph', icon: 'HÂ¶' },
      { id: 'paragraph', name: 'Paragraph', icon: 'Â¶' },
      { id: 'columns', name: 'Columns', icon: 'â–¥' },
      { id: 'table', name: 'Table', icon: 'â–¦' },
    ]},
    { category: 'Statements', icon: 'ðŸ’¬', blocks: [
      { id: 'stmt_info', name: 'Information', icon: 'â„¹ï¸' },
      { id: 'stmt_tip', name: 'Tip', icon: 'ðŸ’¡' },
      { id: 'stmt_success', name: 'Success', icon: 'âœ…' },
      { id: 'stmt_warning', name: 'Warning', icon: 'âš ï¸' },
      { id: 'stmt_error', name: 'Error / Critical Alert', icon: 'â›”' },
      { id: 'stmt_note', name: 'Note', icon: 'ðŸ“' },
    ]},
    { category: 'Quotes', icon: 'â€', blocks: [
      { id: 'quote1', name: 'Quote Style 1', icon: 'â€' },
      { id: 'quote2', name: 'Quote Style 2', icon: 'â€' },
      { id: 'quote3', name: 'Quote Style 3', icon: 'â€' },
      { id: 'quote4', name: 'Quote Style 4', icon: 'â€' },
      { id: 'quote_image', name: 'Quote on Image', icon: 'ðŸ–¼â€' },
      { id: 'quote_carousel', name: 'Quote Carousel', icon: 'ðŸ”„' },
    ]},
    { category: 'Lists', icon: 'â˜°', blocks: [
      { id: 'list_numbered', name: 'Numbered', icon: '1.' },
      { id: 'list_checkbox', name: 'Checkbox', icon: 'â˜‘' },
      { id: 'list_bullet', name: 'Bullet', icon: 'â€¢' },
    ]},
    { category: 'Images', icon: 'ðŸ–¼ï¸', blocks: [
      { id: 'image', name: 'Image', icon: 'ðŸ–¼' },
      { id: 'image_text', name: 'Image & Text', icon: 'ðŸ–¼Â¶' },
      { id: 'text_on_image', name: 'Text on Image', icon: 'ðŸ–¼T' },
    ]},
    { category: 'Gallery', icon: 'ðŸŽžï¸', blocks: [
      { id: 'carousel', name: 'Carousel', icon: 'ðŸ”„' },
      { id: 'column_grid', name: 'Column Grid', icon: 'â–¦' },
    ]},
    { category: 'Multimedia', icon: 'ðŸŽ¬', blocks: [
      { id: 'audio', name: 'Audio', icon: 'ðŸ”Š' },
      { id: 'video', name: 'Video', icon: 'â–¶' },
      { id: 'file', name: 'File Attachment', icon: 'ðŸ“Ž' },
    ]},
    { category: 'Interactive', icon: 'ðŸ§©', blocks: [
      { id: 'accordion', name: 'Accordion', icon: 'â¬‡' },
      { id: 'tabs', name: 'Tabs', icon: 'ðŸ—‚' },
      { id: 'labelled_graphic', name: 'Labelled Graphics', icon: 'ðŸ“' },
      { id: 'process', name: 'Process', icon: 'âž¡' },
      { id: 'scenario', name: 'Scenario', icon: 'ðŸŒ³' },
      { id: 'flashcard_grid', name: 'Flashcard Grid', icon: 'ðŸ—ƒ' },
      { id: 'flashcard_stack', name: 'Flashcard Stack', icon: 'ðŸ—‚' },
      { id: 'button', name: 'Button', icon: 'ðŸ”˜' },
    ]},
    { category: 'Charts', icon: 'ðŸ“Š', blocks: [
      { id: 'chart_bar', name: 'Bar', icon: 'ðŸ“Š' },
      { id: 'chart_line', name: 'Line', icon: 'ðŸ“ˆ' },
      { id: 'chart_pie', name: 'Pie', icon: 'ðŸ¥§' },
    ]},
    { category: 'Dividers', icon: 'âž–', blocks: [
      { id: 'continue', name: 'Continue', icon: 'âµ' },
      { id: 'numbered_divider', name: 'Numbered Divider', icon: 'â‘ ' },
      { id: 'line_divider', name: 'Line Divider', icon: 'â€”' },
      { id: 'spacer', name: 'Spacer', icon: 'â¬œ' },
    ]},
    { category: 'Knowledge Checks', icon: 'âœ…', blocks: [
      { id: 'kc_multiple_choice', name: 'Multiple Choice', icon: 'â—‰' },
      { id: 'kc_multiple_response', name: 'Multiple Response', icon: 'â˜‘' },
      { id: 'kc_matching', name: 'Matching', icon: 'â‡„' },
      { id: 'kc_matching_cards', name: 'Matching Cards', icon: 'âŠž' },
      { id: 'kc_fill_gap', name: 'Fill the Gap', icon: 'â–­' },
      { id: 'kc_ordering', name: 'Ordering', icon: 'â†•' },
    ]},
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
          rationale: 'Based on your answers, a Course works best â€” you have multiple related topics that build on each other, which benefits from structured lessons, a clear sequence, and aligned assessments.'
        };
      }
      return {
        format: 'Microlearning',
        rationale: 'Based on your answers, Microlearning works best â€” your goal is focused on one or two topics, and learners will get the most value from a short, targeted experience.'
      };
    },
    // Delegates to LumioAI (js/lumioAI.js) â€” the single source of truth for
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
      default: "I'm Lumio AI â€” I can help you draft content, suggest blocks, generate knowledge checks, or explain instructional design concepts. Try asking me something like â€œdraft this lessonâ€ or â€œsuggest a knowledge checkâ€.",
      'draft this lesson': "Here's a suggested structure: start with a Heading & Paragraph introduction, add an Image & Text block to illustrate the concept, include a Statement for emphasis, then a Knowledge Check to reinforce learning. I've added a few starter blocks to your canvas â€” feel free to edit them!",
      'suggest a knowledge check': "Based on this lesson's content, here's a suggested question: â€œWhich of the following best reflects one of our core values?â€ with 4 multiple-choice options. I've added it to the bottom of your canvas.",
      'how am i doing': "This lesson looks great so far! You've got a good mix of text, visuals, and one interactive check. Consider adding one more visual element to break up the text in the middle section.",
      'generate alt text': "I've drafted alt text for your images based on the surrounding content â€” you can review and edit it in each image block's Content tab.",
    }
  }
};

// Config Update: single source of truth for the default themeDesign given to
// a brand-new course. Previously duplicated verbatim (and independently
// drifting) in wizard.js's ensureThemeDesign() and courseLanding.js's
// ensureCourseDesign() â€” both now call this instead of hardcoding their own
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
