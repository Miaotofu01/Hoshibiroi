# Vocab Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the vocab book page as a three-panel dashboard (Learn/Browse/Stats) with GitHub Primer Dark colors, 不背单词-style flashcard review with intra-session cycling, Anki-style stats, customizable card templates, and osu! elastic physics interactions.

**Architecture:** Vanilla HTML + CSS + TypeScript DOM manipulation. Three-panel dashboard with a settings drawer. Data flows from chrome.storage through state.ts to panel render functions. Worker handles SM-2 scheduling and review history persistence. SVG for all charts (no canvas/libs).

**Tech Stack:** TypeScript, Chrome Extension Manifest V3, vite-plugin-web-extension, chrome.storage (local + sync), chrome.runtime.sendMessage, CSS custom properties, SVG inline rendering

## Global Constraints

- Zero frameworks — pure HTML + CSS + vanilla TypeScript DOM manipulation
- No lit-html for vocab page (standalone tab, no Shadow DOM needed)
- No canvas/chart libraries — all charts via SVG or CSS grid
- Settings to `chrome.storage.sync`, data to `chrome.storage.local`
- `max-width: 860px` centered, `1px solid border` dividers, no shadows
- `prefers-reduced-motion` kills all animation and cursor effects
- No emoji — all icons are inline SVG with `stroke="currentColor"`
- Build via `vite-plugin-web-extension` with `additionalInputs: ['src/vocab/index.html']`

---

### Task 1: Update Shared Types

**Files:**
- Modify: `src/shared/types.ts`

**Interfaces:**
- Produces: `ReviewRecord`, updated `FavoriteWord` (adds `reviewHistory`, `learned`), `VocabSettings`

- [ ] **Step 1: Add ReviewRecord and VocabSettings, update FavoriteWord**

Append after the `GrammarAnalysis` interface in `src/shared/types.ts`:

```typescript
// 复习记录
export interface ReviewRecord {
  timestamp: number;   // 复习时间
  quality: number;     // 1/3/5 (不认识/模糊/认识)
  interval: number;    // 本次复习后安排的间隔(天)
}

// 生词本设置
export interface VocabSettings {
  cardFront: ('word' | 'phonetic' | 'context')[];
  cardBack: ('meaning' | 'pos' | 'examples' | 'context' | 'source')[];
  cardLayout: 'minimal' | 'context-first';
  dailyNewLimit: number;
  dailyReviewLimit: number;  // 0 = unlimited
  reviewReminder: boolean;
  goalCelebration: boolean;
}
```

Modify `FavoriteWord` interface — add `reviewHistory` and `learned` fields:

```typescript
export interface FavoriteWord {
  id: string;
  word: string;
  translation: TranslationResult;
  context?: string;
  sourceUrl: string;
  createdAt: number;
  reviewCount: number;
  lastReviewedAt: number;
  nextReviewAt: number;
  easeFactor: number;
  reviewHistory: ReviewRecord[];  // NEW — max 30 entries
  learned: boolean;               // NEW — first graduation flag
}
```

- [ ] **Step 2: Build to verify types**

```bash
npx tsc --noEmit
```

Expected: type errors about `reviewHistory` and `learned` being missing in worker/storage.ts and worker/index.ts (will be fixed in Tasks 3-4).

---

### Task 2: Update Shared Messages

**Files:**
- Modify: `src/shared/messages.ts`

**Interfaces:**
- Consumes: `ReviewRecord`, `VocabSettings` from Task 1
- Produces: 4 new request/response pairs + factory functions

- [ ] **Step 1: Add imports, new types, update unions, add factories**

Add `ReviewRecord, VocabSettings` to the import from `./types`. Then add 4 request interfaces and 4 response interfaces. Update `WorkerRequest` and `WorkerResponse` unions. Add `'WORD_HISTORY_RESULT'`, `'FORECAST_RESULT'`, `'FULL_STATS_RESULT'`, `'VOCAB_SETTINGS_RESULT'` to `RESPONSE_TYPES`. Add 4 factory functions. (Full code in spec section 9.)

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: type errors only from worker files about unimplemented handler cases.

---

### Task 3: Update Worker Storage

**Files:**
- Modify: `src/worker/storage.ts`

**Interfaces:**
- Consumes: `FavoriteWord` (updated), `VocabSettings` from Task 1
- Produces: `getVocabSettings()`, `saveVocabSettings()`

- [ ] **Step 1: Add vocab settings functions**

Add `VocabSettings` to imports. Add `DEFAULT_VOCAB_SETTINGS` constant and `getVocabSettings()` / `saveVocabSettings()` functions at end of file. (Full code in spec.)

