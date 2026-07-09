# Lumio Translation Engine

**Status:** Implemented (Sprint: Translation Engine — Phase 2: Coverage, Label Engine & Persistence Audit)  
**Last updated:** 2026-07-09

---

## 1. Purpose

The Translation Engine is the single source of truth for all multilingual operations in Lumio. No feature performs translation independently — all export, import, validation, and apply operations pass through `TranslationEngine`.

---

## 2. Architecture Overview

```
Course State (LumioState)
        │
        ▼
  LabelEngine.setActivePack(course)          ← Phase 2: set UI string language
        │  reads course.labelSet → sets _active pack
        │
        ▼
  TranslationEngine.extract(course)
        │  returns FileGroup[]  (incl. learnerOutcomes — Phase 2)
        ▼
  TranslationEngine.generateXliff(course, opts)
        │  returns XLIFF 1.2 XML string
        ▼
  [CAT Tool / Human Translator / AI Adapter]
        │  returns translated XLIFF file
        ▼
  TranslationEngine.parseXliff(xliffStr)
        │  returns { ok, files: Map<fileId, Map<unitId, string>> }
        ▼
  TranslationEngine.validateImport(course, parsed)
        │  returns ValidationReport
        ▼
  TranslationEngine.applyTranslation(course, parsed)
        │  mutates course + LumioState.lessons blocks in place
        │  preserves string type for list block items (Phase 2 D1 fix)
        ▼
  scheduleLumioSave()  →  D1 persistence
```

### Phase 2 additions at a glance

| Area | What changed |
|---|---|
| **Label Engine** | New `labelEngine.js` — owns all learner-visible UI strings |
| **`learnerOutcomes`** | Now extracted and applied as first-class translatable strings |
| **D1 persistence fix** | List block items keep their original string type after `applyTranslation` |
| **Builder UI** | Translation modal gains a Label Sets section |
| **`course.labelSet`** | Per-course label pack selection persisted with workspace |

---

## 3. Public API

### `TranslationEngine.extract(course)`
Traverses the course and all its lessons, extracting every translatable string.  
Returns `FileGroup[]` — one group per lesson (plus one for course-level metadata).

```js
FileGroup {
  fileId: string,   // 'course' | lessonId
  title:  string,   // human-readable label
  units:  TransUnit[]
}

TransUnit {
  id:       string,   // stable trans-unit ID (pipe-delimited path)
  text:     string,   // raw value from block.data
  richText: boolean   // true if value may contain HTML formatting
}
```

### `TranslationEngine.generateXliff(course, opts)`
Produces a complete XLIFF 1.2 document for the course.

```js
opts = {
  sourceLocale: 'en-us',   // BCP-47 code; default: derived from course.language
  targetLocale: 'fr-fr',   // optional
  preserveHtml: true        // wrap rich text in <g> inline markup (default: true)
}
```

Returns an XML string. Download via `TranslationEngine.downloadXliff(str, filename)`.

### `TranslationEngine.parseXliff(xliffStr)`
Parses an XLIFF 1.2 string. Returns:

```js
{
  ok:           boolean,
  files:        Map<fileId, Map<unitId, string>>,
  sourceLocale: string,
  targetLocale: string,
  errors:       string[]
}
```

### `TranslationEngine.validateImport(course, parsed)`
Validates parsed XLIFF against the current course state. Returns:

```js
{
  total:        number,   // trans-units in the XLIFF
  matched:      number,   // IDs found in both XLIFF and course
  missing:      number,   // IDs in course but not in XLIFF
  unknown:      number,   // IDs in XLIFF not recognised in course
  duplicates:   number,   // duplicate trans-unit IDs
  malformedHtml: number,  // units with broken HTML reconstruction
  missingIds:   string[], // sample of missing IDs (up to 20)
  unknownIds:   string[], // sample of unknown IDs (up to 20)
  ready:        boolean   // true if safe to apply
}
```

