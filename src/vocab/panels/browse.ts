import type { FavoriteWord } from '../../shared/types';
import { getState, loadWords, loadFullStats } from '../state';
import { escapeHtml, extractHostname, sourceDotClass, wordStatus, calcMastery, Icons, ico } from '../utils';

// ── Module-level state ──

let currentFilter = 'all';
let currentSort = 'newest';
let searchQuery = '';
let searchTimer: ReturnType<typeof setTimeout> | null = null;

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
      if (w.note?.toLowerCase().includes(q)) return true;
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
    case 'starred-first':
      sorted.sort((a, b) => {
        if (a.starred !== b.starred) return a.starred ? -1 : 1;
        return b.createdAt - a.createdAt;
      });
      break;
    case 'next-review':
      sorted.sort((a, b) => {
        const aHas = a.nextReviewAt > 0;
        const bHas = b.nextReviewAt > 0;
        if (aHas !== bHas) return aHas ? -1 : 1;
        if (!aHas && !bHas) return b.createdAt - a.createdAt;
        return a.nextReviewAt - b.nextReviewAt;
      });
      break;
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

  toolbar.querySelectorAll('.pill').forEach(pill => {
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
  // Initialize inertia scroll for example areas
  wordList.querySelectorAll('[data-syo-inertia]').forEach(el => {
    if (!(el as any)._syoInertia) (el as any)._syoInertia = (window as any).Sayo?.inertiaScroll?.init(el);
  });
}

function renderCard(word: FavoriteWord): string {
  const status = wordStatus(word);
  const mastery = calcMastery(word);
  let masteryColor = 'var(--syo-fg-muted)';
  if (mastery >= 80) masteryColor = 'var(--syo-success)';
  else if (mastery >= 40) masteryColor = 'var(--syo-warning)';

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

  // Star button
  const starIcon = word.starred ? Icons.starFilled : Icons.star;
  const starClass = word.starred ? 'star-btn starred' : 'star-btn';
  const starTitle = word.starred ? '取消星标' : '星标';

  // Next review date
  let nextReviewHtml = '';
  if (word.learned) {
    nextReviewHtml = '<span class="next-review mastered">已掌握</span>';
  } else if (word.nextReviewAt === 0) {
    nextReviewHtml = '<span class="next-review new-word">新词</span>';
  } else {
    const now = Date.now();
    const isDue = word.nextReviewAt <= now;
    const d = new Date(word.nextReviewAt);
    const dateStr = `${d.getMonth() + 1}月${d.getDate()}日`;
    nextReviewHtml = `<span class="next-review${isDue ? ' due' : ''}">下次复习：${dateStr}</span>`;
  }

  // Note cards — horizontal inertia scroll with edit/delete
  let cardsHtml = '';
  const examples = word.translation.examples?.length ? word.translation.examples : [];
  const hasContext = !!word.context;
  const hasCards = examples.length > 0;

  cardsHtml = '<div class="card-note-cards">';
  cardsHtml += '<div class="nc-section-label">备注卡片</div>';
  cardsHtml += '<div class="syo-inertia nc-scroll" data-syo-inertia>';
  if (hasContext) {
    const sourceLabel = word.translation.source || '来源';
    cardsHtml += `<article class="syo-card nc-card" data-card-idx="-1">
      <div class="nc-card-inner">
        <div class="syo-card-head"><h3 class="syo-card-title">${escapeHtml(sourceLabel)} · 原文</h3></div>
        <p class="syo-card-desc">${escapeHtml(word.context!)}</p>
      </div>
      <div class="nc-card-actions">
        <button class="btn-icon btn-icon--xs nc-edit-btn" title="编辑" data-action="edit-card" data-card-idx="-1">${ico(Icons.gear)}</button>
        <button class="btn-icon btn-icon--xs nc-del-btn" title="删除" data-action="del-card" data-card-idx="-1">${ico(Icons.x)}</button>
      </div>
    </article>`;
  }
  if (hasCards) {
    for (let i = 0; i < examples.length; i++) {
      const ex = examples[i];
      cardsHtml += `<article class="syo-card nc-card" data-card-idx="${i}">
        <div class="nc-card-inner">
          <div class="syo-card-head"><h3 class="syo-card-title">${escapeHtml(ex.original)}</h3></div>
          <p class="syo-card-desc">${escapeHtml(ex.translated)}</p>
        </div>
        <div class="nc-card-actions">
          <button class="btn-icon btn-icon--xs nc-edit-btn" title="编辑" data-action="edit-card" data-card-idx="${i}">${ico(Icons.gear)}</button>
          <button class="btn-icon btn-icon--xs nc-del-btn" title="删除" data-action="del-card" data-card-idx="${i}">${ico(Icons.x)}</button>
        </div>
        <div class="nc-grip" draggable="true" title="拖拽排序">${ico(Icons.grip)}</div>
      </article>`;
    }
  }
  // Add card button
  cardsHtml += `<article class="syo-card nc-card nc-card--add" data-action="add-card">
    <div class="nc-add-placeholder">${ico(Icons.copy)}<span>添加备注</span></div>
  </article>`;
  cardsHtml += '</div></div>';

  return `<div class="syo-card word-card${word.starred ? ' starred' : ''}" data-id="${escapeHtml(word.id)}">
    <div class="card-body">
      <div class="syo-flex card-head" style="gap:8px">
        <span class="syo-tag-dot${status === 'mastered' ? ' syo-tag-dot--success' : status === 'learning' ? ' syo-tag-dot--warning' : ''} status-dot ${status}"></span>
        <span class="word">${escapeHtml(word.word)}</span>
        ${phonetic ? `<span class="phon">${phonetic}</span>` : ''}
        <div class="card-actions">
          <button class="btn-icon btn-icon--sm act-btn speak-btn" title="发音" data-action="speak" data-word="${escapeHtml(word.word)}">${ico(Icons.speaker)}</button>
          <button class="btn-icon btn-icon--sm act-btn ${starClass}" title="${starTitle}" data-action="star">${ico(starIcon)}</button>
          <button class="btn-icon btn-icon--sm act-btn delete-btn" title="删除">${ico(Icons.trash)}</button>
        </div>
      </div>
      <div class="meanings">${meaningHtml}</div>
      ${cardsHtml}
      <div class="card-meta">
        <span class="src-dot ${sourceDotClass(word.translation.sourceId)}" title="${escapeHtml(word.translation.source)}"></span>
        <span>${escapeHtml(word.translation.source)}</span>
        ${hostname ? `<a class="src-link" href="${escapeHtml(word.sourceUrl)}" target="_blank">${ico(Icons.link)}${escapeHtml(hostname)}</a>` : ''}
        ${nextReviewHtml}
        <span class="card-mastery" style="color:${masteryColor}">${mastery}%</span>
      </div>
    </div>
  </div>`;
}

// ── Note card editing ──

async function saveNoteCards(wordId: string, context: string | undefined, cards: Array<{ title: string; content: string }>): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'UPDATE_NOTE_CARDS', wordId, context, cards });
    const { words } = getState();
    const w = words.find(w => w.id === wordId);
    if (w) {
      w.context = context;
      w.translation.examples = cards.map(c => ({ original: c.title, translated: c.content }));
    }
  } catch { /* */ }
}

