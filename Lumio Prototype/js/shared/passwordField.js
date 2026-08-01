/**
 * LumioPasswordField — reusable password field enhancement.
 *
 * Provides two independent, composable behaviours:
 *   attachToggle(inputEl)     — Show / Hide password button inside the field.
 *   attachCapsLock(inputEl)   — Caps Lock warning that appears while typing.
 *
 * Both are keyboard-accessible and aria-labelled per the Step 6 spec.
 * Neither clears the field value or moves focus.
 *
 * Usage (login screen example):
 *   LumioPasswordField.attachToggle(document.getElementById('login-password'));
 *   LumioPasswordField.attachCapsLock(document.getElementById('login-password'));
 *
 * The input element must already be in the DOM when these are called.
 * Call them inside bindLoginEvents() / after paintLogin() renders the HTML.
 */
const LumioPasswordField = (function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Show / Hide toggle
  // ---------------------------------------------------------------------------

  /**
   * Wraps the input in a relative-positioned container (if not already) and
   * injects a toggle button to the right. Clicking the button switches the
   * input between type="password" and type="text" without moving focus.
   *
   * @param {HTMLInputElement} input
   */
  function attachToggle(input) {
    if (!input) return;
    if (input.dataset.pwToggle) return; // already attached
    input.dataset.pwToggle = '1';

    // Ensure the parent is position:relative so the button can be positioned.
    const parent = input.parentElement;
    if (!parent) return;
    const existingPosition = getComputedStyle(parent).position;
    if (existingPosition === 'static') parent.style.position = 'relative';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle-btn';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('tabindex', '0');
    btn.innerHTML = _eyeIcon(true);
    // Centre relative to the input itself, not the parent.
    // input.offsetTop is 0 when the parent wraps only the input (login page),
    // and equals the label height when the parent also contains a label (profile page).
    const inputCentreTop = input.offsetTop + input.offsetHeight / 2;
    btn.style.cssText = [
      'position:absolute',
      'right:10px',
      'top:' + inputCentreTop + 'px',
      'transform:translateY(-50%)',
      'background:none',
      'border:none',
      'padding:4px',
      'cursor:pointer',
      'color:var(--ink-400)',
      'display:flex',
      'align-items:center',
      'line-height:1',
    ].join(';');

    // Give the input room so text doesn't slide under the button.
    input.style.paddingRight = '36px';

    parent.appendChild(btn);

    btn.addEventListener('click', function () {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.innerHTML = _eyeIcon(!isPassword);
      btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      // Return focus to the input so keyboard users don't lose their place.
      input.focus();
    });
  }

  // ---------------------------------------------------------------------------
  // Caps Lock indicator
  // ---------------------------------------------------------------------------

  /**
   * Adds a small "Caps Lock is on." warning that appears below the input
   * whenever Caps Lock is active while the user is typing. Disappears
   * automatically when Caps Lock is released.
   *
   * @param {HTMLInputElement} input
   */
  function attachCapsLock(input) {
    if (!input) return;
    if (input.dataset.pwCaps) return; // already attached
    input.dataset.pwCaps = '1';

    const indicator = document.createElement('p');
    indicator.className = 'caps-lock-indicator';
    indicator.textContent = 'Caps Lock is on.';
    indicator.setAttribute('aria-live', 'polite');
    indicator.style.cssText = [
      'display:none',
      'font-size:12px',
      'color:var(--color-warning, #b45309)',
      'margin-top:4px',
    ].join(';');

    const parent = input.parentElement;
    if (!parent) return;
    parent.insertAdjacentElement('afterend', indicator);

    function update(e) {
      if (e.getModifierState) {
        indicator.style.display = e.getModifierState('CapsLock') ? 'block' : 'none';
      }
    }

    input.addEventListener('keydown', update);
    input.addEventListener('keyup', update);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  function _eyeIcon(isVisible) {
    // eye = show (currently hidden), eye-slash = hide (currently visible)
    if (isVisible) {
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </svg>`;
    }
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>`;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    attachToggle: attachToggle,
    attachCapsLock: attachCapsLock,
  };
})();
