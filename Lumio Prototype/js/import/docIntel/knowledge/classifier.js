/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Knowledge Object Classifier
   Phase 3: Knowledge Modeller

   Classifies each SDMElement into one of the 16 canonical
   KnowledgeObjectTypes using rule-based text heuristics.

   Classification is intentionally shallow and fast — it operates
   on individual elements with limited context. The graphBuilder
   applies post-classification refinement (parent-child linking,
   Procedure→Step expansion). Phase 4 Instructional Intelligence
   performs deeper semantic reasoning on the resulting CKM.

   Design:
     - SDM element type is the primary signal
     - Text content patterns are the secondary signal
     - Section context (heading text, level) is tertiary
     - Outputs are { type, confidence, signals[] }
     - All outputs are deterministic — no external calls

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelClassifier = (() => {

  const T = DocIntelObjectTypes.TYPES;

  // ── Action verb patterns ──────────────────────────────────────────────────
  // Matches imperative verbs at the start of a list item.
  // Used to detect Procedures (numbered lists) and Checklists (bullet lists).

  const _ACTION_VERB_RE = /^(?:click|open|press|enter|select|navigate|type|choose|run|execute|go to|drag|copy|paste|create|add|install|configure|set|start|stop|enable|disable|delete|remove|save|download|upload|import|export|check|ensure|verify|confirm|validate|test|review|update|edit|modify|change|apply|submit|login|log in|sign in|sign out|complete|fill|read|write|send|close|launch|access|connect|disconnect|define|specify|provide|assign|name|move|place|select|activate|deactivate|locate|find|identify|follow|use|make|get|put|turn|switch|toggle)\b/i;

  // Checklist-specific verbs (ensure/verify/check → clearly a verification list)
  const _CHECKLIST_VERB_RE = /^(?:ensure|verify|check|confirm|validate|test|review|assert|audit|inspect)\b/i;

  // ── Text classification patterns ──────────────────────────────────────────

  // Ends with a question mark → Question
  const _QUESTION_RE = /\?[\s"'»]?$/;

  // Summary openers
  const _SUMMARY_RE = /^(?:in summary[,:\s]|to summarize[,:\s]|in conclusion[,:\s]|to recap[,:\s]|in brief[,:\s]|overall[,:\s]|to sum up[,:\s]|summar(?:y|ising|izing)\s)/i;

  // Reference pointers
  const _REFERENCE_RE = /(?:see also|refer (?:to|also)|references?:|bibliography|further reading|for more (?:information|details?)|consult\s|additional resources?)/i;

  // Warning language
  const _WARNING_RE = /(?:^|\s)(?:warning[!:\s]|caution[!:\s]|danger[!:\s]|alert[!:\s]|do not\s|never\s|hazard|risk of\s|critical[!:\s]|important[!:\s])/i;

  // Rule / policy language
  const _RULE_RE = /\b(?:must(?:n't)?|shall(?:n't)?|required?|mandatory|mandatory|prohibited|not (?:allowed|permitted)|is (?:required|mandatory)|are (?:required|mandatory)|policy|regulation|compliance|must be)\b/i;

  // Definition patterns — "X is a...", "X refers to...", "X: definition"
  const _DEFINITION_RE = /^[\w\s'"(),-]{1,60}(?:\s(?:is|are|refers? to|means?|(?:is|are) defined as|(?:is|are) described as|(?:is|are) known as))\s/i;
  // Also: short text with a colon early on (term: definition style)
  const _COLON_DEFINITION_RE = /^[A-Z][^:]{1,40}:\s+[A-Z]/;

  // Example language
  const _EXAMPLE_RE = /\b(?:for example[,:\s]|such as\s|e\.g\.[,\s]|for instance[,:\s]|to illustrate[,:\s]|as (?:an )?example[,:\s]|an example of\s|examples? (?:include|of)\s)/i;

  // Concept / principle language (text explains what something IS or HOW it works)
  const _CONCEPT_RE = /\b(?:principle|concept|theory|model|framework|mechanism|approach|methodology|philosophy|paradigm|notion|idea of|understanding of)\b/i;

  // ── Callout prefix detection ───────────────────────────────────────────────

  function _classifyCallout(text) {
    const lower = text.toLowerCase().trimStart();
    if (/^(?:warning|caution|danger|alert|critical)[!:\s]/i.test(lower)) {
      return { type: T.WARNING, confidence: 0.92, signals: ['callout-warning-prefix'] };
    }
    if (/^(?:note|tip|hint|remember|important)[!:\s]/i.test(lower)) {
      return { type: T.NOTE, confidence: 0.90, signals: ['callout-note-prefix'] };
    }
    // Untyped callout → Note (informational aside)
    return { type: T.NOTE, confidence: 0.75, signals: ['callout-untyped'] };
  }

  // ── Numbered list classification ──────────────────────────────────────────
  // Default assumption: numbered list = sequential instructions = Procedure.
  // High-confidence when items contain action verbs.
  // Lower confidence otherwise (could be a ranked list, not a how-to).

  function _classifyNumberedList(items) {
    if (!Array.isArray(items) || !items.length) {
      return { type: T.PROCEDURE, confidence: 0.55, signals: ['numbered-list-empty'] };
    }
    const actionCount = items.filter(i => _ACTION_VERB_RE.test(i.trim())).length;
    const ratio = actionCount / items.length;

    if (ratio >= 0.5) {
      return { type: T.PROCEDURE, confidence: 0.87, signals: ['numbered-list', `action-verb-ratio-${Math.round(ratio * 100)}pct`] };
    }

    const checklistCount = items.filter(i => _CHECKLIST_VERB_RE.test(i.trim())).length;
    if (checklistCount / items.length >= 0.4) {
      return { type: T.CHECKLIST, confidence: 0.80, signals: ['numbered-list', 'checklist-verbs'] };
    }

    return { type: T.PROCEDURE, confidence: 0.60, signals: ['numbered-list', 'no-dominant-action-verbs'] };
  }

  // ── Bullet list classification ────────────────────────────────────────────
  // Bullet lists are more ambiguous. Could be:
  //   - Checklist (verifiable action items)
  //   - Topic (informational list of facts/features)
  //   - Procedure (steps presented as bullets — unusual but possible)

  function _classifyBulletList(items) {
    if (!Array.isArray(items) || !items.length) {
      return { type: T.TOPIC, confidence: 0.50, signals: ['bullet-list-empty'] };
    }

    const checklistCount = items.filter(i => _CHECKLIST_VERB_RE.test(i.trim())).length;
    if (checklistCount / items.length >= 0.4) {
      return { type: T.CHECKLIST, confidence: 0.82, signals: ['bullet-list', 'checklist-verbs'] };
    }

    const actionCount = items.filter(i => _ACTION_VERB_RE.test(i.trim())).length;
    if (actionCount / items.length >= 0.5) {
      // Action verbs in a bullet list → likely a Checklist (non-sequential steps)
      return { type: T.CHECKLIST, confidence: 0.72, signals: ['bullet-list', 'action-verbs'] };
    }

    // Short average item length → likely a list of terms/features
    const avgLen = items.reduce((s, i) => s + i.split(/\s+/).length, 0) / items.length;
    if (avgLen <= 6) {
      return { type: T.CHECKLIST, confidence: 0.60, signals: ['bullet-list', 'short-items'] };
    }

    // Long prose items → treat as a series of Topics
    return { type: T.TOPIC, confidence: 0.62, signals: ['bullet-list', 'prose-items'] };
  }

  // ── Paragraph classification ──────────────────────────────────────────────
  // Text-pattern rules applied in specificity order (most specific first).

  function _classifyParagraph(text, sectionHint) {
    const trimmed = text.trim();
    if (!trimmed) return { type: T.TOPIC, confidence: 0.50, signals: ['empty-paragraph'] };

    // 1. Question
    if (_QUESTION_RE.test(trimmed)) {
      return { type: T.QUESTION, confidence: 0.88, signals: ['ends-with-question-mark'] };
    }

    // 2. Summary opener
    if (_SUMMARY_RE.test(trimmed)) {
      return { type: T.SUMMARY, confidence: 0.85, signals: ['summary-opener'] };
    }

    // 3. Reference pointer
    if (_REFERENCE_RE.test(trimmed)) {
      return { type: T.REFERENCE, confidence: 0.80, signals: ['reference-language'] };
    }

    // 4. Warning language (when not already a callout element)
    if (_WARNING_RE.test(trimmed)) {
      return { type: T.WARNING, confidence: 0.72, signals: ['warning-language'] };
    }

    // 5. Rule / policy language
    if (_RULE_RE.test(trimmed)) {
      return { type: T.RULE, confidence: 0.75, signals: ['rule-language'] };
    }

    // 6. Definition pattern
    if (_DEFINITION_RE.test(trimmed) || _COLON_DEFINITION_RE.test(trimmed)) {
      // Short text with definition pattern is more likely a Definition than a Topic
      if (trimmed.length < 400) {
        return { type: T.DEFINITION, confidence: 0.72, signals: ['definition-pattern'] };
      }
    }

    // 7. Example language
    if (_EXAMPLE_RE.test(trimmed)) {
      return { type: T.EXAMPLE, confidence: 0.78, signals: ['example-language'] };
    }

    // 8. Section heading context boosts — use sectionHint to refine Topic classification
    if (sectionHint) {
      const lowerHint = sectionHint.toLowerCase();
      if (_CONCEPT_RE.test(trimmed) || /\b(?:overview|background|introduction|what is)\b/i.test(lowerHint)) {
        return { type: T.CONCEPT, confidence: 0.60, signals: ['concept-language', 'section-context'] };
      }
      if (/\b(?:example|exercise|practice|scenario|case study)\b/i.test(lowerHint)) {
        return { type: T.EXAMPLE, confidence: 0.65, signals: ['section-hint-example'] };
      }
    }

    // 9. Concept language in the paragraph itself
    if (_CONCEPT_RE.test(trimmed)) {
      return { type: T.CONCEPT, confidence: 0.58, signals: ['concept-language'] };
    }

    // 10. Fallback — general prose → Topic
    return { type: T.TOPIC, confidence: 0.50, signals: ['paragraph-fallback'] };
  }

  // ── Section heading classification ────────────────────────────────────────
  // Headings are always classified as Heading type.
  // Heading level is preserved for the graphBuilder.

  function classifyHeading(heading, level) {
    return {
      type:       T.HEADING,
      confidence: 0.99,
      signals:    ['explicit-heading', `level-${level}`],
      level,
    };
  }

  // ── Public classify ───────────────────────────────────────────────────────

  /**
   * Classifies a single SDMElement into a canonical KnowledgeObjectType.
   *
   * @param {SDMElement}   element         The element to classify
   * @param {SDMSection}   section         The parent section (for context)
   * @param {number}       elementIndex    Position within section.elements[]
   * @param {SDMElement[]} allElements     Full element array of the section (for neighbour context)
   * @returns {{ type: string, confidence: number, signals: string[] }}
   */
  function classify(element, section, elementIndex, allElements) {
    const sectionHint = section ? (section.heading || '') : '';
    const content     = element.content;

    switch (element.type) {

      case 'image':
        return { type: T.IMAGE, confidence: 0.95, signals: ['image-element'] };

      case 'table':
        return { type: T.TABLE, confidence: 0.95, signals: ['table-element'] };

      case 'callout':
        return _classifyCallout(typeof content === 'string' ? content : '');

      case 'numberedList':
        return _classifyNumberedList(Array.isArray(content) ? content : []);

      case 'bulletList':
        return _classifyBulletList(Array.isArray(content) ? content : []);

      case 'paragraph':
        return _classifyParagraph(typeof content === 'string' ? content : '', sectionHint);

      default:
        // Unknown element type — treat as Topic
        return { type: T.TOPIC, confidence: 0.40, signals: [`unknown-element-type-${element.type}`] };
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return Object.freeze({
    classify,
    classifyHeading,
  });

})();
