// js/shared/kcComponents.js
// ── Assessment Engine — shared KC rendering layer ────────────────────────────
//
// Architecture contract:
//   This file is the single source of truth for ALL KC visual rendering.
//   Assessment types provide: question text, interaction model, correct answer,
//   optional settings. Everything else (heading, instruction, footer, feedback,
//   answer cards) is owned by the engine and rendered through this file.
//
// Load order: lessonBuilder.js → pdf.js → publish.js → kcComponents.js →
//   learnerPreview.js
//   (lessonBuilder.js provides escapeHtml, richTextOut, RADIUS_MAP,
//    interactiveBorderStyle, interactiveSpacingStyle, normalizeKc*)
//
// opts shape (passed from both Builder and Learner callers):
//   editable: true   → Builder; text uses contenteditable divs; no real inputs
//   editable: false  → Learner; real inputs + data-* interaction attributes
//
// Builder/Preview parity:
//   Builder wraps returned HTML in its own container matching learnerKcWrap —
//   same border, radius, and spacing — so both screens share identical rendering
//   and differ only in whether editing controls are present. No separate
//   "builder renderer" exists; the editable:true path IS the builder renderer.

// ── Default instruction text — resolved through Label Engine at call time ─────
// Returns the active-language default instruction for each KC type.
// These are the strings shown when the author has not customised the instruction
// field. L() falls back to English if the Label Engine has not loaded yet.
function kcDefaultInstruction(type) {
  if (typeof L !== 'function') {
    const fallbacks = {
      kc_matching:       'Tap an item on the left, then its match on the right.',
      kc_ordering:       'Use the arrows to arrange these in the correct order.',
      kc_fill_gap:       'Complete the missing word or phrase.',
      kc_matching_cards: 'Drag each card to its correct category.',
    };
    return fallbacks[type] || '';
  }
  const keyMap = {
    kc_matching:       'kc.default_instruction.matching',
    kc_ordering:       'kc.default_instruction.ordering',
    kc_fill_gap:       'kc.default_instruction.fill_gap',
    kc_matching_cards: 'kc.default_instruction.matching_cards',
  };
  return L(keyMap[type] || type);
}

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

// ── Shared KC heading — single renderer for every KC type ────────────────────
//
// ALL six KC types route their primary heading/instruction through this one
// function. No assessment type owns its own heading renderer. This guarantees
// identical font-size, font-weight, colour, line-height, spacing, and
// rich-text support across Builder, Preview, and Published.
//
// opts:
//   editable:    true  → contenteditable div (Builder); false → rendered (Learner)
//   field:       'kcQuestion'    (MC/MR — stored in block.data.question)
//              | 'kcInstruction' (Matching/Ordering/FillGap/MatchingCards —
//                                 stored in block.data.instruction)
//   placeholder: string          (shown when empty in Builder)
//   asLegend:    true            (MC/MR learner path only — wraps in <legend>
//                                 so it acts as the <fieldset> label)
function _kcHeading(text, opts) {
  opts = opts || {};
  const field       = opts.field       || 'kcQuestion';
  const placeholder = opts.placeholder || 'Enter your question…';
  if (opts.editable) {
    return `<div class="editable-text kc-question" data-field="${field}"
      data-richtext="true" contenteditable="true" spellcheck="false"
      data-placeholder="${placeholder}"
      style="outline:none; min-height:1.4em;">${richTextOut(text || '')}</div>`;
  }
  // richTextOut preserves any bold/italic/size/colour applied in the builder.
  // <legend> correctly labels a <fieldset> for MC/MR; all other types use <p>.
  if (opts.asLegend) {
    return `<legend class="kc-question">${richTextOut(text || '')}</legend>`;
  }
  return `<p class="kc-question">${richTextOut(text || '')}</p>`;
}

