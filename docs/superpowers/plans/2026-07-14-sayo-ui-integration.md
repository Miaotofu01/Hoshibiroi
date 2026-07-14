# Sayo UI 混合集成 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Sayo UI CSS tokens and JS interaction engine into the TRANS Chrome extension, replacing custom CSS variables, cursor/glow/trail, toast, and confirm dialog.

**Architecture:** Hybrid integration — Copy `sayo.js` as static asset into Vite's `public/` directory; replace `:root` CSS variable blocks with `--syo-*` tokens (same Primer Dark values, new names); replace `cursor.ts` with `Sayo.cursor`/`Sayo.trail` API; replace custom `showToast()`/`showConfirm()` with `Sayo.toast`/`Sayo.dialog`.

**Tech Stack:** Vite 6 + vite-plugin-web-extension v4, TypeScript 5.7, lit-html v3.2 (content scripts), Sayo UI (~46KB IIFE script, zero deps)

## Global Constraints

- All CSS variables renamed to `--syo-*` prefix; color values unchanged
- Custom class names (`.fc-card`, `.rate-btn`, etc.) preserved
- Content script Shadow DOM components keep their structure and internal toast
- `prefers-reduced-motion: reduce` must still prevent glow/trail/ripple but keep cursor ring
- Build must pass: `npm run build` with zero TypeScript errors

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `public/sayo.js` | CREATE (copy) | Sayo UI engine, loaded via `<script>` in vocab HTML |
| `src/vocab/index.html` | MODIFY | Replace `:root` block, remove cursor/glow/modal DOM, add `<script src="/sayo.js">`, remove old CSS |
| `src/vocab/index.ts` | MODIFY | Replace `mountCursor`/`unmountCursor` with `Sayo.cursor`/`Sayo.trail` |
| `src/vocab/utils.ts` | MODIFY | Delete `showToast()`, `showConfirm()`; keep `Icons`, `escapeHtml`, etc. |
| `src/vocab/panels/settings.ts` | MODIFY | Replace `showToast`/`showConfirm` calls with `Sayo.toast`/`Sayo.dialog` |
| `src/vocab/panels/learn.ts` | MODIFY | Replace `showToast` call with `Sayo.toast` |
| `src/vocab/panels/browse.ts` | MODIFY | Replace `showToast`/`showConfirm` calls |
| `src/shared/sayo.d.ts` | CREATE | Global type declaration for `window.Sayo` |
| `src/vocab/effects/cursor.ts` | DELETE | Replaced by Sayo.cursor/Sayo.trail |
| `src/popup/index.html` | MODIFY | Replace `:root` CSS variable block |
| `src/content/styles/theme.css` | MODIFY | Replace `:host` CSS variables with `--syo-*` equivalents |
| `src/content/components/popup-bubble.ts` | MODIFY | Update `:host` CSS variable aliases |
| `src/content/components/side-panel.ts` | MODIFY | Update CSS variable references |

---

### Task 1: Copy sayo.js into public/

**Files:**
- Create: `public/sayo.js`

**Interfaces:**
- Produces: `window.Sayo` global (cursor, trail, toast, dialog, ripple, parallax, reveal, countUp, inertiaScroll, dropdown, scrollSpy, destroy)

- [ ] **Step 1: Copy sayo.js from Sayo UI project**

```bash
cp /home/tofu/我的项目/sayo-ui/sayo.js /home/tofu/我的项目/TRANS/public/sayo.js
```

- [ ] **Step 2: Verify file was copied**

```bash
wc -c /home/tofu/我的项目/TRANS/public/sayo.js
```

Expected: ~46208 bytes (same as source)

- [ ] **Step 3: Commit**

```bash
cd /home/tofu/我的项目/TRANS && git add public/sayo.js && git commit -m "chore: copy sayo.js into public/ for vocab page"
```

---

### Task 2: Replace CSS tokens in vocab/index.html

**Files:**
- Modify: `src/vocab/index.html:8-39` (CSS `:root` block)
- Modify: `src/vocab/index.html:475-499` (cursor/glow CSS + reduced-motion)
- Modify: `src/vocab/index.html:432-473` (toast + modal CSS)
- Modify: `src/vocab/index.html:502` (body tag)
- Modify: `src/vocab/index.html:711-727` (modal + toast + cursor DOM)
- Modify: `src/vocab/index.html:729` (script tag)
- Modify: `src/vocab/index.html` — all `var(--old-name)` → `var(--syo-new-name)` references

