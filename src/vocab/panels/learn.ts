import type { FavoriteWord } from '../../shared/types';
import { getState, loadWords } from '../state';
import { escapeHtml, extractHostname } from '../utils';

interface QueueItem {
  word: FavoriteWord;
  isNew: boolean;
  sessionAppearances: number;
  sessionResult: ('unknown' | 'fuzzy' | 'known')[];
}

let queue: QueueItem[] = [];
let currentIndex = 0;
let graduatedCount = 0;
let skippedCount = 0;
let revealed = false;

function buildQueue(): void {
  const { dueWords, settings } = getState();
  const newLimit = settings.dailyNewLimit;
  const reviewLimit = settings.dailyReviewLimit;

  const newWords = dueWords.filter(w => w.reviewCount === 0).slice(0, newLimit);
  const reviewWords = dueWords.filter(w => w.reviewCount > 0);
  const limitedReview = reviewLimit > 0 ? reviewWords.slice(0, reviewLimit) : reviewWords;

  queue = [];
  for (const w of newWords) {
    queue.push({ word: w, isNew: true, sessionAppearances: 0, sessionResult: [] });
  }
  for (const w of limitedReview) {
    queue.push({ word: w, isNew: false, sessionAppearances: 0, sessionResult: [] });
  }
  currentIndex = 0;
  graduatedCount = 0;
  skippedCount = 0;
}

function insertBack(item: QueueItem, afterN: number): void {
  const insertAt = Math.min(currentIndex + afterN + 1, queue.length);
  queue.splice(insertAt, 0, item);
}

export function renderLearn(): void {
  buildQueue();
  if (queue.length === 0) {
    showDoneState();
    return;
  }
  const progressEl = document.getElementById('review-progress')!;
  const fcArea = document.getElementById('fc-area')!;
  const doneEl = document.getElementById('review-done')!;
  progressEl.style.display = '';
  fcArea.style.display = '';
  doneEl.style.display = 'none';
  showCard();
  updateProgress();
}

function showCard(): void {
  if (currentIndex >= queue.length) {
    showDoneState();
    return;
  }
  const item = queue[currentIndex];
  const word = item.word;
  revealed = false;

  const inner = document.getElementById('fc-inner')!;
  inner.classList.remove('exit-left', 'enter-right');

  document.getElementById('fc-word')!.textContent = word.word;
  document.getElementById('fc-word')!.classList.toggle('long', word.word.length > 12);
  document.getElementById('fc-phon')!.textContent = word.translation.phonetic
    ? `/${word.translation.phonetic}/` : '';
  document.getElementById('fc-hint')!.style.display = '';
  document.getElementById('fc-reveal')!.classList.remove('open');
  document.getElementById('rating-row')!.classList.add('hidden');

  // Pre-fill reveal content
  let meaningHtml: string;
  if (word.translation.partsOfSpeech?.length) {
    meaningHtml = word.translation.partsOfSpeech.map(p =>
      `<span class="pos-tag">${escapeHtml(p.type)}</span> ${escapeHtml(p.meanings.join('；'))}`
    ).join('<br>');
    document.getElementById('fc-pos')!.innerHTML = word.translation.partsOfSpeech.map(p =>
      `<span class="pos-tag">${escapeHtml(p.type)}</span>`
    ).join('');
  } else {
    meaningHtml = escapeHtml(word.translation.text);
    document.getElementById('fc-pos')!.innerHTML = '';
  }
  document.getElementById('fc-meaning')!.innerHTML = meaningHtml;

  const ctxEl = document.getElementById('fc-context')!;
  if (word.context) {
    ctxEl.style.display = '';
    ctxEl.textContent = word.context;
  } else {
    ctxEl.style.display = 'none';
  }

  const hostname = word.sourceUrl ? extractHostname(word.sourceUrl) : '';
  document.getElementById('fc-meta')!.textContent =
    `${word.translation.source || ''}${hostname ? ' · ' + hostname : ''}`;

  document.getElementById('fc-session-info')!.textContent =
    `本次第 ${item.sessionAppearances + 1} 次 · ${item.isNew ? '新词' : '复习'}`;
}

function revealCard(): void {
  if (revealed) return;
  revealed = true;
  document.getElementById('fc-reveal')!.classList.add('open');
  document.getElementById('fc-hint')!.style.display = 'none';
  document.getElementById('rating-row')!.classList.remove('hidden');
}

async function submitRating(quality: number): Promise<void> {
  const item = queue[currentIndex];
  if (!item) return;
  item.sessionAppearances++;

  const word = item.word;
  try {
    await chrome.runtime.sendMessage({ type: 'SUBMIT_REVIEW', wordId: word.id, quality });
  } catch { /* continue */ }

  if (quality === 5) {
    if (item.sessionResult.includes('fuzzy') && !item.sessionResult.includes('known')) {
      item.sessionResult.push('known');
      insertBack(item, 5);
    } else {
      graduatedCount++;
    }
  } else if (quality === 3) {
    item.sessionResult.push('fuzzy');
    insertBack(item, 5);
  } else {
    item.sessionResult.push('unknown');
    const consecutiveUnknowns = item.sessionResult.filter(r => r === 'unknown').length;
    if (consecutiveUnknowns >= 3 || item.sessionAppearances >= 5) {
      skippedCount++;
    } else {
      const delay = item.isNew ? 2 : 3;
      insertBack(item, delay);
    }
  }

  // Animate card out
  const inner = document.getElementById('fc-inner')!;
  inner.classList.add('exit-left');

  setTimeout(() => {
    currentIndex++;
    inner.classList.remove('exit-left');
    inner.classList.add('enter-right');
    showCard();
    updateProgress();
    setTimeout(() => inner.classList.remove('enter-right'), 350);
  }, 150);
}

function showDoneState(): void {
  document.getElementById('fc-area')!.style.display = 'none';
  document.getElementById('rating-row')!.classList.add('hidden');
  document.getElementById('review-progress')!.style.display = 'none';
  const doneEl = document.getElementById('review-done')!;
  doneEl.style.display = '';

  const total = queue.length;
  document.getElementById('done-title')!.textContent =
    total === 0 ? '没有待复习的单词' : '本轮学习完成';
  document.getElementById('done-desc')!.textContent =
    `本次学了 ${total} 个词，${graduatedCount} 个毕业` +
    (skippedCount > 0 ? `，${skippedCount} 个跳过` : '');
  loadWords();
}

function updateProgress(): void {
  const total = queue.length;
  const pct = total > 0 ? Math.round((currentIndex / total) * 100) : 0;
  document.getElementById('progress-fill')!.style.width = `${pct}%`;
  document.getElementById('progress-text')!.textContent = `${currentIndex}/${total}`;
}

export function mountLearn(): void {
  document.getElementById('fc-area')?.addEventListener('click', revealCard);
  document.getElementById('btn-unknown')?.addEventListener('click', (e) => { e.stopPropagation(); submitRating(1); });
  document.getElementById('btn-fuzzy')?.addEventListener('click', (e) => { e.stopPropagation(); submitRating(3); });
  document.getElementById('btn-known')?.addEventListener('click', (e) => { e.stopPropagation(); submitRating(5); });
  document.getElementById('back-to-browse')?.addEventListener('click', () => {
    document.getElementById('review-done')!.style.display = 'none';
    document.getElementById('fc-area')!.style.display = '';
    document.getElementById('review-progress')!.style.display = '';
    document.querySelector<HTMLElement>('.nav-tab[data-panel="browse"]')?.click();
  });
}

export function unmountLearn(): void {
  revealed = false;
  queue = [];
}