// ── Assessment Footer — single source of truth for the Submit button ─────────
// opts:
//   editable: true  → Builder disabled placeholder
//   editable: false → Learner active button
//   align: 'left' | 'center' | 'right'  (default 'center')
//   key: string     — data-kc-key
//   kcType: string  — data-kc-type (mc, response, matching, ordering, fill_gap)
//   disabled: bool  — whether Submit should be disabled (no answer yet)
function _kcFooter(opts) {
  opts = opts || {};
  const align = opts.align || 'center';
  const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
  const jc = justifyMap[align] || 'center';
  const submitLabel = (typeof L === 'function') ? L('kc.submit') : 'Submit';
  if (opts.editable) {
    return `<div class="kc-footer" style="display:flex; justify-content:${jc}; margin-top:12px;">
      <button class="btn btn-primary btn-sm" disabled>${submitLabel}</button>
    </div>`;
  }
  return `<div class="kc-footer" style="display:flex; justify-content:${jc}; margin-top:12px;">
    <button class="btn btn-primary btn-sm lp-kc-submit"
      data-kc-key="${opts.key || ''}"
      data-kc-type="${opts.kcType || ''}"
      ${opts.disabled ? 'disabled' : ''}>${submitLabel}</button>
  </div>`;
}

// ── Multiple Choice ──────────────────────────────────────────────────────────

function kcSharedMC(d, ds, opts) {
  opts = opts || {};
  const options = normalizeKcOptions(d);
  const questionHtml = _kcHeading(d.question || (typeof L === 'function' ? L('kc.question_mc') : 'Which of the following is correct?'), { field: 'kcQuestion', placeholder: 'Enter your question…', editable: opts.editable, asLegend: !opts.editable });

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
    const _lCorrect = (typeof L === 'function') ? L('kc.correct_label') : 'Correct';
    const _lWrong   = (typeof L === 'function') ? L('kc.wrong_label')   : 'Wrong';
    return `<label class="${cls}">
      <input type="radio" name="kc-${opts.key}" data-kc-key="${opts.key}" data-i="${i}"
        ${st.selected ? 'checked' : ''} ${st.disabled ? 'disabled' : ''} />
      <span class="kc-choice-indicator" aria-hidden="true"></span>
      ${textHtml}
      ${st.correct ? `<span class="kc-label-correct">✓ ${_lCorrect}</span>` : ''}
      ${st.wrong   ? `<span class="kc-label-wrong">✕ ${_lWrong}</span>`   : ''}
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
  const questionHtml = _kcHeading(d.question || (typeof L === 'function' ? L('kc.question_mr') : 'Select all that apply.'), { field: 'kcQuestion', placeholder: 'Enter your question…', editable: opts.editable, asLegend: !opts.editable });

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
    const _lCorrectMR = (typeof L === 'function') ? L('kc.correct_label') : 'Correct';
    const _lWrongMR   = (typeof L === 'function') ? L('kc.wrong_label')   : 'Wrong';
    return `<label class="${cls}">
      <input type="checkbox" data-kc-key="${opts.key}" data-i="${i}"
        ${st.selected ? 'checked' : ''} ${st.disabled ? 'disabled' : ''} />
      <span class="kc-choice-indicator kc-choice-check" aria-hidden="true"></span>
      ${textHtml}
      ${st.correct ? `<span class="kc-label-correct">✓ ${_lCorrectMR}</span>` : ''}
      ${st.wrong   ? `<span class="kc-label-wrong">✕ ${_lWrongMR}</span>`   : ''}
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

  const instruction = (d.instruction !== undefined && d.instruction !== null)
    ? d.instruction
    : kcDefaultInstruction('kc_matching');

  return `
    ${_kcHeading(instruction, { field: 'kcInstruction', placeholder: 'Enter instruction text…', editable: opts.editable })}
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      <div class="flex-col gap-8">${leftHtml}</div>
      <div class="flex-col gap-8">${rightHtml}</div>
    </div>`;
}

// ── Ordering ─────────────────────────────────────────────────────────────────