**Interfaces:**
- Consumes: `public/sayo.js` loaded via `<script src="/sayo.js"></script>`
- Produces: CSS variables renamed to `--syo-*`, old cursor/glow/modal DOM removed

- [ ] **Step 1: Replace the `:root` CSS variable block (lines 8-39)**

Replace:
```css
:root {
  --bg-base: #0d1117;
  --bg-surface: #161b22;
  --bg-elevated: #1c2129;
  --bg-selection: rgba(31,111,235,0.2);
  --fg-default: #e6edf3;
  --fg-body: #c9d1d9;
  --fg-muted: #8b949e;
  --border-default: #30363d;
  --border-muted: #21262d;
  --color-info: #58a6ff;
  --color-success: #3fb950;
  --color-warning: #d29922;
  --color-danger: #f85149;
  --color-accent: #bc8cff;
  --color-secondary: #79c0ff;
  --radius-md: 6px;
  --radius-sm: 4px;
  --radius-lg: 8px;
  --font-sans: "Inter","Noto Sans SC","SF Pro Display",-apple-system,BlinkMacSystemFont,sans-serif;
  --font-mono: "Fira Code","SF Mono","Cascadia Code","JetBrains Mono",monospace;
  --ease-elastic: cubic-bezier(0.34,1.56,0.64,1);
  --ease-out: cubic-bezier(0.25,0.46,0.45,0.94);
  --ease-in-out: cubic-bezier(0.4,0,0.2,1);
  --ease-standard: var(--ease-out);
  --text-micro: 11px;
  --text-sm: 12px;
  --text-base: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
  --text-display: 56px;
}
```

With:
```css
:root {
  /* Sayo UI tokens — Primer Dark */
  --syo-bg-base: #0d1117;
  --syo-bg-surface: #161b22;
  --syo-bg-elevated: #1c2129;
  --syo-bg-selection: rgba(31,111,235,0.2);
  --syo-border: #30363d;
  --syo-border-muted: #21262d;
  --syo-fg-default: #e6edf3;
  --syo-fg-body: #c9d1d9;
  --syo-fg-muted: #8b949e;
  --syo-red: #f85149;
  --syo-orange: #f0883e;
  --syo-yellow: #d29922;
  --syo-green: #3fb950;
  --syo-teal: #39d353;
  --syo-cyan: #79c0ff;
  --syo-blue: #58a6ff;
  --syo-purple: #bc8cff;
  --syo-pink: #d2a8ff;
  --syo-danger: var(--syo-red);
  --syo-warning: var(--syo-yellow);
  --syo-success: var(--syo-green);
  --syo-info: var(--syo-blue);
  --syo-accent: var(--syo-purple);
  --syo-secondary: var(--syo-cyan);
  --syo-special: var(--syo-orange);
  --syo-subtle: var(--syo-teal);
  --syo-font-sans: "Inter","Noto Sans SC",-apple-system,BlinkMacSystemFont,sans-serif;
  --syo-font-mono: "Fira Code","SF Mono","Cascadia Code","JetBrains Mono",monospace;
  --syo-font-size: 15px;
  --syo-line-height: 1.65;
  --syo-space-1: 4px; --syo-space-2: 8px; --syo-space-3: 12px;
  --syo-space-4: 16px; --syo-space-5: 20px; --syo-space-6: 24px;
  --syo-space-8: 32px; --syo-space-10: 40px; --syo-space-12: 48px;
  --syo-radius-sm: 4px; --syo-radius-md: 6px; --syo-radius-lg: 8px;
  --syo-radius-full: 999px;
  --syo-ease-elastic: cubic-bezier(0.34,1.56,0.64,1);
  --syo-ease-out: cubic-bezier(0.4,0,0.2,1);
  --syo-ease-spring: cubic-bezier(0.25,0.46,0.45,0.94);
  --syo-trans-color: color 180ms var(--syo-ease-out);
  --syo-trans-spring: transform 250ms var(--syo-ease-elastic),border-color 200ms var(--syo-ease-out),background 200ms var(--syo-ease-out);
  --syo-trans-active: transform 100ms var(--syo-ease-out);
  /* Project-specific: font stacks with Chinese font separation */
  --font-display: "Inter","Noto Sans SC",-apple-system,BlinkMacSystemFont,sans-serif;
  --font-body: "Noto Sans SC","Inter",-apple-system,BlinkMacSystemFont,sans-serif;
  --text-micro: 11px;
  --text-sm: 12px;
  --text-base: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
  --text-display: 56px;
}
```