### `TranslationEngine.applyTranslation(course, parsed)`
Merges translated strings from parsed XLIFF back into `course` and `LumioState.lessons` blocks in place (Phase 1 — in-place mutation; see Phase 2 below).  
Returns `{ applied: number, skipped: number }`.

---

## 4. XLIFF Format (1.2)

The engine produces XLIFF 1.2 compatible with all major CAT tools (Trados, memoQ, Phrase, OmegaT, Crowdin, Lokalise, Weblate, etc.).

### Document structure

```xml
<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"
  xmlns="urn:oasis:names:tc:xliff:document:1.2"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <file original="course" source-language="en-us" datatype="plaintext">
    <body>
      <trans-unit id="course|title"><source>My Course</source></trans-unit>
    </body>
  </file>
  <file original="{lessonId}" source-language="en-us" target-language="fr-fr" datatype="plaintext">
    <body>
      <trans-unit id="title"><source>Lesson Name</source></trans-unit>
      <trans-unit id="{blockId}|heading"><source>...</source></trans-unit>
    </body>
  </file>
</xliff>
```

- One `<file original="course">` for course-level strings (title, description, objectives).
- One `<file original="{lessonId}">` per lesson/assessment.
- The `<file original>` attribute carries the lesson ID as a stable reference.

### HTML preservation via `<g>` inline markup

Rich text fields are exported with HTML formatting preserved using XLIFF inline elements. This allows translators to see formatted text while CAT tools protect the markup from accidental modification.

```xml
<source><g id="g1" ctype="x-html-P"><g id="g2" ctype="x-html-STRONG">Bold text</g> and normal text.</g></source>
```

Supported ctypes:

| ctype | HTML element |
|---|---|
| `x-html-P` | `<p>` |
| `x-html-STRONG` | `<strong>` |
| `x-html-EM` | `<em>` |
| `x-html-U` | `<u>` |
| `x-html-SPAN` | `<span>` (with style) |
| `x-html-A` | `<a>` (href, rel, target as `xhtml:*` attributes) |
| `x-html-BR` | `<br>` (as `<x>` void element) |
| `x-html-TABLE` | `<table>` |
| `x-html-TR` / `x-html-TH` / `x-html-TD` | table structure |

---

## 5. Stable ID Architecture

Trans-unit IDs are pipe-delimited paths that never depend on element order.

### Course-level IDs
```
course|title
course|description
course|targetAudience
course|language
course|objectives|{n}|text
```

### Lesson-level IDs (within each `<file>`)
```
title                              ← lesson title

{blockId}|heading
{blockId}|body
{blockId}|text
{blockId}|author
{blockId}|caption
{blockId}|transcript
{blockId}|label
{blockId}|question
{blockId}|instruction

{blockId}|cols|{i}|text            ← columns block
{blockId}|rows|{r}-{c}|text        ← table block (row-col index)

{blockId}|items|{i}|title          ← accordion / tabs / process
{blockId}|items|{i}|body
{blockId}|items|{i}|text           ← list items, KC ordering
{blockId}|items|{i}|front          ← flashcards
{blockId}|items|{i}|back

{blockId}|quotes|{i}|text          ← quote carousel
{blockId}|quotes|{i}|author

{blockId}|hotspots|{i}|title       ← labelled graphic
{blockId}|hotspots|{i}|body

{blockId}|options|{i}|text         ← KC MC / MR options
{blockId}|options|{i}|feedback

{blockId}|left|{i}|text            ← KC matching
{blockId}|right|{i}|text

{blockId}|categories|{i}|text      ← KC matching cards
{blockId}|cards|{i}|text

{blockId}|chartItems|{i}|label     ← chart blocks

{blockId}|scenes|{si}|title        ← scenario
{blockId}|scenes|{si}|dialogue
{blockId}|scenes|{si}|characterName
{blockId}|scenes|{si}|choices|{ci}|text
{blockId}|scenes|{si}|choices|{ci}|feedback
```

