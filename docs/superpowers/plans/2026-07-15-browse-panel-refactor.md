# Browse Panel 6-Feature Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add star/pin, notes, pronunciation, review-sort+due-date, example carousel, and color tweaks to the browse panel.

**Architecture:** Each feature adds a field or two to `FavoriteWord`, a message pair for persistence, a handler in the worker, and UI in `renderCard()` + click handler in `wordListClick`. No new files — all changes in existing modules.

**Tech Stack:** TypeScript, Chrome Extension Manifest V3, Sayo UI CSS framework, Vite build

## Global Constraints

- Strict sequential order: Feature 1 → 2 → 3 → 4 → 5 → 6
- `npm run build` must succeed after each feature
- No emoji — use custom SVG icons in `src/vocab/utils.ts`
- Do NOT modify: content script, learn panel, stats panel, settings drawer, Sayo UI framework, FSRS scheduler
- Follow existing code patterns: `ico(Icons.xxx)` for icons, `chrome.runtime.sendMessage()` for worker comm, `escapeHtml()` for user data
- New fields default so existing data survives: `starred: false`, `note: ""`

---

### Task 1: Star (Pin) Feature

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/messages.ts`
- Modify: `src/vocab/utils.ts`
- Modify: `src/worker/index.ts`
- Modify: `src/vocab/panels/browse.ts`
- Modify: `src/vocab/index.html`
- Modify: `src/vocab/style.css`

**Interfaces:**
- Consumes: `FavoriteWord` type, `Icons` map, `ico()` helper, `updateFavorite()` from storage
- Produces: `FavoriteWord.starred`, `STAR_WORD`/`STAR_RESULT` messages, `Icons.star`/`Icons.starFilled`, star button in `renderCard()`, `starred` sort option

- [ ] **Step 1: Add `starred` to FavoriteWord type**

In `src/shared/types.ts`, add `starred: boolean` to the `FavoriteWord` interface, after `learned`:

```ts
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
  reviewHistory: ReviewRecord[];
  learned: boolean;
  starred: boolean;          // <-- ADD
}
```

- [ ] **Step 2: Add STAR_WORD message types**

In `src/shared/messages.ts`, add after `SaveVocabSettingsRequest`:

```ts
export interface StarWordRequest {
  type: 'STAR_WORD';
  wordId: string;
  starred: boolean;
}

export interface UpdateNoteRequest {
  type: 'UPDATE_NOTE';
  wordId: string;
  note: string;
}
```

Add to `WorkerRequest` union:
```ts
export type WorkerRequest =
  | TranslateRequest
  // ... existing ...
  | SaveVocabSettingsRequest
  | StarWordRequest        // <-- ADD
  | UpdateNoteRequest;     // <-- ADD (seed for Task 2)
```

Add response types after `VocabSettingsResponse`:
```ts
export interface StarWordResponse {
  type: 'STAR_RESULT';
  wordId: string;
  starred: boolean;
}

export interface UpdateNoteResponse {
  type: 'NOTE_RESULT';
  wordId: string;
  note: string;
}
```

Add to `WorkerResponse` union and `RESPONSE_TYPES` array:
```ts
export type WorkerResponse =
  | TranslateResponse
  // ... existing ...
  | VocabSettingsResponse
  | StarWordResponse        // <-- ADD
  | UpdateNoteResponse;     // <-- ADD

