# Lumio Theme Architecture

**Status:** Implemented (Sprint: Theme Architecture Isolation)  
**Last updated:** 2026-07-08

---

## 1. Architectural Principle

Lumio is two distinct products sharing one codebase. Their visual systems must never cross-contaminate.

| Product | Scope | Theme owner |
|---|---|---|
| **Lumio Platform** | Dashboard, Projects, Builder chrome, Navigation, Dialogs, Settings, Workspace UI | Platform Theme |
| **Lumio Course** | Landing Page, Hero, Lessons, Knowledge Checks, Published Player, SCORM output | Course Theme |

**The invariant:** A Course Theme change must produce zero visual change on any Platform component. A Platform Theme change must produce zero visual change on any Course component.

---

## 2. Theme Hierarchy

```
Platform Theme  (permanent — Lumio brand)
    └── Workspace Theme  (future — per-workspace brand override)
            └── Course Theme  (per-course — author-controlled)
                    └── Block Overrides  (per-block design props)
```

Each level scopes downward only. No level can modify its parent or any sibling scope.

---

## 3. Token Architecture

### 3a. Platform Tokens (`--plt-*`)

Defined in `:root`. Hard-wired. Never overridden anywhere in the codebase.

```css
--plt-font-display:  'Poppins', sans-serif
--plt-font-body:     'Inter', sans-serif
--plt-font-size-btn: 14px
--plt-font-size-sm:  13px
--plt-font-size-lg:  15px
--plt-radius-btn:    var(--r-pill)   /* 999px */
--plt-radius-card:   var(--r-lg)     /* 20px */
```

**Used by:** `.btn`, `.btn-sm`, `.btn-lg`, `.card`, all platform chrome.

**Rule:** Platform components reference `--plt-*` tokens only. They never reference `--theme-*` for layout, typography, or radius decisions.

### 3b. Course Theme Tokens (`--theme-*`)

Defined as defaults in `:root`. Overridden per-course by `applyThemeVars()` — scoped exclusively to the course content containers.

```css
--theme-primary:       <course color>
--theme-secondary:     <course color>
--theme-accent:        <course color>
--theme-font-display:  <course heading font>
--theme-font-body:     <course body font>
--theme-font-size:     <14px | 16px | 18px>
--theme-radius:        <sharp | soft | round>
--theme-button-style:  <pill | rounded | square>
--theme-bg-style:      <course background>
--theme-bg-solid:      <course solid bg fallback>
```

**Used by:** `#lesson-canvas`, `.lumio-learner-root`, `.course-landing-root` and all descendants.

### 3c. Brand Palette (shared read-only constants)

```css
--violet, --indigo, --cyan, --teal, --orange, --magenta, --yellow
--font-display: 'Poppins', --font-body: 'Inter'
--r-sm/md/lg/xl/pill
```

These are structural constants. Neither the Platform Theme nor the Course Theme redefines them.

---

## 4. CSS Scoping Mechanism

### The course canvas scope

Course theme variables are confined to three CSS selectors:

```
#lesson-canvas          — Builder lesson/assessment canvas
.lumio-learner-root     — Learner preview (in-app and published standalone)
.course-landing-root    — Course landing page
```

These are the only elements where `--theme-*` overrides are active. Everything outside them reads the `:root` defaults (the Lumio brand values).

### How the scope is applied

`applyThemeVars(course)` in `app.js` injects a single `<style id="__lumio-course-theme">` block into `<head>`:

```js
sheet.textContent =
  `#lesson-canvas, .lumio-learner-root, .course-landing-root { ${vars} }`;
```

**Critical invariant:** `#app` is never given an inline `style` attribute for theme vars. The previous architecture wrote course vars to `#app`, which caused them to inherit through the entire application. This is permanently prohibited.

### Clear path

When the router navigates to any non-course screen, `render()` empties the sheet:

```js
const sheet = document.getElementById('__lumio-course-theme');
if (sheet) sheet.textContent = '';
```

The `:root` defaults immediately take effect for the entire application.

---

## 5. Platform Theme

The Platform Theme is implicit — it is the `:root` CSS variable system combined with the `--plt-*` token layer. It does not have a runtime "apply" function because it is never changed at runtime.

**Owner:** The Lumio design system (`css/styles.css`).

