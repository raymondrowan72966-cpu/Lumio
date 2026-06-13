/* ============================================================
   BEHAVIOUR RUNTIME
   Resolves a block's interaction primitives (from
   BlockCapabilities.BEHAVIOUR) and family. Architecture-only in
   Phase 1 Step 8 — not yet consumed by any render or event path.
   No interaction behaviour is changed here or elsewhere.
   ============================================================ */

const BehaviourRuntime = (function () {
  function BEHAVIOUR_OF(type) {
    return BlockCapabilities.BEHAVIOUR[type] || { primitives: [] };
  }

  function PRIMITIVES_OF(type) {
    return BEHAVIOUR_OF(type).primitives.slice();
  }

  function resolve(type) {
    return {
      family: BlockFamilies.FAMILY_OF[type],
      primitives: PRIMITIVES_OF(type),
    };
  }

  return {
    BEHAVIOUR_OF,
    PRIMITIVES_OF,
    resolve,
  };
})();