const RESPONSE_TYPES: WorkerResponse['type'][] = [
  'TRANSLATE_RESULT', 'TRANSLATE_ERROR', 'SPEAK_RESULT',
  'FAVORITE_RESULT', 'HISTORY_RESULT', 'FAVORITES_RESULT', 'SETTINGS_RESULT',
  'SOURCES_RESULT',
  'GRAMMAR_RESULT', 'GRAMMAR_ERROR',
  'REVIEW_RESULT', 'DUE_WORDS_RESULT', 'LEARN_STATS_RESULT',
  'WORD_HISTORY_RESULT', 'FORECAST_RESULT', 'FULL_STATS_RESULT', 'VOCAB_SETTINGS_RESULT',
  'STAR_RESULT', 'NOTE_RESULT',   // <-- ADD
];
```

- [ ] **Step 3: Add star SVG icons**

In `src/vocab/utils.ts`, add to the `Icons` record:

```ts
star: svg('<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.86L12 18.56 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"/>'),
starFilled: svg('<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.86L12 18.56 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" stroke="none"/>'),
```

- [ ] **Step 4: Route STAR_WORD in worker/index.ts**

Add import:
```ts
import { handleSubmitReview, handleGetDueWords, handleGetLearnStats, handleGetWordHistory } from './handlers/review';
import { handleStarWord } from './handlers/favorites';  // update existing import line
```

Wait — `handleToggleFavorite`, `handleRemoveFavorite`, `handleGetFavorites` are currently imported? Let me check... Actually looking at worker/index.ts, the favorites handlers are NOT imported — the logic is inline in the switch statement. Looking at the current code in worker/index.ts:

```ts
case 'TOGGLE_FAVORITE': { ... inline ... }
case 'REMOVE_FAVORITE': { await removeFavorite(req.id); ... }
case 'GET_FAVORITES': { const words = await getFavorites(); ... }
```

So the favorites logic is inline. For `STAR_WORD`, let me also keep it inline for consistency. Actually no — `src/worker/handlers/favorites.ts` already has `handleToggleFavorite`, `handleRemoveFavorite`, `handleGetFavorites` exported but they're NOT used in `worker/index.ts` — the logic is duplicated inline. Let me keep my new handler in the handler file (for organization) but add the routing inline in the switch statement to match the existing pattern.

In `src/worker/index.ts`, add to the switch statement after `case 'REMOVE_FAVORITE'`:

```ts
case 'STAR_WORD': {
  await updateFavorite(req.wordId, { starred: req.starred });
  return { type: 'STAR_RESULT', wordId: req.wordId, starred: req.starred };
}
```

Also add `updateFavorite` to the imports from `'./storage'`:
```ts
import {
  getHistory, addHistory,
  getFavorites, addFavorite, removeFavorite, isFavorite, updateFavorite,
  getDueWords,
  getSettings, saveSettings,
  saveVocabSettings,
} from './storage';
```

Currently `updateFavorite` is NOT imported in `worker/index.ts`. Let me check:

```
import {
  getHistory, addHistory,
  getFavorites, addFavorite, removeFavorite, isFavorite,
  getDueWords,
  getSettings, saveSettings,
  saveVocabSettings,
} from './storage';
```

Yes, need to add `updateFavorite` to this import.

- [ ] **Step 5: Add star button to renderCard() in browse.ts**

In `src/vocab/panels/browse.ts`, modify `renderCard()`:

Change the card-head section from:
```ts
<div class="syo-flex card-head" style="gap:8px">
  <span class="syo-tag-dot${status === 'mastered' ? ' syo-tag-dot--success' : status === 'learning' ? ' syo-tag-dot--warning' : ''} status-dot ${status}"></span>
  <span class="word">${escapeHtml(word.word)}</span>
```

To:
```ts
<div class="syo-flex card-head" style="gap:8px">
  <span class="syo-tag-dot${status === 'mastered' ? ' syo-tag-dot--success' : status === 'learning' ? ' syo-tag-dot--warning' : ''} status-dot ${status}"></span>
  <button class="syo-btn syo-btn--ghost act-btn star-btn${word.starred ? ' starred' : ''}" data-action="star" title="${word.starred ? '取消星标' : '星标'}">${ico(word.starred ? Icons.starFilled : Icons.star)}</button>
  <span class="word">${escapeHtml(word.word)}</span>
```

Also change the word-card div to add starred class:
```ts
return `<div class="syo-card word-card${word.starred ? ' starred' : ''}" data-id="${escapeHtml(word.id)}">
```

- [ ] **Step 6: Add star click handler**

