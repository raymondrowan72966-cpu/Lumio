# Lumio Complete Block Authoring Model

Status: **Architecture proposal — not yet implemented.** Extends the prior
"Block Capability Design" proposal (Content / Design / Behaviour) with four
additional dimensions: **Accessibility, AI, Analytics, Media**.

Goal: feature parity with Articulate Rise's block library, while keeping
Lumio's authoring model simpler — one schema, one capability-map pattern,
no per-block one-offs.

---

## 1. Principles

1. Every block is `{ id, type, content, design, behaviour, accessibility, ai, analytics, media, meta }` — same seven capability keys on every block, always.
2. A block "supports" a capability by **declaring it in a per-type capability map** (`*_CAPABILITIES[type]`). The renderer/inspector reads the map, not the block type, so adding a capability to a block = editing one map entry, not writing new UI.
3. Capabilities are **inherited from a block's family**, then overridden per type only where it genuinely differs. This keeps the spec finite and keeps "every block type" coverage honest without 45 bespoke write-ups.
4. Families used throughout this doc (extends the Document/Callout/Interactive categories from the styling audit):

| Family | Block types |
|---|---|
| **Text** | `paragraph`, `heading`, `heading_paragraph`, `columns`, `table`, `list_numbered`, `list_checkbox`, `list_bullet`, `quote1-4`, `continue`, `numbered_divider`, `line_divider` |
| **Media** | `image`, `image_text`, `text_on_image`, `carousel`, `column_grid`, `quote_image`, `quote_carousel`, `video`, `audio`, `file` |
| **Callout** | `stmt_info`, `stmt_tip`, `stmt_success`, `stmt_warning`, `stmt_error`, `stmt_note` |
| **Interactive — Containers** | `accordion`, `tabs`, `process`, `labelled_graphic` |
| **Interactive — Flashcards** | `flashcard_grid`, `flashcard_stack` |
| **Interactive — Scenario** | `scenario` |
| **Assessment (Knowledge Checks)** | `kc_multiple_choice`, `kc_multiple_response`, `kc_matching`, `kc_fill_gap`, `kc_ordering` |
| **Data/Chart** | `chart_bar`, `chart_line`, `chart_pie` |
| **Action** | `button` |

---

## 2. The Seven Capability Dimensions — Shared Schemas

### 2.1 Content (recap)
Per-type, built from shared primitives: `RichText`, `MediaRef`, `Hotspot`, `ChoiceOption`, `Step`, `CardFace` (see prior proposal §2). Unchanged by this expansion.

### 2.2 Design (recap)
```js
design: {
  typography: { fontSize, fontColor, bold, italic, underline, align },
  spacing:    { paddingTop, paddingBottom },
  width:      'narrow' | 'standard' | 'wide' | 'full',
  background: { type: 'transparent'|'theme'|'color'|'image', color?, image?, fit? },
  border:     { on: boolean, color, width, radius },
}
```
Gated by `DESIGN_CAPABILITIES[type]`. Unchanged by this expansion.

### 2.3 Behaviour (recap)
```js
behaviour: {
  click, toggle, flip, media, reveal, navigation, assessment, branching
}
```
Gated by `BEHAVIOUR_CAPABILITIES[type]`. Unchanged by this expansion.

### 2.4 Accessibility — NEW

```js
accessibility: {
  altText: string|null,            // images, hotspot icons, chart summaries
  ariaLabel: string|null,           // overrides default landmark label
  headingLevel: 1|2|3|4|null,       // heading/heading_paragraph only — drives <h1>-<h4> + outline
  decorative: boolean,              // marks media as aria-hidden (e.g. divider glyphs)
  captions: MediaRef|null,          // video — caption track
  transcript: RichText|null,        // video/audio
  audioDescription: MediaRef|null,  // video, optional
  keyboardInstructions: string|null,// auto-generated, editable — e.g. "Use arrow keys to flip card"
  contrastCheck: 'pass'|'warn'|'fail', // COMPUTED at render/save time from design.background + typography.fontColor, not authored
  reducedMotionFallback: 'static-image'|'first-frame'|'none', // for flip/carousel/autoplay blocks
}
```

