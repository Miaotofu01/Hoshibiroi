import type { FavoriteWord } from '../../shared/types';
import { getState, loadWords, loadFullStats } from '../state';
import { escapeHtml, extractHostname, sourceDotClass, wordStatus, calcMastery, Icons, ico } from '../utils';
import { renderCurveSvg } from './stats';

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
  const hasSearchOrFilter = searchQuery.trim() !== '' || currentFilter !== 'all';

  if (filtered.length === 0) {
    wordList.innerHTML = '';
    emptyEl.classList.add('visible');
    // Distinguish 'no words at all' vs 'no results from filter/search'
    const emptyTitle = emptyEl.querySelector('.empty-title');
    const emptyDesc = emptyEl.querySelector('.empty-desc');
    if (words.length === 0) {
      if (emptyTitle) emptyTitle.textContent = '还没有收藏词汇';
      if (emptyDesc) emptyDesc.textContent = '在任意网页选中文字翻译后，点击收藏即可加入生词本。';
    } else if (hasSearchOrFilter) {
      if (emptyTitle) emptyTitle.textContent = '没有匹配的词汇';
      if (emptyDesc) emptyDesc.textContent = '试试调整搜索词或筛选条件。';
    } else {
      if (emptyTitle) emptyTitle.textContent = '还没有收藏词汇';
      if (emptyDesc) emptyDesc.textContent = '在任意网页选中文字翻译后，点击收藏即可加入生词本。';
    }
    return;
  }
  emptyEl.classList.remove('visible');

  wordList.innerHTML = filtered.map(word => renderCard(word)).join('');
}

function renderCard(word: FavoriteWord): string {
  const status = wordStatus(word);
  const mastery = calcMastery(word);
  let masteryColor = 'var(--fg-muted)';
  if (mastery >= 80) masteryColor = 'var(--color-success)';
  else if (mastery >= 40) masteryColor = 'var(--color-warning)';

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
          <button class="act-btn delete-btn" title="删除">${ico(Icons.trash)}</button>
        </div>
      </div>
      <div class="meanings">${meaningHtml}</div>
      ${word.context ? `<div class="card-context" data-expanded="false">${escapeHtml(word.context)}</div>` : ''}
      <div class="card-meta">
        <span class="src-dot ${sourceDotClass(word.translation.sourceId)}" title="${escapeHtml(word.translation.source)}"></span>
        <span>${escapeHtml(word.translation.source)}</span>
        ${hostname ? `<a class="src-link" href="${escapeHtml(word.sourceUrl)}" target="_blank">${ico(Icons.link)}${escapeHtml(hostname)}</a>` : ''}
        <span class="card-mastery" style="color:${masteryColor}">${mastery}%</span>
        <button class="act-btn curve-toggle" title="查看记忆曲线" style="margin-left:auto">${ico(Icons.play)}</button>
      </div>
      <div class="card-curve" style="display:none">
        ${word.reviewHistory.length >= 2
          ? `<svg viewBox="0 0 600 240" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:200px">${renderCurveSvg(word)}</svg>`
          : '<div style="text-align:center;padding:16px 0;color:var(--fg-muted);font-size:12px">完成至少 2 次复习后显示记忆曲线</div>'}
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
      const ok = await Sayo.dialog.confirm({
        title: '删除单词',
        message: '确定要删除这个单词吗？',
        confirmText: '删除',
        cancelText: '取消',
      });
      if (!ok) return;
      try {
        await chrome.runtime.sendMessage({ type: 'REMOVE_FAVORITE', wordId: id });
      } catch { /* */ }
      await loadWords();
      await loadFullStats();
      renderBrowse();
      Sayo.toast.show('已删除', { type: 'success' });
      return;
    }

    if (target.closest('.card-context')) {
      const ctx = target.closest('.card-context') as HTMLElement | null;
      if (ctx) {
        const expanded = ctx.dataset.expanded === 'true';
        ctx.dataset.expanded = String(!expanded);
        ctx.classList.toggle('expanded', !expanded);
      }
      return;
    }

    if (target.closest('.curve-toggle')) {
      const toggle = target.closest('.curve-toggle') as HTMLElement | null;
      const cardEl = target.closest('.word-card') as HTMLElement | null;
      const curve = cardEl?.querySelector('.card-curve') as HTMLElement | null;
      if (toggle && curve) {
        const isOpen = curve.style.display !== 'none';
        curve.style.display = isOpen ? 'none' : '';
        toggle.classList.toggle('expanded', !isOpen);
      }
      return;
    }
  };

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  searchHandler = (e: Event) => {
    const input = e.target as HTMLInputElement;
    searchQuery = input.value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderBrowse(), 200);
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