In `wordListClick` in `mountBrowse()`, add BEFORE the delete button check:

```ts
if (target.closest('.star-btn')) {
  const btn = target.closest('.star-btn') as HTMLElement;
  const newStarred = !btn.classList.contains('starred');
  try {
    await chrome.runtime.sendMessage({ type: 'STAR_WORD', wordId: id, starred: newStarred });
  } catch { /* */ }
  await loadWords();
  renderBrowse();
  return;
}
```

- [ ] **Step 7: Add "starred" sort option**

In `getFiltered()`, add to the switch:
```ts
case 'starred':
  sorted.sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
  break;
```

In `src/vocab/index.html`, add to the sort select:
```html
<option value="starred">星标优先</option>
```

Add it as the first option for prominence:
```html
<select class="syo-select sort-select" id="sort-select">
  <option value="newest">最新添加</option>
  <option value="starred">星标优先</option>
  <option value="oldest">最早添加</option>
  ...
```

- [ ] **Step 8: Add star CSS**

In `src/vocab/style.css`, add after `.card-body .meanings` block:

```css
/* ── Star button ─────────────────────────────────────────── */
.star-btn {
  color: var(--syo-fg-muted);
  transition: color 180ms var(--syo-ease-out), transform 180ms var(--syo-ease-out);
}

.star-btn:hover {
  color: var(--syo-warning);
  transform: scale(1.15);
}

.star-btn.starred {
  color: var(--syo-warning);
}

/* ── Starred card ────────────────────────────────────────── */
.word-card.starred {
  border-left: 3px solid var(--syo-warning);
}
```

- [ ] **Step 9: Build and verify**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add src/shared/types.ts src/shared/messages.ts src/vocab/utils.ts src/worker/index.ts src/vocab/panels/browse.ts src/vocab/index.html src/vocab/style.css
git commit -m "feat(browse): add star/pin feature with sort option"
```

---

### Task 2: Notes Feature

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/worker/index.ts`
- Modify: `src/vocab/utils.ts`
- Modify: `src/vocab/panels/browse.ts`
- Modify: `src/vocab/style.css`

**Interfaces:**
- Consumes: `FavoriteWord.starred` (Task 1), `UPDATE_NOTE` message types (seeded in Task 1), `Icons.note`, `updateFavorite()`
- Produces: `FavoriteWord.note`, `handleUpdateNote` routing, note UI in `renderCard()`, note search scope, note edit handlers

Note: `UPDATE_NOTE`/`NOTE_RESULT` message types and `UpdateNoteRequest`/`UpdateNoteResponse` were already added to `messages.ts` in Task 1. The `WorkerRequest` union already includes `UpdateNoteRequest`.

- [ ] **Step 1: Add `note` to FavoriteWord type**

In `src/shared/types.ts`, add after `starred`:

```ts
export interface FavoriteWord {
  // ... existing fields ...
  starred: boolean;
  note: string;              // <-- ADD
}
```

- [ ] **Step 2: Add note SVG icon**

In `src/vocab/utils.ts`, add to the `Icons` record:

```ts
note: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>'),
```

- [ ] **Step 3: Route UPDATE_NOTE in worker/index.ts**

In `src/worker/index.ts`, add to the switch statement:

```ts
case 'UPDATE_NOTE': {
  await updateFavorite(req.wordId, { note: req.note });
  return { type: 'NOTE_RESULT', wordId: req.wordId, note: req.note };
}
```

- [ ] **Step 4: Add note UI to renderCard() in browse.ts**

In `renderCard()`, after the meanings div and before the context div, add:

```ts
<div class="meanings">${meaningHtml}</div>
${word.note
  ? `<div class="card-note" data-action="edit-note">
       <span class="note-indicator">${ico(Icons.note)}</span>
       <span class="note-text">${escapeHtml(word.note)}</span>
     </div>`
  : `<div class="card-note card-note--empty" data-action="edit-note">
       <span class="note-add-hint">添加备注...</span>
     </div>`}
${word.context ? `<div class="card-context" ...>` : ''}
```