Behaviour:
- `altText`/`captions`/`transcript` fields are **content-adjacent** (stored under `accessibility` so they're optional and don't pollute `content`, but editable in the same inline-canvas flow as content).
- `contrastCheck` is never authored — it's computed whenever `design.background`/`design.typography.fontColor` change, and surfaces as an inspector warning badge. This is the mechanism that lets Lumio guarantee WCAG AA without per-block validation code.
- `headingLevel` doubles as the **navigation/anchor** mechanism requested for Heading blocks (Articulate Rise has no real equivalent — this is a Lumio differentiator for in-course navigation/TOC).

### 2.5 AI — NEW

```js
ai: {
  generationSource: 'manual'|'ai-draft'|'ai-refined',
  assistActions: string[],          // which AI actions this block exposes in its toolbar
  promptContext: string|null,       // hidden context appended to AI prompts for this block (e.g. course tone, reading level)
  reviewStatus: 'unreviewed'|'approved'|'flagged',
  altTextSuggestion: string|null,   // AI-suggested alt text awaiting approval (media blocks)
}
```

Shared `assistActions` vocabulary (gated per type via `AI_CAPABILITIES[type]`):

| Action | Applies to |
|---|---|
| `rewrite` / `simplify` / `expand` / `tone-adjust` / `translate` | any block with `RichText` content |
| `summarize` | long-form: paragraph, accordion/tab panes, process steps |
| `generate-image` | image, image_text, text_on_image, gallery, flashcards, labelled graphic, quote_image |
| `generate-question` | all 5 KC types, scenario |
| `generate-alt-text` | image, video poster, labelled graphic, charts |
| `generate-feedback` | KC types, scenario (writes `content.feedback`) |
| `suggest-branching` | scenario |

This is the concrete mechanism for requirement #5 ("future AI capabilities accommodated without redesigning") — a new AI feature is a new entry in this vocabulary + a row in `AI_CAPABILITIES`, never a new schema.

### 2.6 Analytics — NEW

```js
analytics: {
  trackView: boolean,           // impression fired when block scrolls into view
  trackInteraction: boolean,    // click/flip/expand/etc. fired via behaviour runtime
  trackCompletion: boolean,     // block marked "done" (read, watched, answered)
  trackTimeSpent: boolean,      // dwell time
  customEventId: string|null,   // for future xAPI/SCORM-style event naming
  scoring: { weight: number, included: boolean } | null, // assessment blocks only
}
```

Gated by `ANALYTICS_CAPABILITIES[type]`. Crucially, this dimension is **populated automatically** by the behaviour runtime (`runBlockBehaviour` from the prior proposal) — every `toggle`/`flip`/`reveal`/`media`/`assessment` event the runtime already handles also emits the corresponding analytics event when the relevant `trackX` flag is true. No block-specific analytics code is ever written.

### 2.7 Media — NEW

This is the **handling/infrastructure** layer for any `MediaRef` referenced from `content` (distinct from the content data itself):

```js
media: {
  refs: MediaRef[],                  // all MediaRef instances used by this block's content
  uploadConstraints: { maxSizeMB, allowedMimeTypes: string[] },
  storage: 'r2',
  cdn: true,
  responsiveVariants: { thumb: true, full: true, retina: true }, // auto-generated on upload
  aiGeneration: { enabled: boolean, lastPrompt: string|null },
}
```

Gated by `MEDIA_CAPABILITIES[type]` — effectively "does this block have any `MediaRef` fields, and what are the constraints." This is the layer that guarantees requirement #3 ("uploaded media must persist correctly") by routing every upload through one R2-backed pipeline regardless of block type.

---

## 3. Baseline Capability Profiles (per family)

Each block type = **family baseline** below, plus the **per-block exceptions** in §4. This is how "every block type" is fully specified without 45 redundant tables.

