/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Knowledge Graph Builder
   Phase 3: Knowledge Modeller

   Assembles classifier output into a flat KnowledgeObject graph.

   Responsibilities:
     1. Assign stable IDs to each KnowledgeObject
     2. Convert SDM sections → Heading KOs
     3. Convert classified SDM elements → typed KOs
     4. Expand Procedure lists → Procedure KO + Step child KOs
     5. Expand Checklist lists → Checklist KO (items as content array)
     6. Establish parent-child relationships (parentId)
     7. Build SourceReferences from SDM location data

   Parent-child hierarchy:
     - Heading KO is the parent of all elements in that section
     - Procedure KO is the parent of all its Step KOs
     - All other KOs have the section Heading as their parent

   The result is a flat array — tree structure is encoded via
   parentId references, not nesting. Phase 4 traverses via lookup.

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelGraphBuilder = (() => {

  const T = DocIntelObjectTypes.TYPES;

  // ── Source reference helpers ──────────────────────────────────────────────

  function _pageRangeStr(start, end) {
    if (!start && !end) return null;
    if (start === end || !end) return String(start || end);
    return `${start}–${end}`;
  }

  function _makeRef(section, elementIndex, evidence) {
    const pageRange = _pageRangeStr(
      section.sourceLocation.pageStart,
      section.sourceLocation.pageEnd,
    );
    return DocIntelTraceability.createRef(
      section.id,
      section.heading || section.id,
      pageRange,
      elementIndex !== null ? [elementIndex] : [],
      evidence,
    );
  }

  function _makeElementRef(section, element, elementIndex, evidence) {
    const page = element.sourceLocation ? element.sourceLocation.page : null;
    return DocIntelTraceability.createRef(
      section.id,
      section.heading || section.id,
      page ? String(page) : _pageRangeStr(section.sourceLocation.pageStart, section.sourceLocation.pageEnd),
      [elementIndex],
      evidence,
    );
  }

  // ── KO factory wrapper ────────────────────────────────────────────────────

  function _makeKO(type, content, level, parentId, source) {
    const id = DocIntelTraceability.generateId('ko');
    return DocIntelModels.createKnowledgeObject(id, type, content, level, parentId, source);
  }

  // ── Procedure expansion ───────────────────────────────────────────────────
  // A numbered list classified as Procedure becomes:
  //   - One Procedure KO (content = first item or a synthesised title)
  //   - N Step KOs (content = each list item)

  function _expandProcedure(items, parentSectionId, source) {
    const objects = [];

    // Use the first item as the Procedure "title" if it reads like one,
    // otherwise use a generic placeholder that Phase 4 will refine
    const procContent = items.length === 1
      ? items[0]
      : { title: '', steps: items }; // Phase 4 will synthesise a title

    const procKo = _makeKO(T.PROCEDURE, procContent, null, parentSectionId, source);
    objects.push(procKo);

    const procId = procKo.id;
    for (const item of items) {
      if (!item || !item.trim()) continue;
      const stepKo = _makeKO(T.STEP, item.trim(), null, procId, source);
      objects.push(stepKo);
    }

    return objects;
  }

  // ── Checklist expansion ───────────────────────────────────────────────────
  // A list classified as Checklist becomes one Checklist KO.
  // Content is the array of items — preserved for BlockRecommender.

  function _expandChecklist(items, parentId, source) {
    const filtered = items.filter(i => i && i.trim());
    return [_makeKO(T.CHECKLIST, filtered, null, parentId, source)];
  }

  // ── Main build function ───────────────────────────────────────────────────

  /**
   * Builds a flat KnowledgeObject array from a StructuredDocumentModel.
   * Uses DocIntelClassifier to type each element.
   *
   * @param {StructuredDocumentModel} sdm
   * @returns {KnowledgeObject[]}
   */
  function build(sdm) {
    const objects = [];

    for (const section of sdm.sections) {
      // ── Section heading → Heading KO ─────────────────────────────────────
      let headingKoId = null;

      if (section.heading) {
        const { type, level } = DocIntelClassifier.classifyHeading(section.heading, section.level);
        const source = _makeRef(section, null, 'explicit document heading');
        const ko     = _makeKO(type, section.heading, level || section.level, null, source);
        objects.push(ko);
        headingKoId = ko.id;
      }

      // ── Section elements ──────────────────────────────────────────────────
      for (let i = 0; i < section.elements.length; i++) {
        const element = section.elements[i];
        const { type, confidence, signals } = DocIntelClassifier.classify(
          element, section, i, section.elements,
        );

        const evidence = signals.join(', ');
        const source   = _makeElementRef(section, element, i, evidence);

        // ── List types need expansion ─────────────────────────────────────
        if (type === T.PROCEDURE && Array.isArray(element.content)) {
          const expanded = _expandProcedure(element.content, headingKoId, source);
          objects.push(...expanded);
          continue;
        }

        if (type === T.CHECKLIST && Array.isArray(element.content)) {
          const expanded = _expandChecklist(element.content, headingKoId, source);
          objects.push(...expanded);
          continue;
        }

        // ── All other element types ───────────────────────────────────────
        const ko = _makeKO(type, element.content, null, headingKoId, source);
        objects.push(ko);
      }
    }

    return objects;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return Object.freeze({ build });

})();