Also add a small note icon next to the word for words that have notes. Change the word span line to:

```ts
<span class="word">${escapeHtml(word.word)}${word.note ? `<span class="has-note-icon">${ico(Icons.note)}</span>` : ''}</span>
```

- [ ] **Step 5: Add note to search scope**

In `getFiltered()`, modify the search filter block. Find:
```ts
if (q) {
  filtered = filtered.filter(w => {
    if (w.word.toLowerCase().includes(q)) return true;
    if (w.translation.text.toLowerCase().includes(q)) return true;
    if (w.translation.partsOfSpeech) {
      for (const p of w.translation.partsOfSpeech) {
        for (const m of p.meanings) {
          if (m.toLowerCase().includes(q)) return true;
        }
      }
    }
    return false;
  });
}
```

Add the note check:
```ts
if (q) {
  filtered = filtered.filter(w => {
    if (w.word.toLowerCase().includes(q)) return true;
    if (w.translation.text.toLowerCase().includes(q)) return true;
    if (w.note && w.note.toLowerCase().includes(q)) return true;  // <-- ADD
    if (w.translation.partsOfSpeech) {
      // ... existing ...
    }
    return false;
  });
}
```

- [ ] **Step 6: Add note edit handler**

In `wordListClick` in `mountBrowse()`, add before the delete button check:

```ts
if (target.closest('[data-action="edit-note"]')) {
  const noteEl = target.closest('.card-note') as HTMLElement;
  const cardEl = target.closest('.word-card') as HTMLElement;
  if (!noteEl || !cardEl) return;

  // Get current note from state
  const { words } = getState();
  const word = words.find(w => w.id === id);
  const currentNote = word?.note ?? '';

  // Replace note display with editor
  noteEl.classList.add('card-note--editing');
  noteEl.innerHTML = `
    <textarea class="note-textarea" rows="3" placeholder="输入备注...">${escapeHtml(currentNote)}</textarea>
    <div class="note-actions">
      <button class="syo-btn syo-btn--sm note-save-btn">保存</button>
      <button class="syo-btn syo-btn--sm syo-btn--ghost note-cancel-btn">取消</button>
    </div>
  `;
  const textarea = noteEl.querySelector('.note-textarea') as HTMLTextAreaElement;
  textarea?.focus();

  // Save handler
  noteEl.querySelector('.note-save-btn')?.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const newNote = textarea?.value ?? '';
    try {
      await chrome.runtime.sendMessage({ type: 'UPDATE_NOTE', wordId: id, note: newNote });
    } catch { /* */ }
    await loadWords();
    renderBrowse();
  });

  // Cancel handler
  noteEl.querySelector('.note-cancel-btn')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    renderBrowse();
  });

  return;
}
```

- [ ] **Step 7: Add note CSS**

In `src/vocab/style.css`, add after the `.card-body .meanings` block:

```css
/* ── Note ────────────────────────────────────────────────── */
.card-note {
  margin-bottom: 8px;
  padding: 6px 10px;
  border-radius: var(--syo-radius-sm);
  background: var(--syo-bg-elevated);
  font-size: var(--text-sm);
  color: var(--syo-fg-muted);
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  transition: background 180ms var(--syo-ease-out);
}

.card-note:hover {
  background: var(--syo-border-muted);
}

.card-note--empty {
  font-style: italic;
  opacity: .6;
}

.card-note--editing {
  flex-direction: column;
  cursor: default;
  padding: 8px 10px;
}

.note-indicator {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--syo-fg-muted);
  margin-top: 1px;
}

.note-text {
  line-height: 1.5;
  word-break: break-word;
}

.note-add-hint {
  line-height: 1.5;
}

.note-textarea {
  width: 100%;
  padding: 8px 10px;
  background: var(--syo-bg-base);
  border: 1px solid var(--syo-border);
  border-radius: var(--syo-radius-sm);
  color: var(--syo-fg-body);
  font-size: var(--text-sm);
  font-family: var(--font-body);
  line-height: 1.5;
  resize: vertical;
  min-height: 60px;
  outline: none;
  transition: border-color 180ms var(--syo-ease-out);
}

.note-textarea:focus {
  border-color: var(--syo-accent);
}

.note-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  margin-top: 6px;
}

.note-save-btn {
  padding: 4px 14px;
  font-size: var(--text-sm);
}

.note-cancel-btn {
  padding: 4px 14px;
  font-size: var(--text-sm);
}

/* ── Note indicator next to word ─────────────────────────── */
.has-note-icon {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  color: var(--syo-fg-muted);
  margin-left: 2px;
  opacity: .6;
}
```

