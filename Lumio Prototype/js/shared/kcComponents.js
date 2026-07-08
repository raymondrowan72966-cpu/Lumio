// js/shared/kcComponents.js
// Single source of truth for Knowledge Check visual rendering.
// Loaded after lessonBuilder.js (provides escapeHtml, richTextOut, RADIUS_MAP,
// interactiveBorderStyle, interactiveSpacingStyle, normalizeKc*) and before
// learnerPreview.js so both screens can call these functions.
//
// opts shape:
//   editable: true   → Builder; text uses contenteditable spans; no real inputs
//   editable: false  → Learner; real inputs + data-* interaction attributes
//
// Builder wraps the returned HTML in its own `<div style="...">` container
// (same interactiveSpacingStyle/border/radius as learnerKcWrap), so the outer
// shell is also identical — full WYSIWYG parity.

// ── Internal helpers ────────────────────────────────────────────────────────

function _kcEditableText(o, fieldName, col, placeholder) {
  return `<span class="editable-text" data-field="${fieldName}" data-col="${col}"
    contenteditable="true" spellcheck="false" data-placeholder="${placeholder}"
    style="flex:1; outline:none;">${richTextOut(o || '')}</span>`;
}

function _kcOptionClass(st) {
  return ['kc-option',
    st.correct  ? 'correct'   : '',
    st.wrong    ? 'wrong'     : '',
    (st.selected && !st.reveal) ? 'selected' : '',
    st.interactive !== false  ? 'kc-interactive' : '',
  ].filter(Boolean).join(' ');
}

// ── Shared KC instruction/heading typography ─────────────────────────────────
// Single source of truth for ALL KC instruction text (question headings,
// interactive instructions, sentence prompts). Every KC type renders its
// primary heading through one of these two helpers so all six types share
// identical font-size, font-weight, colour, line-height and spacing.

// Static instruction line (Matching, Ordering, Cards) — plain text, not user-authored.
function _kcInstruction(text) {
  return `<p class="kc-question">${text}</p>`;
}

// ── MC / MR authored question heading ────────────────────────────────────────

function _kcQuestionHtml(question, fieldName, opts) {
  if (opts.editable) {
    // <div> because contenteditable is not permitted inside <legend>
    return `<div class="editable-text kc-question" data-field="${fieldName}"
      data-richtext="true" contenteditable="true" spellcheck="false"
      data-placeholder="Enter your question…"
      style="outline:none; min-height:1.4em;">${richTextOut(question)}</div>`;
  }
  return `<legend class="kc-question">${escapeHtml(question)}</legend>`;
}

// ── Multiple Choice ──────────────────────────────────────────────────────────

function kcSharedMC(d, ds, opts) {
  opts = opts || {};
  const options = normalizeKcOptions(d);
  const questionHtml = _kcQuestionHtml(d.question || 'Which of the following is correct?', 'kcQuestion', opts);

  const optionsHtml = options.map((o, i) => {
    const st = (opts.optionStates && opts.optionStates[i]) || {};
    const cls = _kcOptionClass(st);
    const textHtml = opts.editable
      ? _kcEditableText(o, 'kcOption', i, 'Option…')
      : `<span style="flex:1;">${escapeHtml(o)}</span>`;

    if (opts.editable) {
      return `<div class="${cls}">
        <span class="kc-choice-indicator" aria-hidden="true"></span>
        ${textHtml}
      </div>`;
    }
    return `<label class="${cls}">
      <input type="radio" name="kc-${opts.key}" data-kc-key="${opts.key}" data-i="${i}"
        ${st.selected ? 'checked' : ''} ${st.disabled ? 'disabled' : ''} />
      <span class="kc-choice-indicator" aria-hidden="true"></span>
      ${textHtml}
      ${st.correct ? '<span class="kc-label-correct">✓ Correct</span>' : ''}
      ${st.wrong   ? '<span class="kc-label-wrong">✕ Wrong</span>'   : ''}
    </label>`;
  }).join('');

  if (opts.editable) {
    return `<div>${questionHtml}<div class="flex-col gap-8">${optionsHtml}</div></div>`;
  }
  return `<fieldset style="border:none; margin:0; padding:0;">${questionHtml}<div class="flex-col gap-8">${optionsHtml}</div></fieldset>`;
}