- [ ] **Step 2: Build check**

```bash
cd /home/tofu/我的项目/TRANS && npx tsc --noEmit 2>&1 | grep storage
```

Expected: no errors from storage.ts.

---

### Task 4: Update Worker Handlers

**Files:**
- Modify: `src/worker/index.ts`

**Interfaces:**
- Consumes: `getVocabSettings`, `saveVocabSettings` from Task 3; updated messages from Task 2
- Produces: handlers for `GET_WORD_HISTORY`, `GET_FORECAST`, `GET_FULL_STATS`, `SAVE_VOCAB_SETTINGS`; updated `SUBMIT_REVIEW` (records history + learned flag) and `TOGGLE_FAVORITE` (initializes new fields)

- [ ] **Step 1: Update imports, TOGGLE_FAVORITE, SUBMIT_REVIEW, add 4 new handlers**

Update import from `./storage`. In `TOGGLE_FAVORITE`, add `reviewHistory: [], learned: false`. Rewrite `SUBMIT_REVIEW` to compute interval days, append to `reviewHistory` (max 30), set `learned` flag on first quality>=5 graduation. Add 4 new case handlers. (Full code in spec sections 4.3-4.4.)

- [ ] **Step 2: Full type check**

```bash
cd /home/tofu/我的项目/TRANS && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in worker files. Errors from `src/vocab/` are expected until later tasks.

---

### Task 5: Rewrite HTML & CSS

**Files:**
- Modify: `src/vocab/index.html` (full rewrite, ~350 lines)

**Interfaces:**
- Produces: DOM structure for all panels + settings drawer + osu! cursor/glow elements

- [ ] **Step 1: Write complete HTML**

Replace entire `src/vocab/index.html`. Key sections:
- GitHub Primer Dark CSS variables (matching spec section 2)
- Navigation bar CSS (`.nav`, `.nav-tab`, `.nav-tab.active`, `.nav-spacer`, `.nav-gear`)
- Panel container CSS (`.panel`, `.panel.active`)
- Settings drawer CSS (`.drawer-overlay`, `.drawer`, `.drawer.open`)
- Learn panel CSS (`.fc-word`, `.fc-phon`, `.fc-hint`, `.fc-reveal`, `.fc-card-inner`, `.exit-left`, `.enter-right`, `.rating-row`, `.rate-btn`)
- Browse panel CSS (`.word-card`, `.filter-pill`, `.status-dot`, `.card-context`, `.card-meta`)
- Stats panel CSS (`.stat-big-num`, `.calendar-grid`, `.calendar-cell`, `.forecast-row`, `.curve-svg-wrap`)
- Custom cursor CSS (`.custom-cursor`, `.custom-cursor.pressing`)
- Toast CSS (`.toast`, `.toast.show`)
- HTML body with all panel divs and required IDs

Required DOM IDs: `panel-learn`, `panel-browse`, `panel-stats`, `fc-word`, `fc-phon`, `fc-hint`, `fc-reveal`, `fc-inner`, `fc-pos`, `fc-meaning`, `fc-context`, `fc-meta`, `fc-session-info`, `rating-row`, `btn-unknown`, `btn-fuzzy`, `btn-known`, `review-progress`, `progress-fill`, `progress-text`, `review-done`, `done-title`, `done-desc`, `browse-toolbar`, `word-list`, `browse-empty`, `stats-overview`, `stats-calendar`, `stats-forecast`, `stats-curve`, `drawer-overlay`, `drawer`, `btn-settings`, `toast`, `custom-cursor`, `glow-canvas`, `back-to-browse`.

---

### Task 6: Create Utilities Module

**Files:**
- Create: `src/vocab/utils.ts`

**Interfaces:**
- Produces: `escapeHtml()`, `timeAgo()`, `formatDate()`, `extractHostname()`, `calcMastery()`, `sourceDotClass()`, `wordStatus()`, `showToast()`, `Icons` object, `ico()` helper

- [ ] **Step 1: Create utils.ts**

Write the utilities module with all helper functions. `calcMastery()` implements the mastery formula from spec section 6.5. `wordStatus()` classifies words as `'new' | 'learning' | 'mastered'`. `Icons` object contains all inline SVG strings (search, trash, copy, link, gear, check, arrowLeft, book, play, list, x). `ico()` wraps SVG in a span with class `.ico`.

---

### Task 7: Create State Module

**Files:**
- Create: `src/vocab/state.ts`

**Interfaces:**
- Consumes: `FavoriteWord`, `VocabSettings` from types; `FullStatsResponse` from messages
- Produces: `AppState`, `getState()`, `subscribe()`, `setPanel()`, `loadWords()`, `loadSettings()`, `loadFullStats()`, `saveSettings()`

- [ ] **Step 1: Create state.ts**

Write the reactive state module. `loadWords()` fetches favorites + due words in parallel. `loadSettings()` reads `vocabSettings` from `chrome.storage.sync` with defaults. `loadFullStats()` calls `GET_FULL_STATS`. `subscribe()` returns unsubscribe function. State changes notify all listeners.

---

### Task 8: Create Entry Point

**Files:**
- Modify: `src/vocab/index.ts` (overwrite existing)

**Interfaces:**
- Consumes: All modules from Tasks 6-7, panel modules from Tasks 9-12, cursor from Task 13
- Produces: Main `init()` — loads data, renders panels, sets up nav/panel switching, settings drawer open/close

- [ ] **Step 1: Write index.ts**

```typescript
import { getState, loadWords, loadSettings, loadFullStats, setPanel, subscribe } from './state';
import { renderLearn, mountLearn, unmountLearn } from './panels/learn';
import { renderBrowse, mountBrowse, unmountBrowse } from './panels/browse';
import { renderStats, mountStats, unmountStats } from './panels/stats';
import { renderSettings, mountSettings, unmountSettings, openDrawer, closeDrawer } from './panels/settings';
import { mountCursor, unmountCursor } from './effects/cursor';