function showNoteCardDialog(wordId: string, type: 'add' | 'edit-context' | 'edit-card', existing?: { title: string; content: string }): void {
  const isContext = type === 'edit-context';
  const isAdd = type === 'add';
  const dialogTitle = isAdd ? '添加备注卡片' : isContext ? '编辑原文上下文' : '编辑备注卡片';

  const overlay = document.createElement('div');
  overlay.className = 'nc-dialog-overlay';
  overlay.innerHTML = `<div class="nc-dialog">
    <h4>${dialogTitle}</h4>
    <label>标题<input class="nc-input" id="nc-title" value="${escapeHtml(existing?.title ?? '')}" placeholder="${isContext ? '原文上下文' : '标题'}"></label>
    ${isContext ? '' : `<label>内容<input class="nc-input" id="nc-content" value="${escapeHtml(existing?.content ?? '')}" placeholder="内容"></label>`}
    <div class="nc-dialog-actions">
      <button class="syo-btn syo-btn--sm" id="nc-cancel">取消</button>
      <button class="syo-btn syo-btn--sm syo-btn--primary" id="nc-save">保存</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#nc-cancel')?.addEventListener('click', close);
  // Focus first input
  setTimeout(() => (overlay.querySelector('#nc-title') as HTMLInputElement)?.focus(), 50);

  overlay.querySelector('#nc-save')?.addEventListener('click', async () => {
    const title = (overlay.querySelector('#nc-title') as HTMLInputElement).value.trim();
    if (!title) return;

    const { words } = getState();
    const word = words.find(w => w.id === wordId);
    if (!word) { close(); return; }

    if (isContext) {
      const cards = (word.translation.examples ?? []).map(e => ({ title: e.original, content: e.translated }));
      await saveNoteCards(wordId, title, cards);
    } else {
      const content = (overlay.querySelector('#nc-content') as HTMLInputElement).value.trim();
      if (!content) return;
      const cards = (word.translation.examples ?? []).map(e => ({ title: e.original, content: e.translated }));
      if (isAdd) {
        cards.push({ title, content });
      } else {
        const idx = cards.findIndex(c => c.title === existing!.title);
        if (idx >= 0) cards[idx] = { title, content };
      }
      await saveNoteCards(wordId, word.context, cards);
    }
    close();
    renderBrowse();
  });

  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  });
}

// ── Drag state ──

let dragCardIdx: number | null = null;
let dragWordId: string | null = null;

// ── Event handlers (stored for cleanup) ──

let toolbarClick: ((e: Event) => void) | null = null;
let toolbarChange: ((e: Event) => void) | null = null;
let wordListClick: ((e: Event) => void) | null = null;
let searchHandler: ((e: Event) => void) | null = null;
let dragStartHandler: ((e: DragEvent) => void) | null = null;
let dragOverHandler: ((e: DragEvent) => void) | null = null;
let dragEndHandler: ((e: DragEvent) => void) | null = null;
let dropHandler: ((e: DragEvent) => void) | null = null;

export function mountBrowse(): void {
  toolbarClick = (e: Event) => {
    const target = e.target as HTMLElement;
    const pill = target.closest('.pill') as HTMLElement | null;
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

    // Delete button
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

    // Star button
    if (target.closest('.star-btn')) {
      const { words } = getState();
      const word = words.find(w => w.id === id);
      if (!word) return;
      const newStarred = !word.starred;
      try {
        await chrome.runtime.sendMessage({ type: 'STAR_WORD', wordId: id, starred: newStarred });
        word.starred = newStarred;
        renderBrowse();
      } catch { /* */ }
      return;
    }

    // Speak button
    if (target.closest('.speak-btn')) {
      const btn = target.closest('.speak-btn') as HTMLElement | null;
      const word = btn?.dataset.word;
      if (word) {
        chrome.runtime.sendMessage({ type: 'SPEAK', text: word, lang: 'en' });
      }
      return;
    }

    // Add note card
    if (target.closest('[data-action="add-card"]')) {
      showNoteCardDialog(id, 'add');
      return;
    }

    // Edit note card
    const editBtn = target.closest('[data-action="edit-card"]') as HTMLElement | null;
    if (editBtn) {
      const idx = parseInt(editBtn.dataset.cardIdx ?? '');
      const { words } = getState();
      const word = words.find(w => w.id === id);
      if (!word) return;
      if (idx === -1) {
        showNoteCardDialog(id, 'edit-context', { title: word.context ?? '', content: '' });
      } else {
        const ex = word.translation.examples?.[idx];
        if (ex) showNoteCardDialog(id, 'edit-card', { title: ex.original, content: ex.translated });
      }
      return;
    }

    // Delete note card
    const delBtn = target.closest('[data-action="del-card"]') as HTMLElement | null;
    if (delBtn) {
      const idx = parseInt(delBtn.dataset.cardIdx ?? '');
      const { words } = getState();
      const word = words.find(w => w.id === id);
      if (!word) return;
      if (idx === -1) {
        // Remove context
        const cards = (word.translation.examples ?? []).map(e => ({ title: e.original, content: e.translated }));
        await saveNoteCards(id, undefined, cards);
      } else {
        const cards = (word.translation.examples ?? []).map(e => ({ title: e.original, content: e.translated }));
        cards.splice(idx, 1);
        await saveNoteCards(id, word.context, cards);
      }
      renderBrowse();
      return;
    }

  };

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

  // Drag-to-reorder note cards (only via grip handle)
  dragStartHandler = (e: DragEvent) => {
    const grip = (e.target as HTMLElement).closest('.nc-grip[draggable]') as HTMLElement | null;
    if (!grip) return;
    const card = grip.closest('.nc-card[data-card-idx]') as HTMLElement | null;
    if (!card) return;
    const wordCard = card.closest('.word-card') as HTMLElement | null;
    if (!wordCard?.dataset.id) return;
    dragCardIdx = parseInt(card.dataset.cardIdx ?? '');
    dragWordId = wordCard.dataset.id;
    card.classList.add('nc-dragging');
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', '');
  };

  dragOverHandler = (e: DragEvent) => {
    e.preventDefault();
    const card = (e.target as HTMLElement).closest('.nc-card[data-card-idx]') as HTMLElement | null;
    if (!card || dragCardIdx === null) return;
    const wordCard = card.closest('.word-card') as HTMLElement | null;
    if (wordCard?.dataset.id !== dragWordId) return;
    e.dataTransfer!.dropEffect = 'move';
    card.classList.add('nc-drag-over');
  };

  dragEndHandler = () => {
    wordList?.querySelectorAll('.nc-dragging, .nc-drag-over').forEach(el => {
      el.classList.remove('nc-dragging', 'nc-drag-over');
    });
    dragCardIdx = null;
    dragWordId = null;
  };

  dropHandler = async (e: DragEvent) => {
    e.preventDefault();
    const card = (e.target as HTMLElement).closest('.nc-card[data-card-idx]') as HTMLElement | null;
    if (!card || dragCardIdx === null || !dragWordId) return;
    const wordCard = card.closest('.word-card') as HTMLElement | null;
    if (wordCard?.dataset.id !== dragWordId) return;

    const targetIdx = parseInt(card.dataset.cardIdx ?? '');
    if (targetIdx === dragCardIdx) { dragEndHandler!(); return; }

    const { words } = getState();
    const word = words.find(w => w.id === dragWordId);
    if (!word) { dragEndHandler!(); return; }

    const cards = (word.translation.examples ?? []).map(e => ({ title: e.original, content: e.translated }));
    // Context card (idx -1) can't be involved in reorder with regular cards
    if (dragCardIdx === -1 || targetIdx === -1) { dragEndHandler!(); return; }

    const [moved] = cards.splice(dragCardIdx, 1);
    cards.splice(targetIdx, 0, moved);

    await saveNoteCards(dragWordId, word.context, cards);
    dragEndHandler!();
    renderBrowse();
  };

  if (wordList) {
    wordList.addEventListener('dragstart', dragStartHandler);
    wordList.addEventListener('dragover', dragOverHandler);
    wordList.addEventListener('dragend', dragEndHandler);
    wordList.addEventListener('drop', dropHandler);
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

  if (wordList && dragStartHandler && dragOverHandler && dragEndHandler && dropHandler) {
    wordList.removeEventListener('dragstart', dragStartHandler);
    wordList.removeEventListener('dragover', dragOverHandler);
    wordList.removeEventListener('dragend', dragEndHandler);
    wordList.removeEventListener('drop', dropHandler);
  }

  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = null;

  dragCardIdx = null;
  dragWordId = null;
  toolbarClick = null;
  toolbarChange = null;
  wordListClick = null;
  searchHandler = null;
  dragStartHandler = null;
  dragOverHandler = null;
  dragEndHandler = null;
  dropHandler = null;
}
