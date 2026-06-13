/* ============================================================
   ACCESSIBILITY RUNTIME
   Resolves a block's accessibility profile (from
   BlockCapabilities.ACCESSIBILITY) and family. Mirrors
   designSystem.js / behaviourRuntime.js — a thin read-only
   lookup layer over the existing capability map.
   ============================================================ */

const AccessibilityRuntime = (function () {
  function ACCESSIBILITY_OF(type) {
    return BlockCapabilities.ACCESSIBILITY[type] || { decorative: false, contrastCheck: false };
  }

  function resolve(type) {
    return {
      family: BlockFamilies.FAMILY_OF[type],
      ...ACCESSIBILITY_OF(type),
    };
  }

  return {
    ACCESSIBILITY_OF,
    resolve,
  };
})();