- [ ] **Step 8: Build and verify**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add src/shared/types.ts src/worker/index.ts src/vocab/utils.ts src/vocab/panels/browse.ts src/vocab/style.css
git commit -m "feat(browse): add notes feature with inline edit and search"
```

---

### Task 3: Card Pronunciation

**Files:**
- Modify: `src/vocab/utils.ts`
- Modify: `src/vocab/panels/browse.ts`
- Modify: `src/vocab/style.css`

**Interfaces:**
- Consumes: `Icons.volume`, `SPEAK` message (existing)
- Produces: Speak button in `renderCard()`, speak click handler

- [ ] **Step 1: Add volume SVG icon**

In `src/vocab/utils.ts`, add to the `Icons` record:

```ts
volume: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>'),
```

- [ ] **Step 2: Add speak button to renderCard()**

In `renderCard()`, add a speak button between the word span and the phonetic span in the card-head. Change:

```ts
<span class="word">${escapeHtml(word.word)}${word.note ? ... : ''}</span>
${phonetic ? `<span class="phon">${phonetic}</span>` : ''}
```

To:

```ts
<span class="word">${escapeHtml(word.word)}${word.note ? ... : ''}</span>
<button class="syo-btn syo-btn--ghost act-btn speak-btn" data-action="speak" title="发音">${ico(Icons.volume)}</button>
${phonetic ? `<span class="phon">${phonetic}</span>` : ''}
```

- [ ] **Step 3: Add speak click handler**

In `wordListClick` in `mountBrowse()`, add:

```ts
if (target.closest('[data-action="speak"]')) {
  e.stopPropagation();
  chrome.runtime.sendMessage({ type: 'SPEAK', text: word.word, lang: 'en' });
  return;
}
```

We need the word text, not just the ID. We can get it from the card's dataset or from state. Let me use state lookup since we already have `id`:

Actually, looking at the current handler, `id` is extracted from `card.dataset.id` at the top. Let me also get the word object. The simplest approach: get word from state inside the handler.

```ts
if (target.closest('[data-action="speak"]')) {
  e.stopPropagation();
  const { words } = getState();
  const w = words.find(w => w.id === id);
  if (w) {
    chrome.runtime.sendMessage({ type: 'SPEAK', text: w.word, lang: 'en' });
  }
  return;
}
```

- [ ] **Step 4: Add speak button CSS**

In `src/vocab/style.css`, add after star button styles:

```css
/* ── Speak button ────────────────────────────────────────── */
.speak-btn {
  color: var(--syo-fg-muted);
  transition: color 180ms var(--syo-ease-out), transform 180ms var(--syo-ease-out);
  flex-shrink: 0;
  padding: 0;
}

.speak-btn:hover {
  color: var(--syo-accent);
  transform: scale(1.1);
}
```

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/vocab/utils.ts src/vocab/panels/browse.ts src/vocab/style.css
git commit -m "feat(browse): add pronunciation button on word cards"
```

---

### Task 4: Next Review Sort + Due Date Display

**Files:**
- Modify: `src/vocab/panels/browse.ts`
- Modify: `src/vocab/index.html`
- Modify: `src/vocab/style.css`