// ── Multiple Response ────────────────────────────────────────────────────────

function kcSharedMR(d, ds, opts) {
  opts = opts || {};
  const options = normalizeKcOptions(d);
  const questionHtml = _kcQuestionHtml(d.question || 'Select all that apply.', 'kcQuestion', opts);

  const optionsHtml = options.map((o, i) => {
    const st = (opts.optionStates && opts.optionStates[i]) || {};
    const cls = _kcOptionClass(st);
    const textHtml = opts.editable
      ? _kcEditableText(o, 'kcOption', i, 'Option…')
      : `<span style="flex:1;">${escapeHtml(o)}</span>`;

    if (opts.editable) {
      return `<div class="${cls}">
        <span class="kc-choice-indicator kc-choice-check" aria-hidden="true"></span>
        ${textHtml}
      </div>`;
    }
    return `<label class="${cls}">
      <input type="checkbox" data-kc-key="${opts.key}" data-i="${i}"
        ${st.selected ? 'checked' : ''} ${st.disabled ? 'disabled' : ''} />
      <span class="kc-choice-indicator kc-choice-check" aria-hidden="true"></span>
      ${textHtml}
      ${st.correct ? '<span class="kc-label-correct">✓ Correct</span>' : ''}
      ${st.wrong   ? '<span class="kc-label-wrong">✕ Wrong</span>'   : ''}
    </label>`;
  }).join('');

  if (opts.editable) {
    return `<div>${questionHtml}<div class="flex-col gap-8">${optionsHtml}</div></div>`;
  }
  return `<fieldset style="border:none; margin:0; padding:0;">${questionHtml}<div class="flex-col gap-8">${optionsHtml}</div></fieldset>`;
}

// ── Matching ─────────────────────────────────────────────────────────────────

function kcSharedMatching(d, ds, opts) {
  opts = opts || {};
  const left  = normalizeKcLeft(d);
  const right = normalizeKcRight(d);
  const ml = (opts.matchStates && opts.matchStates.left)  || {};
  const locked = opts.locked || false;

  const leftHtml = left.map((l, i) => {
    const st = ml[i] || {};
    const cls = ['kc-option lp-match-left',
      (!opts.editable && !locked) ? 'kc-interactive' : '',
      st.selected ? 'selected' : '',
      st.correct  ? 'correct'  : '',
      st.wrong    ? 'wrong'    : '',
    ].filter(Boolean).join(' ');

    if (opts.editable) {
      return `<div class="${cls}">
        ${_kcEditableText(l, 'kcPairLeft', i, 'Item…')}
      </div>`;
    }
    const matchedTo = st.matchedTo || '';
    return `<div class="${cls}" data-kc-key="${opts.key}" data-i="${i}"
      role="button" tabindex="${locked ? '-1' : '0'}"
      aria-pressed="${!!st.selected}"
      style="cursor:${locked ? 'default' : 'pointer'}; font-size:13px;">
      ${escapeHtml(l)}${matchedTo ? ` <span style="opacity:0.5;">→</span> <strong>${escapeHtml(matchedTo)}</strong>` : ''}
    </div>`;
  }).join('');

  const rightHtml = right.map((r, i) => {
    if (opts.editable) {
      return `<div class="kc-option lp-match-right">
        ${_kcEditableText(r, 'kcPairRight', i, 'Match…')}
      </div>`;
    }
    return `<div class="kc-option lp-match-right" data-kc-key="${opts.key}" data-i="${i}"
      role="button" tabindex="${locked ? '-1' : '0'}"
      style="cursor:${locked ? 'default' : 'pointer'}; font-size:13px;">${escapeHtml(r)}</div>`;
  }).join('');

  const hint = 'Tap an item on the left, then its match on the right.';

  return `
    ${_kcInstruction(hint)}
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      <div class="flex-col gap-8">${leftHtml}</div>
      <div class="flex-col gap-8">${rightHtml}</div>
    </div>`;
}