const panelRenderers: Record<string, { render: () => void; mount: () => void; unmount: () => void }> = {
  learn: { render: renderLearn, mount: mountLearn, unmount: unmountLearn },
  browse: { render: renderBrowse, mount: mountBrowse, unmount: unmountBrowse },
  stats: { render: renderStats, mount: mountStats, unmount: unmountStats },
};

let currentPanel = 'learn';

function switchPanel(panel: string): void {
  if (currentPanel === panel) return;
  panelRenderers[currentPanel]?.unmount();
  document.getElementById(`panel-${currentPanel}`)?.classList.remove('active');
  document.querySelector(`.nav-tab[data-panel="${currentPanel}"]`)?.classList.remove('active');
  currentPanel = panel;
  setPanel(panel as any);
  document.getElementById(`panel-${panel}`)?.classList.add('active');
  document.querySelector(`.nav-tab[data-panel="${panel}"]`)?.classList.add('active');
  panelRenderers[panel]?.mount();
  panelRenderers[panel]?.render();
  if (panel === 'learn' || panel === 'stats') mountCursor(); else unmountCursor();
}

async function init(): Promise<void> {
  await Promise.all([loadWords(), loadSettings(), loadFullStats()]);
  renderLearn(); renderBrowse(); renderStats(); renderSettings();
  panelRenderers[currentPanel]?.mount();
  mountCursor();
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPanel((tab as HTMLElement).dataset.panel!));
  });
  document.getElementById('btn-settings')?.addEventListener('click', () => openDrawer());
  document.getElementById('drawer-overlay')?.addEventListener('click', () => closeDrawer());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
}