**Interfaces:**
- Consumes: `FavoriteWord.nextReviewAt`, `wordStatus()` helper, `calcMastery()` helper
- Produces: `next-review` sort option, due date label in `renderCard()`

- [ ] **Step 1: Add formatDueDate helper in browse.ts**

In `src/vocab/panels/browse.ts`, add a helper function near the top (after `getFiltered` and before `renderBrowse`):

```ts
function formatDueDate(word: FavoriteWord): { text: string; urgent: boolean } {
  if (wordStatus(word) === 'mastered') return { text: '已掌握', urgent: false };
  if (word.nextReviewAt === 0) return { text: '', urgent: false };
  const now = Date.now();
  const urgent = word.nextReviewAt <= now;
  const d = new Date(word.nextReviewAt);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return { text: `下次复习：${month}月${day}日`, urgent };
}
```

- [ ] **Step 2: Add "next-review" sort option**

In `getFiltered()`, add to the switch:

```ts
case 'next-review':
  sorted.sort((a, b) => {
    if (a.nextReviewAt === 0 && b.nextReviewAt === 0) return b.createdAt - a.createdAt;
    if (a.nextReviewAt === 0) return 1;
    if (b.nextReviewAt === 0) return -1;
    return a.nextReviewAt - b.nextReviewAt;
  });
  break;
```

In `src/vocab/index.html`, add to sort select:

```html
<option value="next-review">下次复习</option>
```

Place it after "最近复习":
```html
<option value="last-reviewed">最近复习</option>
<option value="next-review">下次复习</option>
```

- [ ] **Step 3: Add due date display to renderCard()**

In `renderCard()`, add a due date span in the card-meta div, before the mastery span:

Change:
```ts
<div class="card-meta">
  <span class="src-dot ..."></span>
  <span>...</span>
  ${hostname ? ... : ''}
  <span class="card-mastery" ...>${mastery}%</span>
  <button class="act-btn curve-toggle" ...>...</button>
</div>
```

To:
```ts
<div class="card-meta">
  <span class="src-dot ..."></span>
  <span>...</span>
  ${hostname ? ... : ''}
  ${(() => {
    const due = formatDueDate(word);
    return due.text ? `<span class="due-date${due.urgent ? ' due-date--urgent' : ''}">${due.text}</span>` : '';
  })()}
  <span class="card-mastery" ...>${mastery}%</span>
  <button class="act-btn curve-toggle" ...>...</button>
</div>
```

- [ ] **Step 4: Add due date CSS**

In `src/vocab/style.css`, add after card-mastery styles:

```css
/* ── Due date ────────────────────────────────────────────── */
.due-date {
  font-family: var(--syo-font-mono);
  font-size: var(--text-micro);
  color: var(--syo-fg-muted);
  white-space: nowrap;
}

.due-date--urgent {
  color: var(--syo-warning);
}
```

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/vocab/panels/browse.ts src/vocab/index.html src/vocab/style.css
git commit -m "feat(browse): add next-review sort and due date display"
```

---

### Task 5: Example Sentences Carousel

**Files:**
- Modify: `src/vocab/panels/browse.ts`
- Modify: `src/vocab/style.css`

**Interfaces:**
- Consumes: `word.context`, `word.translation.examples[]`, `word.translation.source`, `.syo-inertia` from Sayo UI
- Produces: Carousel rendering in expanded `.card-context`

- [ ] **Step 1: Add carousel render helper in browse.ts**

Add a helper function near `formatDueDate`:

```ts
function renderExampleCarousel(word: FavoriteWord): string {
  const examples = word.translation.examples?.length ? word.translation.examples : [];
  const hasContext = !!(word.context);
  const hasExamples = !!(examples.length);
  const sourceLabel = word.translation.source || '例句';

  if (!hasContext && !hasExamples) return '';

  let html = `<div class="ctx-source-label">${escapeHtml(sourceLabel)} · 例句</div>`;
  html += '<div class="syo-inertia ctx-carousel" data-syo-inertia style="padding-bottom:8px">';

  if (hasContext) {
    html += `<article class="syo-card ctx-card">
      <div class="syo-card-head"><h3 class="syo-card-title">原文</h3></div>
      <p class="syo-card-desc">${escapeHtml(word.context!)}</p>
    </article>`;
  }

  if (hasExamples) {
    for (const ex of examples) {
      html += `<article class="syo-card ctx-card">
        <div class="syo-card-head"><h3 class="syo-card-title">${escapeHtml(ex.original)}</h3></div>
        <p class="syo-card-desc">${escapeHtml(ex.translated)}</p>
      </article>`;
    }
  }

  html += '</div>';
  return html;
}
```

- [ ] **Step 2: Modify card-context click to toggle carousel**

In `renderCard()`, change the context div. The card-context now stores the carousel HTML but initially renders in truncated mode:

```ts
${word.context || (word.translation.examples?.length)
  ? `<div class="card-context" tabindex="0" role="button" data-expanded="false" data-has-carousel="${word.context || (word.translation.examples?.length) ? '1' : '0'}">
       <div class="ctx-collapsed">${escapeHtml(word.context || word.translation.examples?.[0]?.original || '')}</div>
       <svg class="ctx-chevron" width="12" height="12" viewBox="0 0 12 12"><path d="M3 5l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
     </div>`
  : ''}