| Family | Design | Behaviour | Accessibility | AI | Analytics | Media |
|---|---|---|---|---|---|---|
| **Text** | typography, spacing, width (border/background mostly off — Document rules) | `click` optional (headings: scroll-to-anchor) | `headingLevel` (headings), `contrastCheck` | `rewrite/simplify/expand/translate/tone-adjust/summarize` | `trackView`, `trackTimeSpent` | none (table may embed images in future — out of scope v1) |
| **Media** | typography (captions only), spacing, width, border (image crop/radius), background n/a | `click` (lightbox/zoom), `media` (video/audio), `reveal` (carousel) | `altText`, `captions`, `transcript`, `decorative`, `contrastCheck` | `generate-image`, `generate-alt-text`, `rewrite` (captions) | `trackView`, `trackInteraction`, `trackTimeSpent` (video/audio) | full `MediaRef` pipeline |
| **Callout** | typography, spacing, width, background (tint), border (accent bar) | `click` (dismiss, if dismissible) | `ariaLabel` (announces type: "Warning:"), `contrastCheck` | `rewrite/simplify/tone-adjust/translate` | `trackView` | none |
| **Interactive — Containers** | typography, spacing, width, background, border (cards permitted) | `toggle` (accordion/tabs), `reveal`+hotspot click/hover (labelled graphic), `navigation` (process) | `keyboardInstructions`, `reducedMotionFallback`, `contrastCheck` | `rewrite/simplify/summarize/expand`, `generate-image` (labelled graphic) | `trackInteraction`, `trackCompletion`, `trackTimeSpent` | `MediaRef` pipeline (labelled graphic image, process step images) |
| **Interactive — Flashcards** | typography, spacing, width, background, border | `flip`, `reveal` (grid progress) | `keyboardInstructions`, `reducedMotionFallback`, `altText` (card images) | `rewrite`, `generate-image`, `simplify` | `trackInteraction`, `trackCompletion` | `MediaRef` pipeline |
| **Interactive — Scenario** | typography, spacing, width, background, border | `click`, `branching`, `reveal` (feedback) | `keyboardInstructions`, `contrastCheck` | `rewrite/simplify/tone-adjust`, `generate-question`, `generate-feedback`, `suggest-branching` | `trackInteraction`, `trackCompletion`, `scoring` | none (v1) |
| **Assessment (KC)** | typography, spacing, width, background, border | `assessment` (full: feedbackTiming/retries/scoring/passFail), `click` | `keyboardInstructions`, `ariaLabel` (question/option roles), `contrastCheck` | `rewrite/simplify/translate`, `generate-question`, `generate-feedback` | `trackInteraction`, `trackCompletion`, `scoring` | `MediaRef` only if question/option includes image (future) |
| **Data/Chart** | typography (labels), spacing, width, background n/a, border n/a | `click` (drill-down — future) | `altText` (data summary, AI-generatable), `contrastCheck` | `generate-alt-text`, `rewrite` (labels) | `trackView` | none |
| **Action** | typography, spacing, width, background, border | `click` (link/scroll-to/reveal) | `ariaLabel`, `contrastCheck` | `rewrite` (label) | `trackInteraction` | none |

---

## 4. Per-Block-Type Exceptions / Additions

Only deltas from the family baseline above. If a block type isn't listed, it uses the family baseline unchanged.

