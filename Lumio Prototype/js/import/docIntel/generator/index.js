/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Course Generator Entry Point
   Phase 5: Course Generator

   Public entry point for the Course Generator.
   Transforms an InstructionalModel into a LumioState.wizard state.

   Usage:
     DocIntelGenerator.generate(im);
     // LumioState.wizard is now set; navigate('#/wizard') to proceed.

   Also exposes buildWizardState(im) as a pure function for
   preview, validation, and testing without touching LumioState.

   Dependencies (global IIFE modules):
     - DocIntelWizardBuilder  (generator/wizardBuilder.js)

   Reads LumioState at call time only — not at module load time.
   No imports from any existing Lumio subsystem beyond LumioState.
   No application integration. No UI. No navigation side effects.
   ============================================================ */

const DocIntelGenerator = (() => {

  /**
   * Transforms an InstructionalModel into a wizard state and writes
   * it to LumioState.wizard.
   *
   * After this call, LumioState.wizard is in the same state as if a
   * user had completed all wizard steps and accepted the AI Blueprint.
   * The caller is responsible for navigation (navigate('#/wizard')).
   *
   * @param {InstructionalModel} im  Output of DocIntelInstruction.analyse()
   * @throws {Error} If im is invalid or LumioState is unavailable
   */
  function generate(im) {
    if (typeof LumioState === 'undefined' || LumioState === null) {
      throw new Error('DocIntelGenerator: LumioState is not available');
    }
    LumioState.wizard = DocIntelWizardBuilder.build(im);
  }

  /**
   * Pure function — builds the wizard state without writing to LumioState.
   * Useful for preview, validation, and unit testing in isolation.
   *
   * @param {InstructionalModel} im
   * @returns {object} Wizard state object (identical shape to LumioState.wizard)
   */
  function buildWizardState(im) {
    return DocIntelWizardBuilder.build(im);
  }

  return Object.freeze({ generate, buildWizardState });

})();
