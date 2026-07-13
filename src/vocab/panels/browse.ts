import type { FavoriteWord } from '../../shared/types';
import { getState, loadWords } from '../state';
import { escapeHtml, extractHostname, sourceDotClass, wordStatus, calcMastery, Icons, ico, showToast } from '../utils';

// ── Module-level state ──

let currentFilter = 'all';
let currentSort = 'newest';
let searchQuery = '';

// ── Filtering & sorting ──

function getFiltered(): FavoriteWord[] {
  const { words } = getState();
  let filtered = words;

  if (currentFilter !== 'all') {
    filtered = words.filter(w => wordStatus(w) === currentFilter);
  }

  const q = searchQuery.trim().toLowerCase();
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

  const sorted = [...filtered];
  switch (currentSort) {
    case 'newest': sorted.sort((a, b) => b.createdAt - a.createdAt); break;
    case 'oldest': sorted.sort((a, b) => a.createdAt - b.createdAt); break;
    case 'alpha-asc': sorted.sort((a, b) => a.word.localeCompare(b.word)); break;
    case 'alpha-desc': sorted.sort((a, b) => b.word.localeCompare(a.word)); break;
    case 'last-reviewed': sorted.sort((a, b) => b.lastReviewedAt - a.lastReviewedAt); break;
    case 'mastery': sorted.sort((a, b) => calcMastery(b) - calcMastery(a)); break;
  }

  return sorted;
}

// ── Render ──

export function renderBrowse(): void {
  const toolbar = document.getElementById('browse-toolbar');
  const wordList = document.getElementById('word-list');
  const emptyEl = document.getElementById('browse-empty');
  if (!toolbar || !wordList || !emptyEl) return;

  const { words } = getState();

  const total = words.length;
  const newCount = words.filter(w => wordStatus(w) === 'new').length;
  const learningCount = words.filter(w => wordStatus(w) === 'learning').length;
  const masteredCount = words.filter(w => wordStatus(w) === 'mastered').length;

  const countAll = document.getElementById('count-all');
  const countNew = document.getElementById('count-new');
  const countLearning = document.getElementById('count-learning');
  const countMastered = document.getElementById('count-mastered');
  if (countAll) countAll.textContent = String(total);
  if (countNew) countNew.textContent = String(newCount);
  if (countLearning) countLearning.textContent = String(learningCount);
  if (countMastered) countMastered.textContent = String(masteredCount);

  toolbar.querySelectorAll('.filter-pill').forEach(pill => {
    const filter = (pill as HTMLElement).dataset.filter;
    pill.classList.toggle('active', filter === currentFilter);
  });

  const sortSelect = document.getElementById('sort-select') as HTMLSelectElement | null;
  if (sortSelect) sortSelect.value = currentSort;

  const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
  if (searchInput && searchInput.value !== searchQuery) {
    searchInput.value = searchQuery;
  }

  const filtered = getFiltered();

  if (filtered.length === 0) {
    wordList.innerHTML = '';
    emptyEl.classList.add('visible');
    return;
  }
  emptyEl.classList.remove('visible');

  wordList.innerHTML = filtered.map(word => renderCard(word)).join('');
}

function renderCard(word: FavoriteWord): string {
  const status = wordStatus(word);
  const mastery = calcMastery(word);
  let masteryColor = 'var(--fg-muted)';
  if (mastery >= 80) masteryColor = 'var(--accent-success)';
  else if (mastery >= 40) masteryColor = 'var(--accent-warning)';

  let meaningHtml: string;
  if (word.translation.partsOfSpeech?.length) {
    meaningHtml = word.translation.partsOfSpeech.map(p =>
      `<span class="pos-tag">${escapeHtml(p.type)}</span>${escapeHtml(p.meanings.join('；'))}`
    ).join('<br>');
  } else {
    meaningHtml = escapeHtml(word.translation.text);
  }

  const phonetic = word.translation.phonetic ? `/${escapeHtml(word.translation.phonetic)}/` : '';
  const hostname = word.sourceUrl ? extractHostname(word.sourceUrl) : '';

  return `<div class="word-card" data-id="${escapeHtml(word.id)}">
    <div class="card-body">
      <div class="card-head">
        <span class="status-dot ${status}"></span>
        <span class="word">${escapeHtml(word.word)}</span>
        ${phonetic ? `<span class="phon">${phonetic}</span>` : ''}
        <div class="card-actions">
          <button class="act-btn copy-btn" title="复制单词">${ico(Icons.copy)}</button>
          <button class="act-btn delete-btn" title="删除">${ico(Icons.trash)}</button>
        </div>
      </div>
      <div class="meanings">${meaningHtml}</div>
      ${word.context ? `<div class="card-context" data-expanded="false">${escapeHtml(word.context)}</div>` : ''}
      <div class="card-meta">
        <span class="src-dot ${sourceDotClass(word.translation.sourceId)}"></span>
        <span>${escapeHtml(word.translation.source)}</span>
        ${hostname ? `<a class="src-link" href="${escapeHtml(word.sourceUrl)}" target="_blank">${ico(Icons.link)}${escapeHtml(hostname)}</a>` : ''}
        <span class="card-mastery" style="color:${masteryColor}">${mastery}%</span>
      </div>
    </div>
  </div>`;
}