- [ ] **Step 2: Replace all CSS variable references**

Run a Python script to do all replacements safely:

```bash
cd /home/tofu/我的项目/TRANS && python3 << 'PYEOF'
import re

with open('src/vocab/index.html', 'r') as f:
    content = f.read()

# Ordered replacements — long names first to avoid partial matches
replacements = [
    ('var(--bg-selection)', 'var(--syo-bg-selection)'),
    ('var(--bg-elevated)', 'var(--syo-bg-elevated)'),
    ('var(--bg-surface)', 'var(--syo-bg-surface)'),
    ('var(--bg-base)', 'var(--syo-bg-base)'),
    ('var(--fg-muted)', 'var(--syo-fg-muted)'),
    ('var(--fg-body)', 'var(--syo-fg-body)'),
    ('var(--fg-default)', 'var(--syo-fg-default)'),
    ('var(--border-muted)', 'var(--syo-border-muted)'),
    ('var(--border-default)', 'var(--syo-border)'),
    ('var(--color-secondary)', 'var(--syo-secondary)'),
    ('var(--color-accent)', 'var(--syo-accent)'),
    ('var(--color-danger)', 'var(--syo-danger)'),
    ('var(--color-warning)', 'var(--syo-warning)'),
    ('var(--color-success)', 'var(--syo-success)'),
    ('var(--color-info)', 'var(--syo-info)'),
    ('var(--color-special)', 'var(--syo-special)'),
    ('var(--color-subtle)', 'var(--syo-subtle)'),
    ('var(--radius-lg)', 'var(--syo-radius-lg)'),
    ('var(--radius-md)', 'var(--syo-radius-md)'),
    ('var(--radius-sm)', 'var(--syo-radius-sm)'),
    ('var(--ease-in-out)', 'var(--syo-ease-spring)'),
    ('var(--ease-standard)', 'var(--syo-ease-out)'),
    ('var(--ease-elastic)', 'var(--syo-ease-elastic)'),
    ('var(--ease-out)', 'var(--syo-ease-out)'),
    ('var(--font-mono)', 'var(--syo-font-mono)'),
    ('var(--font-sans)', 'var(--syo-font-sans)'),
]

for old, new in replacements:
    content = content.replace(old, new)

with open('src/vocab/index.html', 'w') as f:
    f.write(content)

print("Done. Replacements applied.")
PYEOF
```

- [ ] **Step 3: Verify no old variable references remain**

```bash
grep -c 'var(--bg-\|var(--fg-\|var(--border-\|var(--color-\|var(--ease-in-out)\|var(--ease-standard)\|var(--font-mono)\|var(--font-sans)' /home/tofu/我的项目/TRANS/src/vocab/index.html
```

Expected: `0`

- [ ] **Step 4: Delete cursor/glow CSS rules (lines ~475-485)**

Delete the entire block:
```css
/* ═══════════════════════  CUSTOM CURSOR + GLOW  ═══════════════════════ */
.custom-cursor{...}
#glow-canvas{...}
```

- [ ] **Step 5: Delete toast and modal CSS rules (lines ~432-473)**

Delete the `.toast{...}` block, `.modal-overlay{...}`, `.modal-box{...}`, `.modal-title{...}`, `.modal-desc{...}`, `.modal-actions{...}`, `.modal-btn{...}` blocks.

- [ ] **Step 6: Delete cursor/glow, modal, and toast DOM elements (lines 711-727)**

Delete:
```html
<!-- ═══ CONFIRM MODAL ═══ -->
<div class="modal-overlay" id="modal-overlay">...</div>

<!-- ═══ TOAST ═══ -->
<div class="toast" id="toast"></div>

<!-- ═══ CURSOR + GLOW ═══ -->
<div class="custom-cursor" id="custom-cursor"></div>
<canvas id="glow-canvas"></canvas>
```

- [ ] **Step 7: Add sayo.js script tag**