### Course-level IDs (Phase 2 additions)
```
course|learnerOutcomes|{n}       ← plain string shown to learners on landing page
```

`learnerOutcomes` is a flat string array (`string[]`). It is distinct from `objectives` (`{verb, text}[]`), which is internal planning metadata. Both are now extracted and applied.

### Phase 1 limitation — positional indices

Array items (accordion panels, KC options, list items, flashcard pairs, etc.) currently use positional indices in their IDs. This means reordering items before re-importing will apply translations to the wrong positions.

**Mitigation:** export and import should be performed without reordering items in between.

**Phase 2 upgrade path:** add stable `id` fields to all array items (accordion panels, KC options, carousel slides, etc.) and switch from `items|{i}` to `items|id:{itemId}` in the IDs. The engine has `TODO(phase2-stable-ids)` markers at every affected extraction/apply site.

---

## 6. Block Coverage

All 48 block types across 9 families are covered:

| Family | Block types | Fields extracted |
|---|---|---|
| text | heading, heading_paragraph, paragraph, columns, table | heading, body, cols[i], rows[r][c] |
| callout | stmt_info/tip/success/warning/error/note | title, text |
| callout | quote1/2/3/4, quote_image, quote_carousel | text, author, caption |
| media | list_bullet/numbered/checkbox | heading, items[i].text |
| media | image, image_text, text_on_image | heading, body, caption, alt |
| media | carousel, column_grid | items[i].heading/body/caption |
| media | audio, video, file | caption, transcript |
| media | chart_bar, chart_line, chart_pie | title, xLabel, yLabel, items[i].label |
| interactive | accordion, tabs, process | items[i].title/body |
| interactive | labelled_graphic | hotspots[i].title/body |
| flashcards | flashcard_grid, flashcard_stack | items[i].front/back |
| scenario | scenario | scenes[i].title/dialogue/characterName, choices[j].text/feedback |
| assessment | kc_multiple_choice, kc_multiple_response | question, options[i].text/feedback |
| assessment | kc_matching | instruction, left[i], right[i] |
| assessment | kc_fill_gap | instruction, text |
| assessment | kc_ordering | instruction, items[i].text |
| assessment | kc_matching_cards | instruction, categories[i], cards[i].text |
| action | button, continue, numbered_divider | label |

---

## 7. UI

The Translation Modal is accessible from the Course Landing page toolbar (between **Settings** and **Publish**).

**Translate button:** `<button id="course-translate">🌐 Translate</button>`

**Modal sections:**

1. **Export** — language selectors (source and target), preserve HTML checkbox, Export XLIFF button.
2. **Import** — drag-and-drop zone + Select File button, Validate button, validation stats, Apply button (enabled only when `ready: true`).
3. **Label Sets** *(Phase 2)* — select the active label pack for a course, export/import label XLIFF, create custom label packs. See §7a below.
4. **AI Translation** — reserved space, disabled, "Coming soon" badge.

### 7a. Label Sets UI (Phase 2)

The Label Sets section is rendered inside the Translation Modal. Controls:

| Control | Action |
|---|---|
| `<select id="tm-label-set">` | Pick a label pack — built-in (`en`, `es`, `fr`, `de`) or custom |
| **Apply Label Set** | Saves `course.labelSet` and schedules a workspace save |
| **Export Labels XLIFF** | Calls `LabelEngine.downloadXliff(packId)` — downloads the pack as XLIFF 1.2 |
| **New Custom Pack** | Prompts for a name, calls `LabelEngine.createCustomPack(name, 'en')` |
| **Import Labels XLIFF** | File input → `LabelEngine.importXliff(packId, xliffStr)` |

Label packs are stored in `LumioState.labelPacks` and persisted with the workspace save (D1 + R2).

---

---

## 8. Label Engine (Phase 2)