| Block type | Family | Exceptions / additions |
|---|---|---|
| `heading`, `heading_paragraph` | Text | **Accessibility**: `headingLevel` required (H1-H4 selector in inspector); generates anchor id for course-level navigation/TOC (Rise parity: Rise doesn't expose this — Lumio differentiator). |
| `paragraph` | Text | **Content** adds inline hyperlink support (already scoped in prior proposal's `RichText`). |
| `columns`, `table` | Text | **Design**: `width` defaults to `wide`/`full` more often than other Text blocks; `table` also gets a `border` toggle for row/column rules (off by default per styling audit). |
| `list_numbered`/`checkbox`/`bullet` | Text | `list_checkbox` additionally gets **Behaviour**: `click` → toggles checked state, **Analytics**: `trackInteraction` (used as a lightweight "self-check" pattern). |
| `continue`, `numbered_divider`, `line_divider` | Text | **Behaviour**: `reveal` (continue divider gates content below it — this is Lumio's existing "Continue" gating). **AI**: none (no text content). **Accessibility**: `decorative: true` by default for `line_divider`. |
| `quote1`-`quote4` | Text | No exceptions. |
| `image` | Media | **Behaviour** `click.action` defaults to `lightbox`; **Design** `border.radius` = crop/rounded-corner control. |
| `image_text` | Media | Adds **Design**: layout control (`imageLeft`/`imageRight`, ratio slider) — this is a block-specific design field layered on top of the shared `width`. |
| `text_on_image` | Media | **Accessibility**: `contrastCheck` is critical here (text-over-image) — inspector surfaces a stronger warning + suggests an overlay scrim. |
| `carousel`, `column_grid` | Media | **Behaviour**: `reveal` = slideshow autoplay/interval (carousel), `media.loop`. **Design**: layout mode (`grid`/`carousel`/`masonry` — Rise parity for Gallery). |
| `quote_image` | Media | Same as `quote*` content + `image` media capabilities combined. |
| `quote_carousel` | Media | `carousel` behaviour applied to quote cards; internal tiles restyled per styling-audit recommendation (no pastel fills). |
| `video` | Media | **Behaviour.media** full set (`autoplay`, `loop`, `controls`, `startTime`, `endTime`); **Content** supports upload + YouTube/Vimeo URL; **Accessibility** `captions`/`transcript`/`audioDescription` all active. |
| `audio` | Media | **Design**: `compact`/`full player` toggle (block-specific design field). **Behaviour.media**: `autoplay`, `download` flag. **Accessibility**: `transcript`. |
| `file` | Media | **Design**: `minimal`/`card` toggle. **Behaviour**: `click.action` = `download`/`preview`/`open-new-tab`. **Accessibility**: `ariaLabel` includes file type + size (auto-generated). **Media**: `uploadConstraints.allowedMimeTypes` = pdf/docx/xlsx/pptx. |
| `stmt_*` (all 6) | Callout | **Design.background** maps to the per-type tint defined in `STATEMENT_DEFAULTS` (icon colour drives accent bar — continuation of styling audit). **Behaviour**: `click` → `dismissible` (optional, off by default). |
| `accordion` | Interactive-Container | **Behaviour.toggle**: `single-open`/`multi-open` + `defaultOpenIds` + "expand all/collapse all" actions (toolbar-level, not per-item). |
| `tabs` | Interactive-Container | **Design**: orientation (`horizontal`/`vertical` — Rise parity). **Behaviour.toggle**: `defaultSelectedId`. |
| `process` | Interactive-Container | **Design**: layout (`horizontal`/`vertical`/`timeline`). **Behaviour.navigation**: `sequential`/`free`. **Content**: each step has optional `image: MediaRef`. |
| `labelled_graphic` | Interactive-Container | **Content**: `hotspots: Hotspot[]`. **Design**: icon style + numbering style (block-specific). **Behaviour.reveal**: `click`/`hover` per hotspot. **Accessibility**: each hotspot needs its own `altText`/`ariaLabel` — hotspot-level accessibility, not block-level. |
| `flashcard_grid`/`flashcard_stack` | Interactive-Flashcards | **Design**: column count (grid: 2/3/4), card size/theme. **Behaviour**: `flip.animation`, `shuffle` (stack), **Analytics**: `trackCompletion` = "all cards flipped." |
| `scenario` | Interactive-Scenario | **Content.branches** maps choice → next block/scene. **Behaviour.branching.map**; **Design**: `card`/`list` choice layout. |
| `kc_multiple_choice`/`kc_multiple_response` | Assessment | Standard `assessment` behaviour; `content.options[].isCorrect`. |
| `kc_matching` | Assessment | **Content.pairs**; **Design**: two-column layout is fixed (not a generic width control). |
| `kc_fill_gap` | Assessment | **Content.blanks** (token + accepted answers); **AI** `generate-question` produces blanks from a source paragraph. |
| `kc_ordering` | Assessment | **Content.correctOrder**; **Behaviour**: drag-to-reorder is the primary interaction (distinct `click`-less interaction — flagged as its own behaviour sub-type `reorder`). |
| `chart_bar`/`chart_line`/`chart_pie` | Data/Chart | **Content**: series/labels data. **AI**: `generate-alt-text` produces a textual data summary (critical since charts are otherwise inaccessible). |
| `button` | Action | **Behaviour.click.action**: `link`/`scroll-to`/`reveal`/`open-modal`. Per styling audit, rendered with Document (cardless) wrapper despite being in the "Interactive" library category. |

---

## 5. Articulate Rise Parity Check

| Rise capability | Lumio coverage |
|---|---|
| Multi-column text, dividers | ✅ Text family |
| Image/Gallery with lightbox, masonry | ✅ Media family (`carousel`/`column_grid` layout modes) |
| Video (upload + embed), audio (compact/full) | ✅ Media family |
| Knowledge checks (5 types) w/ feedback & scoring | ✅ Assessment family via shared `AssessmentEngine` |
| Accordion/Tabs/Process/Labelled graphic/Flashcards/Scenario | ✅ Interactive families |
| Callout/statement blocks with icon+colour | ✅ Callout family |
| Accessibility (alt text, captions, contrast) | ✅ — and **stronger** than Rise via computed `contrastCheck` and AI-assisted alt text |
| Analytics/completion tracking | ✅ — Rise has limited xAPI; Lumio's `analytics` schema + behaviour-runtime auto-emission is a differentiator |
| AI authoring assistance | ✅ — not present in Rise; Lumio's `ai` schema + `assistActions` vocabulary is the core differentiator |
| In-course navigation/anchors from headings | ✅ — Lumio-only (via `accessibility.headingLevel` + anchor ids) |

No Rise-equivalent capability is missing from this model; the four new dimensions (Accessibility/AI/Analytics/Media) push several areas (alt text automation, analytics, AI assist) **beyond** Rise parity while reusing the same per-type capability-map pattern — no new architecture is needed to exceed parity, only additional entries in existing maps.

---

## 6. Capability Map Implementation Pattern

Extends the Phase-1 capability maps from the prior proposal with four siblings:

```js
DESIGN_CAPABILITIES[type]        // existing
BEHAVIOUR_CAPABILITIES[type]     // existing
ACCESSIBILITY_CAPABILITIES[type] // new — which a11y fields the inspector shows
AI_CAPABILITIES[type]            // new — which assistActions appear in the block toolbar
ANALYTICS_CAPABILITIES[type]     // new — which trackX flags default on, and whether `scoring` applies
MEDIA_CAPABILITIES[type]         // new — which content fields are MediaRef, upload constraints
```

Each is a flat per-type lookup (one row per block type, ~45 rows, mostly inherited via a small `FAMILY_OF[type]` map + family-default spreads with per-type overrides — directly mirroring §3/§4 of this document). No renderer, inspector panel, or behaviour handler ever switches on `block.type` directly for these dimensions — they all read the relevant capability map.

---

## 7. Implementation Plan (still no code — for review)

Building on the prior proposal's phasing:

1. **Phase 1 (schema + capability maps)** — as previously scoped, now also stub `accessibility`, `ai`, `analytics`, `media` keys on the unified schema (empty/defaults) and the four new capability maps (`FAMILY_OF`, family-default tables, per-type overrides from §3/§4).
2. **Phase 2 (design system)** — unchanged from prior proposal.
3. **Phase 3 (behaviour runtime)** — extend `runBlockBehaviour` to also emit `analytics` events per `ANALYTICS_CAPABILITIES`, and to compute `accessibility.contrastCheck` on design changes.
4. **Phase 4 (content primitives)** — unchanged; `<MediaPicker>` additionally writes to `media.refs` and surfaces `ai.altTextSuggestion`.
5. **Phase 5 (AI assist toolbar)** — new: a generic block-toolbar menu driven by `AI_CAPABILITIES[type]`, calling a single `runAiAssist(action, block)` dispatcher (stubbed initially, real model calls later — no architecture change when AI backend lands).
6. **Phase 6 (accessibility pass)** — inspector "Accessibility" tab driven by `ACCESSIBILITY_CAPABILITIES[type]`; automated `contrastCheck` badge.
7. **Phase 7 (Learner Preview + analytics sink)** — Learner Preview consumes `analytics`-emitting behaviour runtime; events logged to a stub analytics sink (console/local store v1, real backend later).

**Estimated files** (additions to prior estimate):
- `js/blocks/capabilities.js` (new) — all six capability maps + `FAMILY_OF`
- `js/blocks/accessibility.js` (new) — `contrastCheck` computation, a11y panel renderer
- `js/blocks/aiAssist.js` (new) — `assistActions` vocabulary + `runAiAssist` dispatcher (stub)
- `js/blocks/analytics.js` (new) — event emission helpers
- `js/screens/lessonBuilder.js` — inspector gains Accessibility tab + AI toolbar menu
- `js/screens/learnerPreview.js` — analytics event sink wiring
- `Lumio Prototype/docs/block-authoring-model.md` — this document, kept as the living spec

---

No implementation has begun. This document is the spec to review/approve before Phase 1 work starts.