// ── Ordering ─────────────────────────────────────────────────────────────────

function kcSharedOrdering(d, ds, opts) {
  opts = opts || {};
  const items = normalizeKcItems(d);

  if (opts.editable) {
    return `
      ${_kcInstruction('Use the arrows to arrange these in the correct order.')}
      <div class="flex-col gap-8">
        ${items.map((item, i) => `
          <div class="kc-order-item">
            <span class="kc-order-num" aria-label="Position ${i + 1}">${i + 1}</span>
            ${_kcEditableText(item, 'kcItem', i, 'Step…')}
            <button class="btn-icon" disabled aria-label="Move up" style="opacity:0.35;">↑</button>
            <button class="btn-icon" disabled aria-label="Move down" style="opacity:0.35;">↓</button>
          </div>`).join('')}
      </div>`;
  }

  const order = opts.order || items.map((_, i) => i);
  const reveal = opts.reveal || false;
  const submitted = opts.submitted || false;

  return `
    ${_kcInstruction('Use the arrows to arrange these in the correct order.')}
    <div class="flex-col gap-8">
      ${order.map((itemIdx, pos) => {
        const inCorrectPos = reveal && itemIdx === pos;
        const inWrongPos   = reveal && itemIdx !== pos;
        return `
        <div class="kc-order-item${inCorrectPos ? ' correct' : ''}${inWrongPos ? ' wrong' : ''}">
          <span class="kc-order-num" aria-label="Position ${pos + 1}">${pos + 1}</span>
          <span style="flex:1;">${escapeHtml(items[itemIdx])}</span>
          ${!submitted ? `
            <button class="btn-icon lp-order-up" data-kc-key="${opts.key}" data-block-index="${opts.blockIndex}" data-i="${pos}"
              ${pos === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
            <button class="btn-icon lp-order-down" data-kc-key="${opts.key}" data-block-index="${opts.blockIndex}" data-i="${pos}"
              ${pos === order.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          ` : ''}
          ${inCorrectPos ? '<span class="kc-label-correct">✓</span>' : ''}
          ${inWrongPos   ? '<span class="kc-label-wrong">✕</span>'   : ''}
        </div>`;
      }).join('')}
    </div>`;
}

// ── Fill the Gap ──────────────────────────────────────────────────────────────

function kcSharedFillGap(d, ds, opts) {
  opts = opts || {};
  const answers = normalizeKcAnswers(d);

  if (opts.editable) {
    return `
      <div class="editable-text kc-question" data-field="kcGapText" data-richtext="true"
        contenteditable="true" spellcheck="false"
        data-placeholder="Enter the sentence with ____ marking the gap…"
        style="outline:none;"
      >${richTextOut(d.text || '')}</div>
      <input class="kc-fill-input" disabled placeholder="Type your answer…" style="margin-top:12px;" />`;
  }

  const text = d.text || 'Complete this sentence: ____.';
  const submitted = opts.submitted || false;
  const ans = opts.ans || {};
  const reveal = opts.reveal || false;

  const revealHtml = (() => {
    if (!reveal || ans.lastCorrect !== false) return '';
    const firstAccepted = (Array.isArray(d.answers) && d.answers[0])
      ? d.answers[0]
      : (d.answer || '').split('|')[0].trim();
    return firstAccepted ? `<div class="text-xs text-muted mt-4">Accepted answer: ${escapeHtml(firstAccepted)}</div>` : '';
  })();

  return `
    <p class="kc-question">${text}</p>
    <input class="kc-fill-input lp-kc-fillgap-input" data-kc-key="${opts.key}"
      placeholder="Type your answer…"
      value="${(ans.response || '').replace(/"/g, '&quot;')}"
      ${submitted ? 'disabled' : ''} />
    ${revealHtml}`;
}