After line `</style>` and before `</head>`, add:
```html
<script src="/sayo.js"></script>
```

Wait — check exact position. The current HTML has `</style></head>` on consecutive lines. Add the script right before `</head>`:

Change:
```html
</style>
</head>
```

To:
```html
</style>
<script src="/sayo.js"></script>
</head>
```

- [ ] **Step 8: Add `data-syo-cursor` and `data-syo-trail` to body tag**

Change:
```html
<body>
```

To:
```html
<body data-syo-cursor data-syo-trail>
```

But wait — cursor should only be active on learn/stats panels, not on browse. So we should NOT use body attributes (which auto-init on page load). Instead, we'll manually call `Sayo.cursor.init()` in `index.ts`. Only add `data-syo-trail` or neither.

Actually — Sayo's auto-init only fires on `DOMContentLoaded`. Since we want conditional init per panel, we should NOT add body attributes. We'll call the JS APIs manually in index.ts. Skip this step.

- [ ] **Step 9: Verify the updated HTML structure**

```bash
grep -c 'syo-' /home/tofu/我的项目/TRANS/src/vocab/index.html
```

Should show many matches (>50) for `--syo-*` variable references.

- [ ] **Step 10: Commit**

```bash
cd /home/tofu/我的项目/TRANS && git add src/vocab/index.html && git commit -m "refactor(vocab): replace CSS tokens with --syo-*, remove old cursor/toast/modal DOM"
```

---

### Task 3: Replace CSS tokens in popup/index.html

**Files:**
- Modify: `src/popup/index.html:7-27` (CSS `:root` block)
- Modify: `src/popup/index.html` — all `var(--old-name)` references

**Interfaces:**
- Produces: Popup styles use `--syo-*` variables

- [ ] **Step 1: Replace the `:root` CSS variable block**

Replace:
```css
:root {
  --bg-base: #0d1117;
  --bg-surface: #161b22;
  --bg-elevated: #1c2129;
  --fg-default: #e6edf3;
  --fg-body: #c9d1d9;
  --fg-muted: #8b949e;
  --border-default: #30363d;
  --border-muted: #21262d;
  --color-info: #58a6ff;
  --color-success: #3fb950;
  --color-warning: #d29922;
  --color-danger: #f85149;
  --radius-md: 6px;
  --radius-sm: 4px;
  --radius-lg: 8px;
  --font-sans: "Inter","Noto Sans SC","SF Pro Display",-apple-system,BlinkMacSystemFont,sans-serif;
  --font-mono: "Fira Code","SF Mono","Cascadia Code","JetBrains Mono",monospace;
  --ease-elastic: cubic-bezier(0.34,1.56,0.64,1);
  --ease-standard: cubic-bezier(0.4,0,0.2,1);
}
```

With:
```css
:root {
  --syo-bg-base: #0d1117;
  --syo-bg-surface: #161b22;
  --syo-bg-elevated: #1c2129;
  --syo-border: #30363d;
  --syo-border-muted: #21262d;
  --syo-fg-default: #e6edf3;
  --syo-fg-body: #c9d1d9;
  --syo-fg-muted: #8b949e;
  --syo-red: #f85149; --syo-yellow: #d29922; --syo-green: #3fb950;
  --syo-blue: #58a6ff; --syo-purple: #bc8cff; --syo-cyan: #79c0ff;
  --syo-danger: var(--syo-red);
  --syo-warning: var(--syo-yellow);
  --syo-success: var(--syo-green);
  --syo-info: var(--syo-blue);
  --syo-accent: var(--syo-purple);
  --syo-secondary: var(--syo-cyan);
  --syo-font-sans: "Inter","Noto Sans SC",-apple-system,BlinkMacSystemFont,sans-serif;
  --syo-font-mono: "Fira Code","SF Mono","Cascadia Code","JetBrains Mono",monospace;
  --syo-radius-sm: 4px; --syo-radius-md: 6px; --syo-radius-lg: 8px;
  --syo-ease-elastic: cubic-bezier(0.34,1.56,0.64,1);
  --syo-ease-out: cubic-bezier(0.4,0,0.2,1);
  --syo-ease-spring: cubic-bezier(0.25,0.46,0.45,0.94);
  --font-display: "Inter","Noto Sans SC",-apple-system,BlinkMacSystemFont,sans-serif;
  --font-body: "Noto Sans SC","Inter",-apple-system,BlinkMacSystemFont,sans-serif;
}
```