// ── Event handlers (stored for cleanup) ──

let toolbarClick: ((e: Event) => void) | null = null;
let toolbarChange: ((e: Event) => void) | null = null;
let wordListClick: ((e: Event) => void) | null = null;
let searchHandler: ((e: Event) => void) | null = null;

export function mountBrowse(): void {
  toolbarClick = (e: Event) => {
    const target = e.target as HTMLElement;
    const pill = target.closest('.filter-pill') as HTMLElement | null;
    if (pill?.dataset.filter) {
      currentFilter = pill.dataset.filter;
      renderBrowse();
    }
  };

  toolbarChange = (e: Event) => {
    const target = e.target as HTMLElement;
    const select = target.closest('#sort-select') as HTMLSelectElement | null;
    if (select) {
      currentSort = select.value;
      renderBrowse();
    }
  };

  wordListClick = async (e: Event) => {
    const target = e.target as HTMLElement;
    const card = target.closest('.word-card') as HTMLElement | null;
    if (!card?.dataset.id) return;
    const id = card.dataset.id;

    if (target.closest('.delete-btn')) {
      if (!confirm('确定删除这个单词吗？')) return;
      try {
        await chrome.runtime.sendMessage({ type: 'REMOVE_FAVORITE', wordId: id });
      } catch { /* */ }
      await loadWords();
      renderBrowse();
      return;
    }

    if (target.closest('.copy-btn')) {
      const { words } = getState();
      const word = words.find(w => w.id === id);
      if (word) {
        try {
          await navigator.clipboard.writeText(word.word);
          showToast('已复制');
        } catch { /* */ }
      }
      return;
    }

    if (target.closest('.card-context')) {
      const ctx = target.closest('.card-context') as HTMLElement | null;
      if (ctx) {
        const expanded = ctx.dataset.expanded === 'true';
        ctx.dataset.expanded = String(!expanded);
        ctx.classList.toggle('expanded', !expanded);
      }
    }
  };

  searchHandler = (e: Event) => {
    const input = e.target as HTMLInputElement;
    searchQuery = input.value;
    renderBrowse();
  };

  const toolbar = document.getElementById('browse-toolbar');
  if (toolbar) {
    toolbar.addEventListener('click', toolbarClick);
    toolbar.addEventListener('change', toolbarChange);
  }

  const wordList = document.getElementById('word-list');
  if (wordList) {
    wordList.addEventListener('click', wordListClick);
  }

  const searchEl = document.getElementById('search-input');
  if (searchEl) {
    searchEl.addEventListener('input', searchHandler);
  }
}

export function unmountBrowse(): void {
  currentFilter = 'all';
  currentSort = 'newest';
  searchQuery = '';

  const toolbar = document.getElementById('browse-toolbar');
  if (toolbar && toolbarClick && toolbarChange) {
    toolbar.removeEventListener('click', toolbarClick);
    toolbar.removeEventListener('change', toolbarChange);
  }

  const wordList = document.getElementById('word-list');
  if (wordList && wordListClick) {
    wordList.removeEventListener('click', wordListClick);
  }

  const searchEl = document.getElementById('search-input');
  if (searchEl && searchHandler) {
    searchEl.removeEventListener('input', searchHandler);
  }

  toolbarClick = null;
  toolbarChange = null;
  wordListClick = null;
  searchHandler = null;
}
