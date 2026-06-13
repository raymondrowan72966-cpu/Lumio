/* ============================================================
   BLOCK SCHEMA
   Defines the unified block shape and a factory for producing
   schema-correct defaults for any block type, driven by
   js/blocks/capabilities.js. No rendering logic here.
   ============================================================ */

const BlockSchema = (function () {
  const SCHEMA_KEYS = [
    'id', 'type', 'content', 'design', 'behaviour',
    'accessibility', 'ai', 'analytics', 'media', 'meta',
  ];

  let nextId = 1;
  function generateId(type) {
    return `${type}_${Date.now().toString(36)}_${(nextId++).toString(36)}`;
  }

  function createDefaultBlock(type) {
    const design = BlockCapabilities.DESIGN[type] || { category: 'document' };
    const behaviour = BlockCapabilities.BEHAVIOUR[type] || { primitives: [] };
    const accessibility = BlockCapabilities.ACCESSIBILITY[type] || { decorative: false, contrastCheck: false };
    const ai = BlockCapabilities.AI[type] || { assistActions: [] };
    const analytics = BlockCapabilities.ANALYTICS[type] || { events: [] };
    const media = BlockCapabilities.MEDIA[type] || { hasMedia: false, kind: null };
    const completion = BlockCapabilities.COMPLETION[type] || { strategy: 'none' };

    const now = new Date().toISOString();

    return {
      id: generateId(type),
      type,
      content: {},
      design: {
        category: design.category,
        typography: {},
        spacing: {},
        width: 'standard',
        background: {},
        border: {},
      },
      behaviour: {
        primitives: behaviour.primitives.slice(),
      },
      accessibility: {
        decorative: accessibility.decorative,
        contrastCheck: accessibility.contrastCheck,
        altText: '',
      },
      ai: {
        generationSource: 'manual',
        reviewStatus: 'approved',
        assistActions: ai.assistActions.slice(),
      },
      analytics: {
        events: analytics.events.slice(),
      },
      media: {
        hasMedia: media.hasMedia,
        kind: media.kind,
        refs: [],
      },
      meta: {
        completionStrategy: completion.strategy,
        requiredForCompletion: false,
        createdAt: now,
        updatedAt: now,
        createdBy: 'unknown',
        updatedBy: 'unknown',
        version: 1,
      },
    };
  }

  return {
    SCHEMA_KEYS,
    createDefaultBlock,
  };
})();