```

Wait, this changes the behavior significantly. Let me think more carefully...

The current behavior is simple: `word.context` text truncated to 2 lines, click expands. The new behavior should be: when collapsed, show `word.context` truncated; when expanded, show carousel with context + examples.

The problem is that `card-context` currently only shows `word.context` (the original context from the webpage). But we want it to also show examples. And the `ctx-collapsed` should show the context text for the collapsed state.

Actually, let me re-think. The collapsed state should be the same as current (truncated context text). The expanded state should be the carousel. Let me handle this differently:

In renderCard(), keep the collapsed display as before but add the carousel content in a hidden div. Then on expand, hide the collapsed text and show the carousel.

Actually, the simplest approach: render the card-context div with TWO children — the collapsed text (visible) and the carousel (hidden). On click, toggle visibility.

```ts
${(word.context || word.translation.examples?.length)
  ? `<div class="card-context" tabindex="0" role="button" data-expanded="false">
       <div class="ctx-collapsed">${escapeHtml(word.context || '')}<svg class="ctx-chevron" width="12" height="12" viewBox="0 0 12 12"><path d="M3 5l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg></div>
       <div class="ctx-carousel-wrap" style="display:none">${renderExampleCarousel(word)}</div>
     </div>`
  : ''}
```

Then in the click handler, when expanding:
1. Hide `.ctx-collapsed`
2. Show `.ctx-carousel-wrap`
3. Activate syo-inertia on the carousel

When collapsing:
1. Show `.ctx-collapsed`
2. Hide `.ctx-carousel-wrap`

- [ ] **Step 3: Update card-context click handler**

In `wordListClick`, modify the card-context handler:

```ts
if (target.closest('.card-context')) {
  const ctx = target.closest('.card-context') as HTMLElement;
  const expanded = ctx.dataset.expanded === 'true';
  ctx.dataset.expanded = String(!expanded);

  const collapsed = ctx.querySelector('.ctx-collapsed') as HTMLElement;
  const carouselWrap = ctx.querySelector('.ctx-carousel-wrap') as HTMLElement;

  if (!expanded) {
    // Expanding
    if (collapsed) collapsed.style.display = 'none';
    if (carouselWrap) {
      carouselWrap.style.display = '';
      // Activate syo-inertia
      carouselWrap.querySelectorAll('[data-syo-inertia]').forEach(el => {
        if (!(el as any)._syoInertia) {
          (el as any)._syoInertia = (window as any).Sayo?.inertiaScroll?.init(el);
        }
      });
    }
    ctx.classList.add('expanded');
  } else {
    // Collapsing
    if (collapsed) collapsed.style.display = '';
    if (carouselWrap) carouselWrap.style.display = 'none';
    ctx.classList.remove('expanded');
  }
  return;
}
```

- [ ] **Step 4: Add carousel CSS**

In `src/vocab/style.css`, update the `.card-context` styles and add carousel styles.

Replace the existing `.card-context` block:
```css
.card-context {
  border-left: 2px solid var(--syo-warning);
  padding: 8px 12px;
  border-radius: 0 var(--syo-radius-sm) var(--syo-radius-sm) 0;
  font-size: var(--text-sm);
  font-style: italic;
  color: var(--syo-fg-muted);
  line-height: 1.5;
  margin-bottom: 8px;
  cursor: pointer;
  overflow: hidden;
  transition: background 180ms var(--syo-ease-out);
}
```

Keep it but add the collapsed-specific styles to `.ctx-collapsed`:
```css
.card-context {
  margin-bottom: 8px;
  cursor: pointer;
}