- [ ] **Step 2: Run the same replacement script on popup/index.html**

```bash
cd /home/tofu/我的项目/TRANS && python3 << 'PYEOF'
import re

with open('src/popup/index.html', 'r') as f:
    content = f.read()

replacements = [
    ('var(--bg-elevated)', 'var(--syo-bg-elevated)'),
    ('var(--bg-surface)', 'var(--syo-bg-surface)'),
    ('var(--bg-base)', 'var(--syo-bg-base)'),
    ('var(--fg-muted)', 'var(--syo-fg-muted)'),
    ('var(--fg-body)', 'var(--syo-fg-body)'),
    ('var(--fg-default)', 'var(--syo-fg-default)'),
    ('var(--border-muted)', 'var(--syo-border-muted)'),
    ('var(--border-default)', 'var(--syo-border)'),
    ('var(--color-danger)', 'var(--syo-danger)'),
    ('var(--color-warning)', 'var(--syo-warning)'),
    ('var(--color-success)', 'var(--syo-success)'),
    ('var(--color-info)', 'var(--syo-info)'),
    ('var(--radius-lg)', 'var(--syo-radius-lg)'),
    ('var(--radius-md)', 'var(--syo-radius-md)'),
    ('var(--radius-sm)', 'var(--syo-radius-sm)'),
    ('var(--ease-standard)', 'var(--syo-ease-out)'),
    ('var(--ease-elastic)', 'var(--syo-ease-elastic)'),
    ('var(--font-mono)', 'var(--syo-font-mono)'),
    ('var(--font-sans)', 'var(--syo-font-sans)'),
]

for old, new in replacements:
    content = content.replace(old, new)

with open('src/popup/index.html', 'w') as f:
    f.write(content)

print("Done.")
PYEOF
```

- [ ] **Step 3: Verify**

```bash
grep -c 'var(--bg-\|var(--fg-\|var(--border-\|var(--color-\|var(--ease-standard)' /home/tofu/我的项目/TRANS/src/popup/index.html
```

Expected: `0`

- [ ] **Step 4: Commit**

```bash
cd /home/tofu/我的项目/TRANS && git add src/popup/index.html && git commit -m "refactor(popup): replace CSS tokens with --syo-*"
```

---

### Task 4: Replace CSS tokens in content script styles

**Files:**
- Modify: `src/content/styles/theme.css` (entire file)
- Modify: `src/content/components/popup-bubble.ts` (`:host` block)

**Interfaces:**
- Consumes: None (CSS-only change)
- Produces: Content script Shadow DOM uses `--syo-*` variable names with Primer Dark values

- [ ] **Step 1: Replace theme.css entirely**

Write the new `src/content/styles/theme.css`:

