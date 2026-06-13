/* ============================================================
   BLOCK MIGRATION
   Non-destructive, in-memory mapping from the existing
   { type, data, design } lesson-block shape to the unified
   BlockSchema shape. Source data (js/data.js) is never modified.
   ============================================================ */

const BlockMigration = (function () {

  // Flat legacy design keys -> nested BlockSchema design groups.
  function migrateDesign(oldDesign, defaults) {
    const design = {
      category: defaults.category,
      typography: {},
      spacing: {},
      width: 'standard',
      background: {},
      border: {},
    };
    if (!oldDesign) return design;

    const typographyKeys = ['fontSize', 'fontWeight', 'align', 'color', 'lineHeight'];
    const spacingKeys = ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'marginTop', 'marginBottom'];
    const backgroundKeys = ['bgType', 'bgColor', 'bgImage'];
    const borderKeys = ['borderOn', 'borderColor', 'borderWidth', 'borderRadius'];

    Object.keys(oldDesign).forEach((key) => {
      const value = oldDesign[key];
      if (typographyKeys.includes(key)) design.typography[key] = value;
      else if (spacingKeys.includes(key)) design.spacing[key] = value;
      else if (backgroundKeys.includes(key)) design.background[key] = value;
      else if (borderKeys.includes(key)) design.border[key] = value;
      else if (key === 'width') design.width = value;
      else design[key] = value; // unknown legacy key: preserve as-is
    });

    return design;
  }

  function migrateBlock(oldBlock, index, lessonId) {
    const type = oldBlock.type;
    try {
      const defaultBlock = BlockSchema.createDefaultBlock(type);
      const migrated = {
        id: oldBlock.id || `${lessonId || 'lesson'}_${type}_${index}`,
        type,
        content: oldBlock.data || {},
        design: migrateDesign(oldBlock.design, defaultBlock.design),
        behaviour: defaultBlock.behaviour,
        accessibility: defaultBlock.accessibility,
        ai: defaultBlock.ai,
        analytics: defaultBlock.analytics,
        media: defaultBlock.media,
        meta: Object.assign({}, defaultBlock.meta, {
          createdBy: 'system-migration',
          updatedBy: 'system-migration',
        }),
      };
      return migrated;
    } catch (e) {
      console.warn(`[BlockMigration] Failed to migrate block type "${type}" (lesson ${lessonId}, index ${index}):`, e);
      return {
        id: oldBlock.id || `${lessonId || 'lesson'}_${type}_${index}`,
        type,
        content: oldBlock.data || {},
        design: oldBlock.design || {},
        behaviour: { primitives: [] },
        accessibility: { decorative: false, contrastCheck: false, altText: '' },
        ai: { generationSource: 'manual', reviewStatus: 'approved', assistActions: [] },
        analytics: { events: [] },
        media: { hasMedia: false, kind: null, refs: [] },
        meta: { completionStrategy: 'none', requiredForCompletion: false, version: 0 },
      };
    }
  }

  function migrateLesson(blocks, lessonId) {
    if (!Array.isArray(blocks)) return [];
    return blocks.map((block, index) => migrateBlock(block, index, lessonId));
  }

  function validateMigratedBlock(block) {
    const errors = [];
    BlockSchema.SCHEMA_KEYS.forEach((key) => {
      if (!(key in block)) errors.push(`missing key "${key}"`);
    });
    if (typeof block.content !== 'object') errors.push('content is not an object');
    if (typeof block.design !== 'object') errors.push('design is not an object');
    if (typeof block.meta !== 'object') errors.push('meta is not an object');
    return errors;
  }

  // Dev-mode smoke test: migrate every lesson in LumioState and log any
  // validation failures. Read-only — does not touch LumioState.lessons.
  function validateAllLessons() {
    let blockCount = 0;
    let failureCount = 0;
    Object.keys(LumioState.lessons).forEach((lessonId) => {
      const migrated = migrateLesson(LumioState.lessons[lessonId], lessonId);
      migrated.forEach((block, index) => {
        blockCount++;
        const errors = validateMigratedBlock(block);
        if (errors.length) {
          failureCount++;
          console.warn(`[BlockMigration] lesson "${lessonId}" block ${index} (${block.type}):`, errors);
        }
      });
    });
    console.log(`[BlockMigration] validated ${blockCount} blocks across ${Object.keys(LumioState.lessons).length} lessons — ${failureCount} failure(s).`);
  }

  return {
    migrateBlock,
    migrateLesson,
    validateMigratedBlock,
    validateAllLessons,
  };
})();