`LabelEngine` (`js/labelEngine.js`) is a separate module that owns all learner-visible UI strings — navigation labels, sidebar headings, KC feedback messages, etc. It is **not** part of `TranslationEngine`; the two engines are complementary:

| Engine | What it translates |
|---|---|
| `TranslationEngine` | Course *content* — block text, lesson titles, learning objectives |
| `LabelEngine` | UI *chrome* — button labels, feedback strings, accessibility text |

### Global `L()` function

A module-level shim is declared in `labelEngine.js`:

```js
function L(key, vars) { return LabelEngine.L(key, vars); }
```

This makes label lookups available everywhere in the learner context without passing the course object through every call chain. `kcComponents.js` and `learnerPreview.js` both call `L()` directly.

### Activation

At the learner shell entry point (`learnerShell()` / `learnerShellProduction()`):

```js
LabelEngine.setActivePack(course);
```

This reads `course.labelSet` (e.g. `'en'`, `'es'`, `'custom_abc123'`) and sets the active pack. All subsequent `L()` calls use that pack until the next call to `setActivePack`.

### Built-in language packs

Four packs ship with the engine: `en`, `es`, `fr`, `de`. These are immutable — they cannot be deleted or overwritten.

### Label hierarchy (resolution order)

1. Active custom pack override (if the key exists)
2. Built-in pack for `course.labelSet`
3. English (`en`) fallback
4. Raw key string (last resort — never shown to learners in practice)

### Key reference

| Namespace | Keys |
|---|---|
| `nav.*` | `start_course`, `continue_course`, `restart_course`, `next`, `previous`, `take_assessment`, `finish_course`, `next_assessment` |
| `sidebar.*` | `progress`, `lessons`, `assessments`, `quiz` |
| `kc.*` | `submit`, `try_again`, `replay`, `correct_prefix`, `not_quite_prefix`, `response_recorded`, `correct_feedback`, `incorrect_feedback`, `score` (supports `{n}` / `{total}` vars), `correct_label`, `wrong_label` |
| `carousel.*` | `prev`, `next`, `prev_slide`, `next_slide`, `indicators` |
| `a11y.*` | `open_nav`, `position` (supports `{n}` var), `move_up`, `move_down` |

### Template variables

```js
L('kc.score', { n: 3, total: 5 })  // → "3 / 5 Correct"
L('a11y.position', { n: 2 })       // → "Position 2"
```

### Custom label packs

```js
const id = LabelEngine.createCustomPack('My Brand', 'en'); // base from 'en'
LabelEngine.updateCustomPack(id, { 'nav.next': 'Weiter →' });
LabelEngine.downloadXliff(id);   // export for translator
LabelEngine.importXliff(id, xliffStr);  // import translated file
LabelEngine.deleteCustomPack(id);
```

Custom packs live in `LumioState.labelPacks` and are saved with the workspace.

---

## 9. D1 Persistence — List Block Fix (Phase 2)

### Bug

After calling `applyTranslation()`, saving to D1 failed with `"Could not save to cloud — Check your connection"`. The root cause was in `_applyBlock` for `list_bullet`, `list_numbered`, and `list_checkbox`:

```js
// Phase 1 — bug: converts string item to object, breaks D1 schema
if (typeof d.items[i] === 'string') d.items[i] = { text: unitMap.get(id) };
```

Some courses store list items as plain strings (`["Item A", "Item B"]`). After apply, those strings became objects (`[{text: "Item A"}, {text: "Item B"}]`). The D1 schema validation rejected the changed shape, causing the cloud save to fail.

### Fix

```js
// Phase 2 — fix: preserve the original item type
if (typeof d.items[i] === 'string') d.items[i] = unitMap.get(id);
else { if (!d.items[i]) d.items[i] = {}; d.items[i].text = unitMap.get(id); }
```

String items remain strings after translation apply. Object items have their `.text` property updated. D1 schema validation passes.

---

## 10. Extension Points

