/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — CKM Analyser
   Phase 4: Instructional Intelligence

   Analyses a CanonicalKnowledgeModel and produces a reusable
   AnalysisResult consumed by every other Phase 4 sub-component.
   All analysis is deterministic — same CKM always produces
   the same result.

   Responsibilities:
     - Infer subject domain from KO vocabulary
     - Build topic groups (lesson boundary candidates)
     - Build a content-type frequency profile
     - Extract the title candidate from the first heading KO

   AnalysisResult shape:
   {
     titleCandidate: string,
     domain:         string,      // 'generic' | 'safety' | 'compliance' | 'technology' | 'healthcare' | 'business' | 'operations'
     domainSignals:  string[],    // vocabulary terms that drove the inference
     topicGroups:    TopicGroup[],
     contentProfile: { [KOType]: number },
     totalKOs:       number,
     wordEstimate:   number,
   }

   TopicGroup shape:
   {
     headingId:   string|null,
     headingText: string,
     level:       number,
     koIds:       string[],   // IDs of non-heading KOs in this group
   }

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelAnalyser = (() => {

  const T = DocIntelObjectTypes.TYPES;

  // ── Domain vocabulary ─────────────────────────────────────────────────────
  // Each domain maps to a set of indicator terms. Checked against a lowercase
  // concatenation of heading, concept, definition, and topic KO text.

  const DOMAIN_VOCAB = Object.freeze({
    safety:     ['safety', 'hazard', 'risk', 'emergency', 'ppe', 'protective', 'evacuation', 'incident', 'accident', 'injury', 'lockout', 'fire drill'],
    compliance: ['compliance', 'regulation', 'policy', 'mandatory', 'audit', 'gdpr', 'iso', 'legislation', 'requirement', 'breach', 'data protection'],
    technology: ['software', 'system', 'application', 'database', 'network', 'api', 'interface', 'configure', 'install', 'server', 'code', 'deploy', 'login'],
    healthcare: ['patient', 'clinical', 'medical', 'health', 'treatment', 'diagnosis', 'medication', 'symptom', 'clinician', 'ward', 'prescription'],
    business:   ['revenue', 'customer', 'sales', 'marketing', 'strategy', 'stakeholder', 'budget', 'roi', 'kpi', 'client', 'contract', 'invoice'],
    operations: ['process', 'operation', 'workflow', 'production', 'quality', 'manufacturing', 'logistics', 'inventory', 'output', 'shift'],
  });

  // ── Domain inference ──────────────────────────────────────────────────────

  function _inferDomain(ckm) {
    // Sample text from structural / descriptive KOs
    const sampleTypes = new Set([T.HEADING, T.CONCEPT, T.DEFINITION, T.TOPIC, T.RULE]);
    const text = ckm.objects
      .filter(o => sampleTypes.has(o.type) && typeof o.content === 'string')
      .map(o => o.content)
      .join(' ')
      .toLowerCase();

    if (!text.trim()) return { domain: 'generic', signals: [] };

    const scores = {};
    for (const [domain, vocab] of Object.entries(DOMAIN_VOCAB)) {
      const matched = vocab.filter(term => text.includes(term));
      if (matched.length) scores[domain] = matched;
    }

    const ranked = Object.entries(scores).sort((a, b) => b[1].length - a[1].length);
    if (!ranked.length) return { domain: 'generic', signals: [] };

    const [topDomain, topSignals] = ranked[0];
    return { domain: topDomain, signals: topSignals };
  }

  // ── Topic group builder ───────────────────────────────────────────────────
  // Groups KOs into lesson-level clusters.
  // A new group starts at each Heading KO with level ≤ 2.
  // Level-3+ headings and all non-heading KOs belong to the current group.
  // Content before the first heading belongs to an implicit preamble group.

  function _buildTopicGroups(ckm) {
    const groups = [];
    let currentGroup = null;

    for (const ko of ckm.objects) {
      const isHeading   = ko.type === T.HEADING;
      const isTopLevel  = isHeading && (ko.level !== null && ko.level <= 2);

      if (isTopLevel) {
        // Close previous group; start a new lesson-level group
        currentGroup = {
          headingId:   ko.id,
          headingText: typeof ko.content === 'string' ? ko.content : `Section ${groups.length + 1}`,
          level:       ko.level || 1,
          koIds:       [],
        };
        groups.push(currentGroup);

      } else if (isHeading) {
        // Sub-heading (level 3+) belongs to the current group as content
        if (!currentGroup) {
          // Preamble group — content before any level-1/2 heading
          currentGroup = { headingId: null, headingText: 'Introduction', level: 1, koIds: [] };
          groups.push(currentGroup);
        }
        currentGroup.koIds.push(ko.id);

      } else {
        // Regular KO
        if (!currentGroup) {
          currentGroup = { headingId: null, headingText: 'Introduction', level: 1, koIds: [] };
          groups.push(currentGroup);
        }
        currentGroup.koIds.push(ko.id);
      }
    }

    // Remove groups with no heading and no KOs (should not occur, but defensive)
    return groups.filter(g => g.headingId || g.koIds.length > 0);
  }

  // ── Content profile ───────────────────────────────────────────────────────

  function _buildContentProfile(ckm) {
    const profile = {};
    for (const ko of ckm.objects) {
      profile[ko.type] = (profile[ko.type] || 0) + 1;
    }
    return profile;
  }

  // ── Title extraction ──────────────────────────────────────────────────────

  function _extractTitle(ckm) {
    const first = ckm.objects.find(o => o.type === T.HEADING);
    return first && typeof first.content === 'string' ? first.content : '';
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Analyses a CanonicalKnowledgeModel and returns a reusable AnalysisResult.
   * @param {CanonicalKnowledgeModel} ckm
   * @returns {AnalysisResult}
   */
  function analyse(ckm) {
    const { domain, signals } = _inferDomain(ckm);

    return Object.freeze({
      titleCandidate: _extractTitle(ckm),
      domain,
      domainSignals:  signals,
      topicGroups:    _buildTopicGroups(ckm),
      contentProfile: _buildContentProfile(ckm),
      totalKOs:       ckm.objects.length,
      wordEstimate:   ckm.metadata.estimatedWordCount || 0,
    });
  }

  return Object.freeze({ analyse });

})();
