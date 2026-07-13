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
let revealHandler: ((e: Event) => void) | null = null;
let unknownHandler: ((e: Event) => void) | null = null;
let fuzzyHandler: ((e: Event) => void) | null = null;
let knownHandler: ((e: Event) => void) | null = null;
let backHandler: (() => void) | null = null;

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
  const progressEl = document.getElementById('review-progress');
  const fcArea = document.getElementById('fc-area');
  const doneEl = document.getElementById('review-done');
  if (!progressEl || !fcArea || !doneEl) return;
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

  const inner = document.getElementById('fc-inner');
  const wordEl = document.getElementById('fc-word');
  const phonEl = document.getElementById('fc-phon');
  const hintEl = document.getElementById('fc-hint');
  const revealEl = document.getElementById('fc-reveal');
  const ratingRow = document.getElementById('rating-row');
  const posEl = document.getElementById('fc-pos');
  const meaningEl = document.getElementById('fc-meaning');
  const ctxEl = document.getElementById('fc-context');
  const metaEl = document.getElementById('fc-meta');
  const sessionInfoEl = document.getElementById('fc-session-info');
  if (!inner || !wordEl || !phonEl || !hintEl || !revealEl || !ratingRow || !posEl || !meaningEl || !ctxEl || !metaEl || !sessionInfoEl) return;

  inner.classList.remove('exit-left');

  wordEl.textContent = word.word;
  wordEl.classList.toggle('long', word.word.length > 12);
  phonEl.textContent = word.translation.phonetic
    ? `/${word.translation.phonetic}/` : '';
  hintEl.style.display = '';
  revealEl.classList.remove('open');
  ratingRow.classList.add('hidden');

  // Pre-fill reveal content
  let meaningHtml: string;
  if (word.translation.partsOfSpeech?.length) {
    meaningHtml = word.translation.partsOfSpeech.map(p =>
      `<span class="pos-tag">${escapeHtml(p.type)}</span> ${escapeHtml(p.meanings.join('；'))}`
    ).join('<br>');
    posEl.innerHTML = word.translation.partsOfSpeech.map(p =>
      `<span class="pos-tag">${escapeHtml(p.type)}</span>`
    ).join('');
  } else {
    meaningHtml = escapeHtml(word.translation.text);
    posEl.innerHTML = '';
  }
  meaningEl.innerHTML = meaningHtml;

  if (word.context) {
    ctxEl.style.display = '';
    ctxEl.textContent = word.context;
  } else {
    ctxEl.style.display = 'none';
  }

  const hostname = word.sourceUrl ? extractHostname(word.sourceUrl) : '';
  metaEl.textContent =
    `${word.translation.source || ''}${hostname ? ' · ' + hostname : ''}`;

  sessionInfoEl.textContent =
    `本次第 ${item.sessionAppearances + 1} 次 · ${item.isNew ? '新词' : '复习'}`;
}

function revealCard(): void {
  if (revealed) return;
  revealed = true;
  const revealEl = document.getElementById('fc-reveal');
  const hintEl = document.getElementById('fc-hint');
  const ratingRow = document.getElementById('rating-row');
  if (!revealEl || !hintEl || !ratingRow) return;
  revealEl.classList.add('open');
  hintEl.style.display = 'none';
  ratingRow.classList.remove('hidden');
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
    let consecutiveUnknowns = 0;
    for (let i = item.sessionResult.length - 1; i >= 0; i--) {
      if (item.sessionResult[i] === 'unknown') consecutiveUnknowns++;
      else break;
    }
    if (consecutiveUnknowns >= 3 || item.sessionAppearances >= 5) {
      skippedCount++;
    } else {
      const delay = item.isNew ? 2 : 3;
      insertBack(item, delay);
    }
  }

  // Animate card out
  const inner = document.getElementById('fc-inner');
  if (!inner) return;
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
  const fcArea = document.getElementById('fc-area');
  const ratingRow = document.getElementById('rating-row');
  const progressEl = document.getElementById('review-progress');
  const doneEl = document.getElementById('review-done');
  const titleEl = document.getElementById('done-title');
  const descEl = document.getElementById('done-desc');
  if (!fcArea || !ratingRow || !progressEl || !doneEl || !titleEl || !descEl) return;
  fcArea.style.display = 'none';
  ratingRow.classList.add('hidden');
  progressEl.style.display = 'none';
  doneEl.style.display = '';

  const total = queue.length;
  titleEl.textContent =
    total === 0 ? '没有待复习的单词' : '本轮学习完成';
  descEl.textContent =
    `本次学了 ${total} 个词，${graduatedCount} 个毕业` +
    (skippedCount > 0 ? `，${skippedCount} 个跳过` : '');
  loadWords();
}

function updateProgress(): void {
  const total = queue.length;
  const pct = total > 0 ? Math.round((currentIndex / total) * 100) : 0;
  const fillEl = document.getElementById('progress-fill');
  const textEl = document.getElementById('progress-text');
  if (!fillEl || !textEl) return;
  fillEl.style.width = `${pct}%`;
  textEl.textContent = `${currentIndex}/${total}`;
}

export function mountLearn(): void {
  revealHandler = revealCard;
  unknownHandler = (e) => { e.stopPropagation(); submitRating(1); };
  fuzzyHandler = (e) => { e.stopPropagation(); submitRating(3); };
  knownHandler = (e) => { e.stopPropagation(); submitRating(5); };
  backHandler = () => {
    const doneEl = document.getElementById('review-done');
    const fcArea = document.getElementById('fc-area');
    const progressEl = document.getElementById('review-progress');
    if (doneEl) doneEl.style.display = 'none';
    if (fcArea) fcArea.style.display = '';
    if (progressEl) progressEl.style.display = '';
    document.querySelector<HTMLElement>('.nav-tab[data-panel="browse"]')?.click();
  };

  document.getElementById('fc-area')?.addEventListener('click', revealHandler);
  document.getElementById('btn-unknown')?.addEventListener('click', unknownHandler);
  document.getElementById('btn-fuzzy')?.addEventListener('click', fuzzyHandler);
  document.getElementById('btn-known')?.addEventListener('click', knownHandler);
  document.getElementById('back-to-browse')?.addEventListener('click', backHandler);
}

export function unmountLearn(): void {
  if (revealHandler) document.getElementById('fc-area')?.removeEventListener('click', revealHandler);
  if (unknownHandler) document.getElementById('btn-unknown')?.removeEventListener('click', unknownHandler);
  if (fuzzyHandler) document.getElementById('btn-fuzzy')?.removeEventListener('click', fuzzyHandler);
  if (knownHandler) document.getElementById('btn-known')?.removeEventListener('click', knownHandler);
  if (backHandler) document.getElementById('back-to-browse')?.removeEventListener('click', backHandler);
  revealHandler = null; unknownHandler = null; fuzzyHandler = null; knownHandler = null; backHandler = null;
  revealed = false;
  queue = [];
}