### AI Translation (`TranslationEngine.AI`)

Reserved for one-click AI translation. Not yet implemented.

```js
TranslationEngine.AI = {
  PROVIDERS: ['openai', 'anthropic', 'google', 'azure', 'deepl', 'local'],
  translate: null, // (units, { provider, sourceLocale, targetLocale, apiKey }) → Promise<units>
};
```

Integration path:
1. Populate `TranslationEngine.AI.translate` with an adapter function.
2. The modal calls `AI.translate(units, opts)` to get translated units.
3. The result is re-assembled into a parsed XLIFF structure and passed through `applyTranslation`.
4. No changes to the core engine are required.

### Translation Memory (`TranslationEngine.MEMORY`)

Reserved for string-level translation reuse across courses.

```js
TranslationEngine.MEMORY = {
  lookup: null, // (text, locale) → cached translation or null
  store:  null, // (text, translated, locale) → void
};
```

Storage target: Cloudflare D1, keyed by `SHA256(sourceText)` + locale.

### Multilingual Course History (`TranslationEngine.HISTORY`)

Phase 2 architecture: instead of mutating `block.data` in place, `applyTranslation` will store the translated strings in `course.translations[locale]`:

```js
course.translations = {
  'fr-fr': Map<compositeId, string>,
  'de-de': Map<compositeId, string>,
};
```

The rendering layer will read from `course.translations[course.activeLocale]` first, falling back to the original `block.data`. This allows a single course to serve multiple language variants without duplicating the course structure.

---

## 11. Files

| File | Role |
|---|---|
| `Lumio Prototype/js/translationEngine.js` | Core engine — extract, generateXliff, parseXliff, validateImport, applyTranslation |
| `Lumio Prototype/js/labelEngine.js` | Label Engine — built-in packs, custom packs, `L()` global, label XLIFF *(Phase 2)* |
| `Lumio Prototype/js/screens/courseLanding.js` | Translate button + `openTranslationModal()` with Label Sets section *(Phase 2)* |
| `Lumio Prototype/js/shared/kcComponents.js` | KC submit/correct/wrong labels via `L()` *(Phase 2)* |
| `Lumio Prototype/js/screens/learnerPreview.js` | `setActivePack()` call + all nav/sidebar/feedback labels via `L()` *(Phase 2)* |
| `Lumio Prototype/js/app.js` | D1 error reporting improvement *(Phase 2)* |
| `Lumio Prototype/index.html` | `<script src="js/labelEngine.js">` added before translationEngine.js *(Phase 2)* |
| `docs/translation-engine.md` | This document |

---

## 12. Rules for Future Development

1. **Never bypass the engine** — all translation operations must go through `TranslationEngine`. No screen should build or parse XLIFF directly.
2. **Never use positional IDs for course content that has stable block IDs** — block UUIDs (`blk_` prefix) are permanent; use them as the first segment of every trans-unit ID.
3. **Keep extract/apply in sync** — every field added to `extractBlock()` must have a matching case in `_applyBlock()`. They are mirrors of each other.
4. **HTML preservation is opt-in per field** — mark `richText: true` only for fields that are stored as HTML. Plain strings must not be wrapped in `<g>` markup.
5. **Phase 2 migration** — search for `TODO(phase2-stable-ids)` to find all sites that need updating when array items gain stable IDs.
6. **Label Engine is the only owner of UI strings** — never hardcode learner-visible labels (button text, feedback messages, aria-labels) in learnerPreview.js, kcComponents.js, or any other learner-context file. Always call `L(key)`.
7. **`setActivePack` must be called before any render** — the learner shell entry points (`learnerShell`, `learnerShellProduction`) must call `LabelEngine.setActivePack(course)` before the first DOM write. Any new shell entry point must do the same.
8. **`extract` and `apply` cover content; `LabelEngine` covers chrome** — do not add UI string keys to `TranslationEngine.extract`. Do not add course content to `LabelEngine`.
