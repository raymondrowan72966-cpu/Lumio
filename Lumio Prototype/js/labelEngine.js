/* ============================================================
   LUMIO LABEL ENGINE
   Phase 2 — Learner UI Localisation

   Owns every learner-visible UI string that is NOT course content.
   Course content (headings, body text, KC questions) is owned by
   TranslationEngine. Labels are reusable UI resources: buttons,
   navigation, feedback messages, accessibility strings.

   Architecture:
     BUILT_IN        — immutable language packs (en, es, fr, de)
     custom packs    — stored in LumioState.labelPacks (author-created)
     course.labelSet — per-course pack selection (e.g. 'en', 'es', 'mining-en')
     setActivePack() — called at learner-shell entry point
     L(key, vars)    — global label accessor (works in all learner contexts)
     get(key, vars)  — same, callable on LabelEngine directly

   Label keys are dot-separated: 'nav.next', 'kc.submit', 'a11y.move_up'.
   Template variables use {placeholder} syntax: L('kc.score', {n:3, total:5})

   XLIFF integration:
     generateXliff(packId) → XLIFF 1.2 for label translation
     importXliff(packId, xliffStr) → update custom pack from XLIFF
     Custom packs can be seeded from any built-in, translated via CAT tool,
     and imported back without touching lesson content.

   Extension points:
     LabelEngine.PACKS — access all registered packs (built-in + custom)
     LabelEngine.register(id, pack) — programmatic pack registration
   ============================================================ */