init();
```

---

### Task 9: Learn Panel

**Files:**
- Create: `src/vocab/panels/learn.ts`

**Interfaces:**
- Consumes: `getState`, `loadWords` from state; `escapeHtml`, `extractHostname`, `Icons`, `showToast` from utils
- Produces: `renderLearn()`, `mountLearn()`, `unmountLearn()`

- [ ] **Step 1: Create learn.ts**

Implement intra-session cycling review. Key logic:
- `buildQueue()` — creates queue from due words, respecting dailyNewLimit/dailyReviewLimit
- `showCard()` — renders current word, resets reveal state, pre-fills meaning/context
- `revealCard()` — triggered by flashcard area click, shows meaning + rating buttons
- `submitRating(quality)` — SM-2 submission + queue management:
  - quality 5 (认识): graduate unless previous fuzzy needs re-confirm
  - quality 3 (模糊): insert back at queue end (after 5 items)
  - quality 1 (不认识): if consecutive >= 3 or total >= 5, skip; else insert back (after 2-3 items)
- `showDoneState()` — graduation complete, show summary
- Card exit/enter animations: `.exit-left` → timeout 150ms → `.enter-right`

---

### Task 10: Browse Panel

**Files:**
- Create: `src/vocab/panels/browse.ts`

**Interfaces:**
- Consumes: `getState`, `loadWords` from state; utils
- Produces: `renderBrowse()`, `mountBrowse()`, `unmountBrowse()`

- [ ] **Step 1: Create browse.ts**

Word list with filter pills and search. Key logic:
- `renderBrowse()` — renders toolbar (search + filter pills + sort select) + word cards
- Filter pills show counts: 全部/新词/学习中/已掌握
- Cards show: word + phonetic + status dot + meanings + context (collapsible) + meta row with mastery %
- Event delegation for delete/copy/context-toggle on word list
- Card hover: `translateX(4px)` (css handles this)
- Status dot colors: green=mastered, yellow=learning, muted=new

---

### Task 11: Stats Panel

**Files:**
- Create: `src/vocab/panels/stats.ts`

**Interfaces:**
- Consumes: `getState`, `loadFullStats` from state; `calcMastery`, `formatDate`, `ico`, `Icons` from utils
- Produces: `renderStats()`, `mountStats()`, `unmountStats()`

- [ ] **Step 1: Create stats.ts**

Four rendering functions:
- `renderOverview(stats)` — 4 big numbers (total/learning/mastered/streak) + today progress bar
- `renderCalendar(stats)` — GitHub-style heatmap, CSS grid, 17 weeks x 7 days, 4-level color scale
- `renderForecast(stats)` — horizontal bars for next 7 days, >15 marked red
- `renderCurve()` — word chip selector + SVG memory curve with real dots (colored by quality) + dashed forecast line
- Curve SVG includes: grid lines, Y-axis labels (0-100%), polyline for real data, dashed polyline for forecast, colored dots
- Click on word chip switches the curve display

---

### Task 12: Settings Drawer

**Files:**
- Create: `src/vocab/panels/settings.ts`
- Create: `src/vocab/export.ts` (extracted from old index.ts)

**Interfaces:**
- Consumes: `getState`, `saveSettings`, `loadWords` from state; `showToast` from utils
- Produces: `renderSettings()`, `mountSettings()`, `unmountSettings()`, `openDrawer()`, `closeDrawer()`

- [ ] **Step 1: Create settings.ts**

Settings form in the drawer:
- Card template: checkboxes for cardFront/cardBack fields, radio for layout style
- Learning params: selects for dailyNewLimit (5-25) and dailyReviewLimit (20-100, 0=unlimited)
- Notifications: checkboxes for reviewReminder, goalCelebration
- Data: export CSV/JSON buttons, clear-all button with double confirm
- Save button reads all form values, calls `saveSettings()`, shows toast, closes drawer

- [ ] **Step 2: Create export.ts**

Extract `exportCSV()` and `exportJSON()` from old index.ts. Both use `getState().words` for data. CSV is Anki-compatible format. JSON includes all fields.

---

### Task 13: osu! Cursor Effects

**Files:**
- Create: `src/vocab/effects/cursor.ts`

**Interfaces:**
- Consumes: None
- Produces: `mountCursor()`, `unmountCursor()`

- [ ] **Step 1: Create cursor.ts**

Custom cursor + glow + trail:
- `mountCursor()` — show cursor div, show canvas, bind mousemove/mousedown/mouseup, start glow animation loop
- `unmountCursor()` — hide cursor/canvas, unbind events, cancel animation frame
- Mousemove: update cursor position, append to 25-point trail array
- Mousedown/up: toggle `.pressing` class (16px -> 24px)
- Glow loop: `requestAnimationFrame` — clear canvas, draw radial gradient at cursor position, draw trail polyline
- Respects `prefers-reduced-motion` — if set, `mountCursor` is a no-op

---

### Task 14: Build and Verify

**Files:**
- All files from Tasks 1-13

- [ ] **Step 1: Type check**

```bash
cd /home/tofu/我的项目/TRANS && npx tsc --noEmit 2>&1
```
Expected: zero errors.

- [ ] **Step 2: Full build**

```bash
cd /home/tofu/我的项目/TRANS && npm run build 2>&1
```
Expected: successful build.

- [ ] **Step 3: Verify dist structure**

```bash
ls /home/tofu/我的项目/TRANS/dist/src/vocab/
```
Expected: index.html exists.

- [ ] **Step 4: Visual review checklist**

Load the extension in Chrome, open the vocab page, verify:
- [ ] Navigation: three tabs switch panels correctly
- [ ] Learn: flashcard shows, click reveals meaning, 3 rating buttons work, wrong answers re-appear
- [ ] Browse: filter pills filter, search works, sort works, cards show status dots and mastery %
- [ ] Stats: overview numbers, calendar heatmap, forecast bars, memory curve with word selector
- [ ] Settings: drawer opens/closes, checkboxes and selects save, export works, clear-all works
- [ ] Cursor: custom cursor + glow visible on learn/stats panels, off on browse
- [ ] Dark theme: all colors are GitHub Primer Dark
- [ ] No emoji anywhere