```css
/* Sayo UI tokens — Primer Dark (for Shadow DOM isolation) */

:host {
  --syo-bg-base: #0d1117;
  --syo-bg-surface: #161b22;
  --syo-bg-elevated: #1c2129;
  --syo-border: #30363d;
  --syo-border-muted: #21262d;
  --syo-fg-default: #e6edf3;
  --syo-fg-body: #c9d1d9;
  --syo-fg-muted: #8b949e;
  --syo-blue: #58a6ff;
  --syo-green: #3fb950;
  --syo-yellow: #d29922;
  --syo-red: #f85149;
  --syo-purple: #bc8cff;
  --syo-cyan: #79c0ff;
  --syo-info: var(--syo-blue);
  --syo-success: var(--syo-green);
  --syo-warning: var(--syo-yellow);
  --syo-danger: var(--syo-red);
  --syo-accent: var(--syo-purple);
  --syo-secondary: var(--syo-cyan);
  --syo-radius-sm: 4px;
  --syo-radius-md: 6px;
  --syo-radius-lg: 8px;
  --syo-ease-elastic: cubic-bezier(0.34, 1.56, 0.64, 1);
  --syo-ease-out: cubic-bezier(0.4, 0, 0.2, 1);
  --font-display: "Inter", "Noto Sans SC", -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: "Fira Code", "FiraCode Nerd Font", "SF Mono", "Cascadia Code", "JetBrains Mono", monospace;
  --font-size-sm: 12px;
  --font-size-base: 14px;
  --font-size-lg: 16px;
}

/* Global reset (Shadow DOM only) */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

button {
  cursor: pointer;
  border: none;
  background: none;
  color: var(--syo-fg-default);
  font-family: var(--font-display);
  font-size: var(--font-size-sm);
  transition: color 150ms var(--syo-ease-out), background 150ms var(--syo-ease-out);
}

svg { display: block; }

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 2: Update popup-bubble.ts `:host` CSS variable aliases**

In `src/content/components/popup-bubble.ts`, replace the `:host` block (around lines 12-25):

Replace:
```css
:host {
  --text-primary: var(--fg-default, #e6edf3);
  --text-secondary: var(--fg-body, #c9d1d9);
  --text-muted: var(--fg-muted, #8b949e);
  --bg-primary: var(--bg-base, #0d1117);
  --bg-secondary: var(--bg-surface, #161b22);
  --bg-hover: var(--bg-elevated, #1c2129);
  --border: var(--border-default, #30363d);
  --border-soft: var(--border-muted, #21262d);
  --color-info-green: var(--color-success, #3fb950);
  --color-info-yellow: var(--color-warning, #d29922);
  --color-info-red: var(--color-danger, #f85149);
  --transition: color .15s var(--ease-out, cubic-bezier(0.4,0,0.2,1)), background .15s var(--ease-out, cubic-bezier(0.4,0,0.2,1)), border-color .15s var(--ease-out, cubic-bezier(0.4,0,0.2,1));
  ...
}
```

With:
```css
:host {
  --text-primary: var(--syo-fg-default, #e6edf3);
  --text-secondary: var(--syo-fg-body, #c9d1d9);
  --text-muted: var(--syo-fg-muted, #8b949e);
  --bg-primary: var(--syo-bg-base, #0d1117);
  --bg-secondary: var(--syo-bg-surface, #161b22);
  --bg-hover: var(--syo-bg-elevated, #1c2129);
  --border: var(--syo-border, #30363d);
  --border-soft: var(--syo-border-muted, #21262d);
  --accent: var(--syo-blue, #58a6ff);
  --accent-green: var(--syo-success, #3fb950);
  --accent-yellow: var(--syo-warning, #d29922);
  --accent-red: var(--syo-danger, #f85149);
  --accent-purple: var(--syo-accent, #bc8cff);
  --transition: color .15s var(--syo-ease-out, cubic-bezier(0.4,0,0.2,1)), background .15s var(--syo-ease-out, cubic-bezier(0.4,0,0.2,1)), border-color .15s var(--syo-ease-out, cubic-bezier(0.4,0,0.2,1));
  ...
}
```

Also update all internal CSS in popup-bubble.ts that references `var(--color-info)` → `var(--accent)` (since we renamed the alias), `var(--color-success)` → `var(--accent-green)`, etc.

- [ ] **Step 3: Update side-panel.ts CSS variable references**

In `src/content/components/side-panel.ts`, replace CSS references:
- `var(--bg-primary)` → `var(--syo-bg-base)`
- `var(--border)` → `var(--syo-border)`
- `var(--text-primary)` → `var(--syo-fg-default)`
- `var(--text-secondary)` → `var(--syo-fg-body)`
- `var(--text-muted)` → `var(--syo-fg-muted)`
- `var(--font-family)` → `var(--font-display)`
- `var(--font-mono)` → `var(--font-mono)` (unchanged)
- `var(--color-info)` → `var(--syo-info)`
- `var(--color-info-red)` → `var(--syo-danger)`
- `var(--color-accent)` → `var(--syo-accent)`
- `var(--radius-sm)` → `var(--syo-radius-sm)`
- `var(--border-soft)` → `var(--syo-border-muted)`

- [ ] **Step 4: Verify and commit**

```bash
cd /home/tofu/我的项目/TRANS && git add src/content/ && git commit -m "refactor(content): replace CSS tokens with --syo-* in Shadow DOM"
```

---

### Task 5: Replace cursor with Sayo.cursor/Sayo.trail API

**Files:**
- Modify: `src/vocab/index.ts:6,16,27,65` (import, switchPanel, init)
- Delete: `src/vocab/effects/cursor.ts`

**Interfaces:**
- Consumes: `window.Sayo` global (from sayo.js loaded in index.html)
- Produces: Conditional cursor/trail init on learn/stats, destroy on browse

- [ ] **Step 1: Create shared Sayo type declaration**

Write `src/shared/sayo.d.ts`:

```typescript
/** Sayo UI global — loaded via <script src="/sayo.js"> in vocab/index.html */
declare const Sayo: {
  cursor: { init(opts?: Record<string, number>): void; destroy(): void };
  trail: { init(opts?: Record<string, unknown>): void; destroy(): void };
  toast: {
    show(msg: string, opts?: {
      type?: 'success' | 'error' | 'info' | 'warning';
      duration?: number;
    }): void;
  };
  dialog: {
    confirm(opts: {
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
    }): Promise<boolean>;
  };
};
```

This file is included by `tsconfig.json`'s `"include": ["src"]` — no import needed.

- [ ] **Step 2: Remove cursor import and update switchPanel**

Remove the import:
```typescript
import { mountCursor, unmountCursor } from './effects/cursor';
```

In `switchPanel()`, change:
```typescript
if (panel === 'learn' || panel === 'stats') mountCursor(); else unmountCursor();
```

To:
```typescript
if (panel === 'learn' || panel === 'stats') {
  Sayo.cursor.init({ accentR: 88, accentG: 166, accentB: 255 });
  Sayo.trail.init();
} else {
  Sayo.cursor.destroy();
  Sayo.trail.destroy();
}
```

In `init()`, change:
```typescript
if (currentPanel === 'learn' || currentPanel === 'stats') mountCursor();
```

To:
```typescript
if (currentPanel === 'learn' || currentPanel === 'stats') {
  Sayo.cursor.init({ accentR: 88, accentG: 166, accentB: 255 });
  Sayo.trail.init();
}
```

- [ ] **Step 3: Delete cursor.ts**

```bash
rm /home/tofu/我的项目/TRANS/src/vocab/effects/cursor.ts
# Also remove the effects directory if empty
rmdir /home/tofu/我的项目/TRANS/src/vocab/effects 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
cd /home/tofu/我的项目/TRANS && git add -A && git commit -m "refactor(vocab): replace custom cursor/glow with Sayo.cursor + Sayo.trail"
```

---

### Task 6: Replace showToast with Sayo.toast

**Files:**
- Modify: `src/vocab/utils.ts:86-97` (delete `showToast()`)
- Modify: `src/vocab/panels/settings.ts:202,234` (replace calls)
- Modify: `src/vocab/panels/learn.ts:274` (replace call)
- Modify: `src/vocab/panels/browse.ts:202` (replace call)

**Interfaces:**
- Consumes: `window.Sayo.toast.show()`
- Produces: Toast notifications use Sayo UI

- [ ] **Step 1: Delete showToast() from utils.ts**

Remove lines 86-97 (the entire `showToast` function and `toastTimer` variable):
```typescript
// Delete:
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(msg: string): void {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}
```

- [ ] **Step 2: Update settings.ts**

Remove `showToast` from import:
```typescript
// Before:
import { showToast, showConfirm } from '../utils';
// After:
import { showConfirm } from '../utils';
```

Replace all `showToast(msg)` calls:

Line 202: `showToast('设置已保存')` →
```typescript
Sayo.toast.show('设置已保存', { type: 'success' });
```

Line 234: `showToast('已清除全部数据')` →
```typescript
Sayo.toast.show('已清除全部数据', { type: 'success' });
```

- [ ] **Step 3: Update learn.ts**

Remove `showToast` from import:
```typescript
// Before:
import { escapeHtml, extractHostname, showToast } from '../utils';
// After:
import { escapeHtml, extractHostname } from '../utils';
```

Line 274: `showToast('保存失败，请检查扩展是否正常运行')` →
```typescript
Sayo.toast.show('保存失败，请检查扩展是否正常运行', { type: 'error', duration: 6000 });
```

- [ ] **Step 4: Update browse.ts**

Remove `showToast` from import:
```typescript
// Before:
import { escapeHtml, extractHostname, sourceDotClass, wordStatus, calcMastery, Icons, ico, showToast, showConfirm } from '../utils';
// After:
import { escapeHtml, extractHostname, sourceDotClass, wordStatus, calcMastery, Icons, ico, showConfirm } from '../utils';
```

Line 202: `showToast('已删除')` →
```typescript
Sayo.toast.show('已删除', { type: 'success' });
```

- [ ] **Step 5: Commit**

```bash
cd /home/tofu/我的项目/TRANS && git add -A && git commit -m "refactor(vocab): replace showToast with Sayo.toast.show"
```

---

### Task 7: Replace showConfirm with Sayo.dialog.confirm

**Files:**
- Modify: `src/vocab/utils.ts:123-165` (delete `showConfirm()`)
- Modify: `src/vocab/panels/settings.ts:218-222` (replace call)
- Modify: `src/vocab/panels/browse.ts:194` (replace call)

**Interfaces:**
- Consumes: `window.Sayo.dialog.confirm()`
- Produces: Confirm dialogs use Sayo UI

- [ ] **Step 1: Delete showConfirm() from utils.ts**

Remove lines 123-165 (the entire `showConfirm` function).

- [ ] **Step 2: Update settings.ts**

Remove `showConfirm` from import:
```typescript
// Before:
import { showConfirm } from '../utils';
// After: (remove the import entirely — now using Sayo.dialog directly)
```

Replace lines 218-222:
```typescript
// Before:
const ok = await showConfirm(
  '清除全部数据',
  '此操作不可恢复，所有生词和复习记录将被永久删除。',
  true,
);

// After:
const ok = await Sayo.dialog.confirm({
  title: '清除全部数据',
  message: '此操作不可恢复，所有生词和复习记录将被永久删除。',
  confirmText: '确认清除',
  cancelText: '取消',
});
```

- [ ] **Step 3: Update browse.ts**

Remove `showConfirm` from import:
```typescript
// Before:
import { ..., showConfirm } from '../utils';
// After:
import { ... } from '../utils';
```

Replace line 194:
```typescript
// Before:
const ok = await showConfirm('删除单词', '确定要删除这个单词吗？', true);

// After:
const ok = await Sayo.dialog.confirm({
  title: '删除单词',
  message: '确定要删除这个单词吗？',
  confirmText: '删除',
  cancelText: '取消',
});
```

- [ ] **Step 4: Commit**

```bash
cd /home/tofu/我的项目/TRANS && git add -A && git commit -m "refactor(vocab): replace showConfirm with Sayo.dialog.confirm"
```

---

### Task 8: Build and verify

**Files:**
- None (verification only)

**Interfaces:**
- Verifies all changes compile and produce correct output

- [ ] **Step 1: Run build**

```bash
cd /home/tofu/我的项目/TRANS && npm run build 2>&1
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify old variable names are gone from build output**

```bash
grep -rn 'var(--bg-base)\|var(--fg-default)\|var(--color-info)\|var(--border-default)' /home/tofu/我的项目/TRANS/dist/ 2>/dev/null || echo "No old variables found — PASS"
```

Expected: "No old variables found — PASS"

- [ ] **Step 3: Verify sayo.js is in dist**

```bash
ls -la /home/tofu/我的项目/TRANS/dist/sayo.js
```

Expected: File exists with ~46KB size.

- [ ] **Step 4: Verify cursor.ts was not bundled**

```bash
grep -r 'mountCursor\|unmountCursor' /home/tofu/我的项目/TRANS/dist/src/vocab/ 2>/dev/null || echo "No cursor references — PASS"
```

Expected: "No cursor references — PASS"

- [ ] **Step 5: Check sayo.js references in built HTML**

```bash
grep 'sayo.js' /home/tofu/我的项目/TRANS/dist/src/vocab/index.html
```

Expected: Shows `<script src="/sayo.js"></script>` or similar path.

- [ ] **Step 6: Manual verification checklist**

Load the extension in Chrome and verify:
1. Vocab page loads without JS errors in console
2. Custom cursor + glow + trail work on learn and stats panels
3. Switching to browse panel hides cursor/trail
4. Toast notifications appear correctly (save settings, delete word)
5. Confirm dialog appears correctly (clear all data)
6. Popup styles look correct
7. Content script translation bubble styles look correct
8. `prefers-reduced-motion: reduce` still suppresses glow/trail but keeps cursor ring

- [ ] **Step 7: Final commit (if any fixes needed)**

```bash
cd /home/tofu/我的项目/TRANS && git add -A && git commit -m "chore: final verification fixes for Sayo UI integration"
```