const LabelEngine = (function () {

  // ── Built-in label packs ──────────────────────────────────────

  /* Each pack is a flat key→string map. Keys are dot-separated.
     Template vars use {placeholder} syntax. */

  const EN = {
    // Navigation
    'nav.start_course':     'Start Course',
    'nav.continue_course':  'Continue Course',
    'nav.restart_course':   'Restart Course',
    'nav.next':             'Next →',
    'nav.previous':         '← Previous',
    'nav.take_assessment':  'Take Assessment →',
    'nav.finish_course':    'Finish Course ✓',
    'nav.next_assessment':  'Next Assessment →',
    'nav.no_lessons':       'No lessons yet',
    'nav.return':           'Return to course',
    // Sidebar
    'sidebar.progress':     'Course Progress',
    'sidebar.lessons':      'Lessons',
    'sidebar.assessments':  'Assessments',
    'sidebar.quiz':         'Quiz',
    'sidebar.assessment':   'Assessment',
    // Knowledge Checks
    'kc.submit':            'Submit',
    'kc.try_again':         'Try Again',
    'kc.replay':            'Replay',
    'kc.correct_prefix':    '✓ Correct',
    'kc.not_quite_prefix':  '✕ Not quite',
    'kc.response_recorded': 'Response recorded.',
    'kc.correct_feedback':  'Correct! Well done.',
    'kc.incorrect_feedback':'Not quite. Please try again.',
    'kc.score':             '{n} / {total} Correct',
    'kc.correct_label':     'Correct',
    'kc.wrong_label':       'Wrong',
    // Carousel & quote nav
    'carousel.prev':        '← Prev',
    'carousel.next':        'Next →',
    'carousel.prev_slide':  'Previous slide',
    'carousel.next_slide':  'Next slide',
    'carousel.indicators':  'Slide indicators',
    'carousel.prev_quote':  'Previous quote',
    'carousel.next_quote':  'Next quote',
    'carousel.quote_inds':  'Quote indicators',
    // Flashcards
    'flashcard.flip':       'Flip',
    'flashcard.front':      'Front',
    'flashcard.back':       'Back',
    'flashcard.flip_hint':  '↻ Click flip icon to flip',
    // Audio player
    'audio.play':           'Play',
    'audio.pause':          'Pause',
    'audio.transcript':     'Transcript',
    // Completion
    'complete.all_done':    'All done!',
    'complete.well_done':   'Well done!',
    // Accessibility
    'a11y.open_nav':        'Open navigation',
    'a11y.position':        'Position {n}',
    'a11y.move_up':         'Move up',
    'a11y.move_down':       'Move down',
    'a11y.selected':        '(selected)',
    'a11y.locked':          'Locked',
    'a11y.content_revealed':'Additional content revealed below.',
    // Navigation (extended)
    'nav.back':             '← Back',
    'nav.next_tooltip':     'Complete all required content above to continue',
    'nav.counter':          '{current} of {total}',
    // Lesson states
    'lesson.no_content':    'This lesson has no content yet',
    // Process
    'process.step':         'Step',
    // Continue block
    'continue.label':       'Continue',
    'continue.revealed':    '✓ Continued',
    // Video
    'video.mark_watched':   'Mark video as watched',
    'video.marked_watched': '✓ Marked as watched',
    // KC — default instructions (shown when author leaves field blank)
    'kc.default_instruction.matching':       'Tap an item on the left, then its match on the right.',
    'kc.default_instruction.ordering':       'Use the arrows to arrange these in the correct order.',
    'kc.default_instruction.fill_gap':       'Complete the missing word or phrase.',
    'kc.default_instruction.matching_cards': 'Drag each card to its correct category.',
    // KC — default question fallbacks
    'kc.question_mc':       'Which of the following is correct?',
    'kc.question_mr':       'Select all that apply.',
    // KC — fill gap
    'kc.fill_placeholder':  'Type your answer…',
    'kc.accepted_answer':   'Accepted answer: {answer}',
    // KC — matching cards
    'kc.mc_drop_here':      'Drop here',
    'kc.mc_tap_hint':       'or tap a category to place the selected card',
    // Landing page
    'landing.objectives_heading': 'By the end of this course, you will be able to:',
    'landing.navtips_heading':    'Navigation Tips',
    'landing.structure_heading':  'This course covers the following:',
    'landing.lesson_prefix':      'Lesson {n}:',
    'landing.assessment_prefix':  'Assessment:',
    'landing.no_content':         'No lessons or assessments yet.',
  };

  const ES = {
    'nav.start_course':     'Iniciar curso',
    'nav.continue_course':  'Continuar curso',
    'nav.restart_course':   'Reiniciar curso',
    'nav.next':             'Siguiente →',
    'nav.previous':         '← Anterior',
    'nav.take_assessment':  'Realizar evaluación →',
    'nav.finish_course':    'Finalizar curso ✓',
    'nav.next_assessment':  'Siguiente evaluación →',
    'nav.no_lessons':       'Sin lecciones aún',
    'nav.return':           'Volver al curso',
    'sidebar.progress':     'Progreso del curso',
    'sidebar.lessons':      'Lecciones',
    'sidebar.assessments':  'Evaluaciones',
    'sidebar.quiz':         'Cuestionario',
    'sidebar.assessment':   'Evaluación',
    'kc.submit':            'Enviar',
    'kc.try_again':         'Intentar de nuevo',
    'kc.replay':            'Repetir',
    'kc.correct_prefix':    '✓ Correcto',
    'kc.not_quite_prefix':  '✕ No del todo',
    'kc.response_recorded': 'Respuesta registrada.',
    'kc.correct_feedback':  '¡Correcto! Muy bien.',
    'kc.incorrect_feedback':'No del todo. Inténtalo de nuevo.',
    'kc.score':             '{n} / {total} correctas',
    'kc.correct_label':     'Correcto',
    'kc.wrong_label':       'Incorrecto',
    'carousel.prev':        '← Anterior',
    'carousel.next':        'Siguiente →',
    'carousel.prev_slide':  'Diapositiva anterior',
    'carousel.next_slide':  'Siguiente diapositiva',
    'carousel.indicators':  'Indicadores de diapositiva',
    'carousel.prev_quote':  'Cita anterior',
    'carousel.next_quote':  'Siguiente cita',
    'carousel.quote_inds':  'Indicadores de cita',
    'flashcard.flip':       'Girar',
    'flashcard.front':      'Frente',
    'flashcard.back':       'Reverso',
    'flashcard.flip_hint':  '↻ Haz clic en el icono para girar',
    'audio.play':           'Reproducir',
    'audio.pause':          'Pausar',
    'audio.transcript':     'Transcripción',
    'complete.all_done':    '¡Todo listo!',
    'complete.well_done':   '¡Muy bien!',
    'a11y.open_nav':        'Abrir navegación',
    'a11y.position':        'Posición {n}',
    'a11y.move_up':         'Mover arriba',
    'a11y.move_down':       'Mover abajo',
    'a11y.selected':        '(seleccionado)',
    'a11y.locked':          'Bloqueado',
    'a11y.content_revealed':'Contenido adicional revelado abajo.',
    'nav.back':             '← Atrás',
    'nav.next_tooltip':     'Completa el contenido requerido arriba para continuar',
    'nav.counter':          '{current} de {total}',
    'lesson.no_content':    'Esta lección no tiene contenido todavía',
    'process.step':         'Paso',
    'continue.label':       'Continuar',
    'continue.revealed':    '✓ Continuado',
    'video.mark_watched':   'Marcar vídeo como visto',
    'video.marked_watched': '✓ Marcado como visto',
    'kc.default_instruction.matching':       'Toca un elemento de la izquierda y luego su coincidencia de la derecha.',
    'kc.default_instruction.ordering':       'Usa las flechas para ordenar correctamente estos elementos.',
    'kc.default_instruction.fill_gap':       'Completa la palabra o frase que falta.',
    'kc.default_instruction.matching_cards': 'Arrastra cada tarjeta a su categoría correcta.',
    'kc.question_mc':       '¿Cuál de las siguientes opciones es correcta?',
    'kc.question_mr':       'Selecciona todas las que apliquen.',
    'kc.fill_placeholder':  'Escribe tu respuesta…',
    'kc.accepted_answer':   'Respuesta aceptada: {answer}',
    'kc.mc_drop_here':      'Soltar aquí',
    'kc.mc_tap_hint':       'o toca una categoría para colocar la tarjeta seleccionada',
    'landing.objectives_heading': 'Al finalizar este curso, serás capaz de:',
    'landing.navtips_heading':    'Consejos de navegación',
    'landing.structure_heading':  'Este curso cubre lo siguiente:',
    'landing.lesson_prefix':      'Lección {n}:',
    'landing.assessment_prefix':  'Evaluación:',
    'landing.no_content':         'Aún no hay lecciones ni evaluaciones.',
  };

  const FR = {
    'nav.start_course':     'Commencer le cours',
    'nav.continue_course':  'Continuer le cours',
    'nav.restart_course':   'Recommencer le cours',
    'nav.next':             'Suivant →',
    'nav.previous':         '← Précédent',
    'nav.take_assessment':  'Passer l\'évaluation →',
    'nav.finish_course':    'Terminer le cours ✓',
    'nav.next_assessment':  'Évaluation suivante →',
    'nav.no_lessons':       'Aucune leçon pour l\'instant',
    'nav.return':           'Retour au cours',
    'sidebar.progress':     'Progression du cours',
    'sidebar.lessons':      'Leçons',
    'sidebar.assessments':  'Évaluations',
    'sidebar.quiz':         'Quiz',
    'sidebar.assessment':   'Évaluation',
    'kc.submit':            'Valider',
    'kc.try_again':         'Réessayer',
    'kc.replay':            'Rejouer',
    'kc.correct_prefix':    '✓ Correct',
    'kc.not_quite_prefix':  '✕ Pas tout à fait',
    'kc.response_recorded': 'Réponse enregistrée.',
    'kc.correct_feedback':  'Correct ! Bien joué.',
    'kc.incorrect_feedback':'Pas tout à fait. Veuillez réessayer.',
    'kc.score':             '{n} / {total} correct',
    'kc.correct_label':     'Correct',
    'kc.wrong_label':       'Incorrect',
    'carousel.prev':        '← Préc.',
    'carousel.next':        'Suiv. →',
    'carousel.prev_slide':  'Diapositive précédente',
    'carousel.next_slide':  'Diapositive suivante',
    'carousel.indicators':  'Indicateurs de diapositive',
    'carousel.prev_quote':  'Citation précédente',
    'carousel.next_quote':  'Citation suivante',
    'carousel.quote_inds':  'Indicateurs de citation',
    'flashcard.flip':       'Retourner',
    'flashcard.front':      'Recto',
    'flashcard.back':       'Verso',
    'flashcard.flip_hint':  '↻ Cliquez sur l\'icône pour retourner',
    'audio.play':           'Lire',
    'audio.pause':          'Pause',
    'audio.transcript':     'Transcription',
    'complete.all_done':    'Tout est terminé !',
    'complete.well_done':   'Bien joué !',
    'a11y.open_nav':        'Ouvrir la navigation',
    'a11y.position':        'Position {n}',
    'a11y.move_up':         'Monter',
    'a11y.move_down':       'Descendre',
    'a11y.selected':        '(sélectionné)',
    'a11y.locked':          'Verrouillé',
    'a11y.content_revealed':'Contenu supplémentaire révélé ci-dessous.',
    'nav.back':             '← Retour',
    'nav.next_tooltip':     'Complétez tout le contenu requis ci-dessus pour continuer',
    'nav.counter':          '{current} sur {total}',
    'lesson.no_content':    'Cette leçon n\'a pas encore de contenu',
    'process.step':         'Étape',
    'continue.label':       'Continuer',
    'continue.revealed':    '✓ Continué',
    'video.mark_watched':   'Marquer la vidéo comme vue',
    'video.marked_watched': '✓ Marquée comme vue',
    'kc.default_instruction.matching':       'Appuyez sur un élément à gauche, puis sur sa correspondance à droite.',
    'kc.default_instruction.ordering':       'Utilisez les flèches pour disposer ces éléments dans le bon ordre.',
    'kc.default_instruction.fill_gap':       'Complétez le mot ou la phrase manquant(e).',
    'kc.default_instruction.matching_cards': 'Faites glisser chaque carte vers sa catégorie correcte.',
    'kc.question_mc':       'Laquelle des propositions suivantes est correcte ?',
    'kc.question_mr':       'Sélectionnez tout ce qui s\'applique.',
    'kc.fill_placeholder':  'Tapez votre réponse…',
    'kc.accepted_answer':   'Réponse acceptée : {answer}',
    'kc.mc_drop_here':      'Déposer ici',
    'kc.mc_tap_hint':       'ou appuyez sur une catégorie pour y placer la carte sélectionnée',
    'landing.objectives_heading': 'À la fin de ce cours, vous serez capable de :',
    'landing.navtips_heading':    'Conseils de navigation',
    'landing.structure_heading':  'Ce cours couvre les éléments suivants :',
    'landing.lesson_prefix':      'Leçon {n} :',
    'landing.assessment_prefix':  'Évaluation :',
    'landing.no_content':         'Aucune leçon ni évaluation pour l\'instant.',
  };

  const DE = {
    'nav.start_course':     'Kurs starten',
    'nav.continue_course':  'Kurs fortsetzen',
    'nav.restart_course':   'Kurs neu starten',
    'nav.next':             'Weiter →',
    'nav.previous':         '← Zurück',
    'nav.take_assessment':  'Prüfung starten →',
    'nav.finish_course':    'Kurs abschließen ✓',
    'nav.next_assessment':  'Nächste Prüfung →',
    'nav.no_lessons':       'Noch keine Lektionen',
    'nav.return':           'Zurück zum Kurs',
    'sidebar.progress':     'Kursfortschritt',
    'sidebar.lessons':      'Lektionen',
    'sidebar.assessments':  'Prüfungen',
    'sidebar.quiz':         'Quiz',
    'sidebar.assessment':   'Prüfung',
    'kc.submit':            'Abschicken',
    'kc.try_again':         'Erneut versuchen',
    'kc.replay':            'Wiederholen',
    'kc.correct_prefix':    '✓ Richtig',
    'kc.not_quite_prefix':  '✕ Nicht ganz',
    'kc.response_recorded': 'Antwort gespeichert.',
    'kc.correct_feedback':  'Richtig! Gut gemacht.',
    'kc.incorrect_feedback':'Nicht ganz. Bitte versuche es noch einmal.',
    'kc.score':             '{n} / {total} richtig',
    'kc.correct_label':     'Richtig',
    'kc.wrong_label':       'Falsch',
    'carousel.prev':        '← Zurück',
    'carousel.next':        'Weiter →',
    'carousel.prev_slide':  'Vorherige Folie',
    'carousel.next_slide':  'Nächste Folie',
    'carousel.indicators':  'Folienindikatoren',
    'carousel.prev_quote':  'Vorheriges Zitat',
    'carousel.next_quote':  'Nächstes Zitat',
    'carousel.quote_inds':  'Zitatenindikatoren',
    'flashcard.flip':       'Umdrehen',
    'flashcard.front':      'Vorderseite',
    'flashcard.back':       'Rückseite',
    'flashcard.flip_hint':  '↻ Symbol anklicken zum Umdrehen',
    'audio.play':           'Abspielen',
    'audio.pause':          'Pause',
    'audio.transcript':     'Transkript',
    'complete.all_done':    'Alles erledigt!',
    'complete.well_done':   'Gut gemacht!',
    'a11y.open_nav':        'Navigation öffnen',
    'a11y.position':        'Position {n}',
    'a11y.move_up':         'Nach oben',
    'a11y.move_down':       'Nach unten',
    'a11y.selected':        '(ausgewählt)',
    'a11y.locked':          'Gesperrt',
    'a11y.content_revealed':'Zusätzlicher Inhalt unten aufgedeckt.',
    'nav.back':             '← Zurück',
    'nav.next_tooltip':     'Schließen Sie den erforderlichen Inhalt oben ab, um fortzufahren',
    'nav.counter':          '{current} von {total}',
    'lesson.no_content':    'Diese Lektion hat noch keinen Inhalt',
    'process.step':         'Schritt',
    'continue.label':       'Weiter',
    'continue.revealed':    '✓ Fortgesetzt',
    'video.mark_watched':   'Video als angesehen markieren',
    'video.marked_watched': '✓ Als angesehen markiert',
    'kc.default_instruction.matching':       'Tippen Sie auf ein Element links, dann auf seine Entsprechung rechts.',
    'kc.default_instruction.ordering':       'Verwenden Sie die Pfeile, um diese in der richtigen Reihenfolge anzuordnen.',
    'kc.default_instruction.fill_gap':       'Vervollständigen Sie das fehlende Wort oder die Phrase.',
    'kc.default_instruction.matching_cards': 'Ziehen Sie jede Karte in ihre richtige Kategorie.',
    'kc.question_mc':       'Welche der folgenden Aussagen ist richtig?',
    'kc.question_mr':       'Wählen Sie alles Zutreffende aus.',
    'kc.fill_placeholder':  'Geben Sie Ihre Antwort ein…',
    'kc.accepted_answer':   'Akzeptierte Antwort: {answer}',
    'kc.mc_drop_here':      'Hier ablegen',
    'kc.mc_tap_hint':       'oder tippen Sie auf eine Kategorie, um die ausgewählte Karte zu platzieren',
    'landing.objectives_heading': 'Nach diesem Kurs werden Sie in der Lage sein:',
    'landing.navtips_heading':    'Navigationstipps',
    'landing.structure_heading':  'Dieser Kurs behandelt Folgendes:',
    'landing.lesson_prefix':      'Lektion {n}:',
    'landing.assessment_prefix':  'Prüfung:',
    'landing.no_content':         'Noch keine Lektionen oder Prüfungen.',
  };

  const BUILT_IN = {
    en: { id: 'en', name: 'English',  labels: EN },
    es: { id: 'es', name: 'Español',  labels: ES },
    fr: { id: 'fr', name: 'Français', labels: FR },
    de: { id: 'de', name: 'Deutsch',  labels: DE },
  };

  // ── Runtime state ─────────────────────────────────────────────

  // The pack active for the current learner session.
  // Set by setActivePack() before any learner rendering begins.
  let _active = BUILT_IN.en.labels;
  let _activeId = 'en';

  // ── Pack registry ─────────────────────────────────────────────

  function _allPacks() {
    const custom = (LumioState && LumioState.labelPacks) || {};
    return Object.assign({}, BUILT_IN, custom);
  }

  function _resolvePack(id) {
    if (!id) return BUILT_IN.en.labels;
    const packs = _allPacks();
    return (packs[id] && packs[id].labels) || BUILT_IN.en.labels;
  }

  // ── Active pack ───────────────────────────────────────────────

  /* Called at the entry point of every learner-facing render.
     Accepts a course object (uses course.labelSet) or a pack id string. */
  function setActivePack(courseOrId) {
    const id = typeof courseOrId === 'string'
      ? courseOrId
      : (courseOrId && courseOrId.labelSet) || 'en';
    _active = _resolvePack(id);
    _activeId = id;
  }

  // ── Label accessor ────────────────────────────────────────────

  /* Returns the label string for `key` from the active pack.
     Falls back to the English pack, then to the key itself so the UI
     is never blank. Template vars are substituted: L('kc.score', {n:3, total:5}) */
  function L(key, vars) {
    const str = _active[key] || BUILT_IN.en.labels[key] || key;
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : '{' + k + '}'));
  }

  /* Course-aware accessor. Use when you have the course object but haven't
     called setActivePack yet (e.g., in a utility function outside the
     main render flow). */
  function get(course, key, vars) {
    const pack = _resolvePack(course && course.labelSet);
    const str = pack[key] || BUILT_IN.en.labels[key] || key;
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : '{' + k + '}'));
  }

  // ── Pack management ───────────────────────────────────────────

  function getAllPacks() {
    return _allPacks();
  }

  /* Create a new custom pack seeded from an existing pack.
     Stored in LumioState.labelPacks and persisted with the workspace.
     Returns the new pack object. */
  function createCustomPack(name, baseId) {
    if (!LumioState.labelPacks) LumioState.labelPacks = {};
    const base = _resolvePack(baseId || 'en');
    const id = 'custom_' + Date.now().toString(36);
    const pack = {
      id,
      name: name || 'Custom Pack',
      baseId: baseId || 'en',
      custom: true,
      labels: Object.assign({}, base),
    };
    LumioState.labelPacks[id] = pack;
    return pack;
  }

  /* Update a custom pack's labels (partial update — only keys provided). */
  function updateCustomPack(id, labelOverrides) {
    if (!LumioState.labelPacks || !LumioState.labelPacks[id]) return false;
    Object.assign(LumioState.labelPacks[id].labels, labelOverrides);
    return true;
  }

  /* Delete a custom pack. */
  function deleteCustomPack(id) {
    if (!LumioState.labelPacks) return;
    delete LumioState.labelPacks[id];
  }

  /* Register a pack programmatically (for enterprise/plugin use). */
  function register(id, name, labels) {
    if (!LumioState.labelPacks) LumioState.labelPacks = {};
    LumioState.labelPacks[id] = { id, name, custom: true, labels: Object.assign({}, labels) };
  }

  // ── XLIFF export/import for labels ───────────────────────────

  const XLIFF_NS = 'urn:oasis:names:tc:xliff:document:1.2';

  /* Export a label pack as XLIFF 1.2.
     Produces a single <file original="labels"> containing one
     <trans-unit> per label key. */
  function generateXliff(packId, opts) {
    opts = opts || {};
    const pack = _allPacks()[packId];
    if (!pack) return null;
    const sourceLocale = opts.sourceLocale || 'en-us';
    const targetLocale = opts.targetLocale || '';
    const targetAttr   = targetLocale ? ` target-language="${_escXml(targetLocale)}"` : '';
    const labels = pack.labels;
    const units = Object.keys(labels).map(key =>
      `      <trans-unit id="${_escXml(key)}"><source>${_escXml(labels[key])}</source></trans-unit>`
    ).join('\n');
    return `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="${XLIFF_NS}" xml:space="preserve">
  <file original="labels" datatype="plaintext" source-language="${_escXml(sourceLocale)}"${targetAttr}>
    <body>
${units}
    </body>
  </file>
</xliff>`;
  }

  /* Parse a label XLIFF. Returns { ok, labels: {key: string}, errors: [] }. */
  function parseXliff(xliffStr) {
    const errors = [];
    let doc;
    try {
      doc = new DOMParser().parseFromString(xliffStr, 'text/xml');
      const err = doc.querySelector('parsererror');
      if (err) { return { ok: false, errors: ['XML parse error: ' + err.textContent] }; }
    } catch (e) {
      return { ok: false, errors: ['Parse failed: ' + e.message] };
    }
    const labels = {};
    doc.querySelectorAll('trans-unit').forEach(tu => {
      const key = tu.getAttribute('id');
      if (!key) return;
      const targetEl = tu.querySelector('target');
      const sourceEl = tu.querySelector('source');
      const val = (targetEl && targetEl.textContent) || (sourceEl && sourceEl.textContent) || '';
      labels[key] = val;
    });
    return { ok: true, labels, errors };
  }

  /* Apply parsed XLIFF labels to a custom pack.
     If packId is an existing custom pack, merges into it.
     If packId is 'new' or doesn't exist, creates a new custom pack
     seeded from the English built-in, then overlays the import. */
  function importXliff(packId, xliffStr, opts) {
    const result = parseXliff(xliffStr);
    if (!result.ok) return result;
    opts = opts || {};
    if (packId && LumioState.labelPacks && LumioState.labelPacks[packId]) {
      Object.assign(LumioState.labelPacks[packId].labels, result.labels);
      return { ok: true, applied: Object.keys(result.labels).length };
    }
    // New custom pack
    const pack = createCustomPack(opts.name || 'Imported Pack', opts.baseId || 'en');
    Object.assign(pack.labels, result.labels);
    return { ok: true, pack, applied: Object.keys(result.labels).length };
  }

  // ── Download helper ───────────────────────────────────────────

  function downloadXliff(packId, opts) {
    const xliff = generateXliff(packId, opts);
    if (!xliff) { console.warn('[LabelEngine] Pack not found:', packId); return; }
    const packs = _allPacks();
    const name = (packs[packId] && packs[packId].name) || packId;
    const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const blob = new Blob([xliff], { type: 'application/xliff+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'labels-' + safe + '.xlf';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // ── XML escape ────────────────────────────────────────────────

  function _escXml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Coverage Auditor ──────────────────────────────────────────
  //
  // Developer utility — call LabelEngine.auditCoverage() from the browser
  // console to verify label completeness across all built-in packs.
  // Part of future Platform Audit Sprints.

  function auditCoverage() {
    const enKeys = Object.keys(EN);
    const totalKeys = enKeys.length;
    const packs = { EN, ES, FR, DE };
    const packNames = { EN: 'English', ES: 'Español', FR: 'Français', DE: 'Deutsch' };
    const report = {
      totalKeys,
      packs: {},
      missingByPack: {},
      allKeysComplete: true,
    };

    Object.entries(packs).forEach(([id, pack]) => {
      const packKeys = Object.keys(pack);
      const missing = enKeys.filter(k => !(k in pack));
      const extra   = packKeys.filter(k => !(k in EN));
      report.packs[id] = {
        name: packNames[id],
        defined: packKeys.length,
        missing: missing.length,
        extra: extra.length,
        coveragePct: Math.round(((packKeys.length - extra.length) / totalKeys) * 100),
      };
      if (missing.length) {
        report.missingByPack[id] = missing;
        report.allKeysComplete = false;
      }
    });

    // Summary table
    console.group('[LabelEngine] Coverage Audit');
    console.log(`Total keys (EN baseline): ${totalKeys}`);
    Object.entries(report.packs).forEach(([id, p]) => {
      const status = p.missing === 0 ? '✅' : '⚠️';
      console.log(`${status} ${p.name} (${id}): ${p.coveragePct}% — ${p.defined} defined, ${p.missing} missing, ${p.extra} extra`);
    });
    if (!report.allKeysComplete) {
      console.warn('Missing keys by pack:', report.missingByPack);
    } else {
      console.log('✅ All packs complete — 100% coverage');
    }
    console.groupEnd();
    return report;
  }

  // ── Public API ────────────────────────────────────────────────

  return {
    // Core accessors
    L,
    get,
    setActivePack,
    // Pack management
    getAllPacks,
    createCustomPack,
    updateCustomPack,
    deleteCustomPack,
    register,
    // XLIFF
    generateXliff,
    parseXliff,
    importXliff,
    downloadXliff,
    // Data
    BUILT_IN,
    // Developer utilities
    auditCoverage,
    // Internal for testing
    _active: function () { return _active; },
    _activeId: function () { return _activeId; },
  };
})();

/* Global shorthand — callable from all learner-context functions
   (learnerPreview.js, kcComponents.js) without needing the course object.
   Always reflects the current learner session's active pack.
   Set once at shell entry via LabelEngine.setActivePack(course). */
function L(key, vars) { return LabelEngine.L(key, vars); }