.ctx-collapsed {
  border-left: 2px solid var(--syo-warning);
  padding: 8px 12px;
  border-radius: 0 var(--syo-radius-sm) var(--syo-radius-sm) 0;
  font-size: var(--text-sm);
  font-style: italic;
  color: var(--syo-fg-muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: background 180ms var(--syo-ease-out);
}

.ctx-collapsed:hover {
  background: var(--syo-bg-elevated);
}

/* ── Carousel cards ──────────────────────────────────────── */
.ctx-source-label {
  font-family: var(--syo-font-mono);
  font-size: var(--text-micro);
  color: var(--syo-fg-muted);
  letter-spacing: .06em;
  margin-bottom: 8px;
}

.ctx-carousel-wrap {
  padding-top: 4px;
}

.ctx-card {
  width: 260px;
  margin-right: 12px;
  flex-shrink: 0;
}
```

Remove the old `.card-context` hover and expanded rules since they move to `.ctx-collapsed`:
```css
/* Remove these old rules */
.card-context:hover { ... }
.card-context.expanded { ... }
```

Update the ctx-chevron rule:
```css
.ctx-chevron {
  display: inline-block;
  margin-left: 4px;
  transition: transform 200ms var(--syo-ease-out);
  vertical-align: middle;
  color: var(--syo-fg-muted);
}

.card-context.expanded .ctx-chevron {
  transform: rotate(180deg);
}
```

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/vocab/panels/browse.ts src/vocab/style.css
git commit -m "feat(browse): add example sentence carousel on expand"
```

---

### Task 6: POS & Phonetic Color Changes

**Files:**
- Modify: `src/vocab/style.css`

**Interfaces:**
- Consumes: `.pos-tag`, `.card-head .phon` CSS selectors
- Produces: Color overrides

- [ ] **Step 1: Change POS tag color**

In `src/vocab/style.css`, find the `.pos-tag` block and add color:

```css
.pos-tag {
  font-size: var(--text-micro);
  margin-right: 6px;
  color: var(--syo-accent);  /* <-- ADD: purple for POS tags */
}
```

- [ ] **Step 2: Change phonetic color**

In `src/vocab/style.css`, find `.card-head .phon` and add color:

```css
.card-head .phon {
  font-family: var(--syo-font-mono);
  font-size: var(--text-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--syo-info);  /* <-- ADD: blue for phonetic */
}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/vocab/style.css
git commit -m "style(browse): POS tag accent color, phonetic info color"
```

---

## Summary

| Task | Feature | Files Changed | Commits |
|------|---------|---------------|---------|
| 1 | Star/Pin | 8 | 1 |
| 2 | Notes | 5 | 1 |
| 3 | Pronunciation | 3 | 1 |
| 4 | Review Sort + Due Date | 3 | 1 |
| 5 | Example Carousel | 2 | 1 |
| 6 | POS/Phonetic Colors | 1 | 1 |
| **Total** | — | **8 unique files** | **6 commits** |