**Components governed:**
- App shell: sidebar, nav items, logo area
- Builder chrome: toolbar, block picker, properties panel, header
- Buttons: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-icon`
- Cards: `.card`
- Form elements: `.input`, `.textarea`, `select.input`
- Tabs: `.tab`, `.lumio-tab-btn`
- Segmented controls: `.seg-control`
- Modals: `.overlay`, `.modal`
- Menus: `.menu-item`
- Notifications / toasts
- All workspace and settings screens

**Typography:** Always `'Poppins'` for headings, `'Inter'` for body text, 14px for UI controls. Never changes at runtime.

---

## 6. Course Theme

The Course Theme is an author-controlled set of design tokens stored in `course.themeDesign` and applied at runtime when the user enters any course screen.

**Owner:** The course author, via Course Settings → Theme.

**Storage:** `LumioState.courses[id].themeDesign` → persisted to localStorage and D1 with the project.

**Components governed:**
- Landing page: hero gradient, body text, CTA button
- Lesson canvas: headings, body text, block typography
- Knowledge checks: answer card colours, selected/hover states
- Published player: all learner-facing UI
- SCORM output: all rendered content

**Components explicitly NOT governed:**
- Builder shell (toolbar, sidebar, properties panel, nav)
- Platform dialogs and modals
- Workspace settings
- Dashboard and projects views
- Any `.nav-item`, `.tab`, platform `.btn`, `.card`, `.input`

**Tokens set per course:**

| Token | Controlled by | Effect |
|---|---|---|
| `--theme-primary` | Primary Colour picker | Hero gradient, KC selected/hover, links |
| `--theme-secondary` | Secondary Colour picker | Hero gradient secondary stop |
| `--theme-accent` | Accent Colour picker | CTA button colour |
| `--theme-font-display` | Font Family (heading) | Course h1–h4 |
| `--theme-font-body` | Font Family (body) | Course body text, buttons |
| `--theme-font-size` | Font Size (sm/md/lg) | Course base font scale |
| `--theme-button-style` | Button Style | Course button radius |
| `--theme-radius` | Corner Radius | Course card radius |
| `--theme-bg-style` | Background Style | Course background |

---

## 7. Builder Isolation

The builder renders both systems simultaneously. The boundary is the canvas element.

```
Builder window
├── Platform Theme scope
│   ├── Top toolbar (← Back to Course, lesson title, Preview, AI Assistant)
│   ├── Left sidebar (block type picker)
│   ├── Right panel (properties, Lesson Insights)
│   └── All platform buttons, tabs, inputs in panels
│
└── Course Theme scope
    └── #lesson-canvas
        ├── Block content (text, images, media)
        ├── Knowledge check components
        ├── Typography (headings, paragraphs)
        └── Course-themed interactive elements
```

**Buttons inside the canvas** (`#lesson-canvas .btn`) override the platform `.btn` base rule and use course typography tokens:

```css
#lesson-canvas .btn {
  font-family: var(--theme-font-body, var(--font-body));
  font-size: calc(var(--theme-font-size, 16px) - 2px);
  border-radius: var(--theme-button-style, var(--r-pill));
}
```

**Buttons outside the canvas** (platform chrome) use platform tokens:

```css
.btn {
  font-family: var(--plt-font-body);     /* always Inter */
  font-size: var(--plt-font-size-btn);   /* always 14px */
  border-radius: var(--plt-radius-btn);  /* always pill */
}
```

---

## 8. Rendering Hierarchy

```
Platform screens (Dashboard, Projects, Settings, etc.)
  → :root platform defaults only
  → --plt-* tokens for all chrome
  → __lumio-course-theme sheet: empty

Course Landing (editing mode)
  → applyThemeVars(course) fills __lumio-course-theme sheet
  → .course-landing-root inherits course --theme-* vars
  → themeVarStyle() also applied inline on .course-landing-root (redundant fallback)
  → Platform chrome outside .course-landing-root: :root defaults

Lesson Builder
  → applyThemeVars(course) fills __lumio-course-theme sheet
  → #lesson-canvas inherits course --theme-* vars
  → Builder shell outside #lesson-canvas: :root defaults

Learner Preview (in-app)
  → applyThemeVars(course) fills __lumio-course-theme sheet
  → .lumio-learner-root inherits course --theme-* vars
  → themeVarStyle() also applied inline on .lumio-learner-root

Published / SCORM
  → publish.js overrides window.scheduleLumioSave with learner-state-only version
  → Course content DOM is the entire page — no platform shell present
  → Course theme applied directly via inline themeVarStyle() on learner root
  → Platform Theme does not exist in published output
```

---

## 9. Persistence Hierarchy

| Theme | Stored in | Synced to |
|---|---|---|
| Platform Theme | `css/styles.css` (static) | n/a — compile-time |
| Workspace Theme (future) | `LumioState.workspace.theme` | D1 workspace table |
| Course Theme | `LumioState.courses[id].themeDesign` | D1 lessons table (with project) |
| Block Overrides | `LumioState.lessons[id][n].design` | D1 lessons table (with project) |

Each theme level persists independently. Changing a course theme never touches workspace or platform data.

---

## 10. Workspace Theme (Future)

Workspace Theme will sit between Platform and Course in the hierarchy. It will allow a workspace administrator to set a brand color palette that:
- Overrides the platform's default `--theme-primary` for all courses in that workspace
- Does not override any individual course's explicitly set `--theme-primary`

Implementation path when ready:
1. Add `--workspace-primary` etc. to `:root` via a `<style id="__lumio-workspace-theme">` block
2. Course Theme continues to scope to `#lesson-canvas` etc.
3. Platform chrome continues to use `--plt-*` tokens — completely unaffected

---

## 11. Rules for Future Development

1. **Never write course vars to `#app`** — the `applyThemeVars()` scoped sheet pattern is the only permitted mechanism.
2. **Never use `--theme-*` for platform chrome** — use `--plt-*` tokens or hardcoded brand values.
3. **Never use `--plt-*` inside course content** — course content always uses `--theme-*`.
4. **New platform components:** Always use `var(--plt-font-body)`, `var(--plt-font-size-btn)`, `var(--plt-radius-btn)` etc. Never `var(--theme-font-body)`.
5. **New course content components:** Always use `var(--theme-primary)`, `var(--theme-font-body)`, `var(--theme-font-size)` etc. Never hardcoded values.
6. **Published output:** The platform theme must never be referenced. Published HTML is self-contained course content only.
7. **The `__lumio-course-theme` sheet** is the single point of truth for which course theme is active. It is empty on all platform screens.