function kcSharedOrdering(d, ds, opts) {
  opts = opts || {};
  const items = normalizeKcItems(d);

  const instruction = (d.instruction !== undefined && d.instruction !== null)
    ? d.instruction
    : kcDefaultInstruction('kc_ordering');

  if (opts.editable) {
    return `
      ${_kcHeading(instruction, { field: 'kcInstruction', placeholder: 'Enter instruction text…', editable: true })}
      <div class="flex-col gap-8">
        ${items.map((item, i) => `
          <div class="kc-order-item">
            <span class="kc-order-num" aria-label="${typeof L === 'function' ? L('a11y.position', {n: i+1}) : 'Position ' + (i+1)}">${i + 1}</span>
            ${_kcEditableText(item, 'kcItem', i, 'Step…')}
            <button class="btn-icon" disabled aria-label="${typeof L === 'function' ? L('a11y.move_up') : 'Move up'}" style="opacity:0.35;">↑</button>
            <button class="btn-icon" disabled aria-label="${typeof L === 'function' ? L('a11y.move_down') : 'Move down'}" style="opacity:0.35;">↓</button>
          </div>`).join('')}
      </div>`;
  }

  const order = opts.order || items.map((_, i) => i);
  const reveal = opts.reveal || false;
  const submitted = opts.submitted || false;

  return `
    ${_kcHeading(instruction, { field: 'kcInstruction' })}
    <div class="flex-col gap-8">
      ${order.map((itemIdx, pos) => {
        const inCorrectPos = reveal && itemIdx === pos;
        const inWrongPos   = reveal && itemIdx !== pos;
        return `
        <div class="kc-order-item${inCorrectPos ? ' correct' : ''}${inWrongPos ? ' wrong' : ''}">
          <span class="kc-order-num" aria-label="${typeof L === 'function' ? L('a11y.position', {n: pos+1}) : 'Position ' + (pos+1)}">${pos + 1}</span>
          <span style="flex:1;">${escapeHtml(items[itemIdx])}</span>
          ${!submitted ? `
            <button class="btn-icon lp-order-up" data-kc-key="${opts.key}" data-block-index="${opts.blockIndex}" data-i="${pos}"
              ${pos === 0 ? 'disabled' : ''} aria-label="${typeof L === 'function' ? L('a11y.move_up') : 'Move up'}">↑</button>
            <button class="btn-icon lp-order-down" data-kc-key="${opts.key}" data-block-index="${opts.blockIndex}" data-i="${pos}"
              ${pos === order.length - 1 ? 'disabled' : ''} aria-label="${typeof L === 'function' ? L('a11y.move_down') : 'Move down'}">↓</button>
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

  const instruction = (d.instruction !== undefined && d.instruction !== null)
    ? d.instruction
    : kcDefaultInstruction('kc_fill_gap');

  if (opts.editable) {
    return `
      ${_kcHeading(instruction, { field: 'kcInstruction', placeholder: 'Enter instruction text…', editable: true })}
      <div class="editable-text kc-question" data-field="kcGapText" data-richtext="true"
        contenteditable="true" spellcheck="false"
        data-placeholder="Enter the sentence with ____ marking the gap…"
        style="outline:none; margin-top:8px;"
      >${richTextOut(d.text || '')}</div>
      <input class="kc-fill-input" disabled placeholder="${typeof L === 'function' ? L('kc.fill_placeholder') : 'Type your answer…'}" style="margin-top:12px;" />`;
  }

  const text = d.text || 'Complete this sentence: ____.';
  const submitted = opts.submitted || false;
  const ans = opts.ans || {};
  const reveal = opts.reveal || false;
  const instructionHtml = instruction ? _kcHeading(instruction, { field: 'kcInstruction' }) : '';

  const revealHtml = (() => {
    if (!reveal || ans.lastCorrect !== false) return '';
    const firstAccepted = (Array.isArray(d.answers) && d.answers[0])
      ? d.answers[0]
      : (d.answer || '').split('|')[0].trim();
    return firstAccepted ? `<div class="text-xs text-muted mt-4">${typeof L === 'function' ? L('kc.accepted_answer', {answer: escapeHtml(firstAccepted)}) : 'Accepted answer: ' + escapeHtml(firstAccepted)}</div>` : '';
  })();

  return `
    ${instructionHtml}
    <p class="kc-question" style="margin-top:${instruction ? '8px' : '0'};">${richTextOut(text)}</p>
    <input class="kc-fill-input lp-kc-fillgap-input" data-kc-key="${opts.key}"
      placeholder="${typeof L === 'function' ? L('kc.fill_placeholder') : 'Type your answer…'}"
      value="${(ans.response || '').replace(/"/g, '&quot;')}"
      ${submitted ? 'disabled' : ''} />
    ${revealHtml}`;
}
