import type { FavoriteWord } from '../../shared/types';
import { getState, loadWords, loadFullStats } from '../state';
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
let totalUnique = 0;
let totalActions = 0;
let revealed = false;
let submitting = false;
let revealTimestamp = 0;
let revealHandler: ((e: Event) => void) | null = null;
let unknownHandler: ((e: Event) => void) | null = null;
let fuzzyHandler: ((e: Event) => void) | null = null;
let knownHandler: ((e: Event) => void) | null = null;
let backHandler: (() => void) | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let speakHandler: ((e: Event) => void) | null = null;

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
  totalUnique = queue.length;
  totalActions = 0;
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
  const { settings } = getState();
  revealed = false;
  submitting = false;

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
  const speakBtn = document.getElementById('btn-speak') as HTMLElement | null;
  if (!inner || !wordEl || !phonEl || !hintEl || !revealEl || !ratingRow || !posEl || !meaningEl || !ctxEl || !metaEl || !sessionInfoEl) return;

  inner.classList.remove('exit-left');

  // ── Card Front (controlled by settings.cardFront) ──
  const showWordFront = settings.cardFront.includes('word');
  const showPhoneticFront = settings.cardFront.includes('phonetic');
  const showContextFront = settings.cardFront.includes('context');

  if (settings.cardLayout === 'context-first' && word.context && showContextFront) {
    // Context-first: show sentence with word blanked out
    const blanked = word.context.replace(new RegExp(word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '______');
    wordEl.textContent = blanked;
    wordEl.classList.add('long');
    wordEl.style.fontSize = 'var(--text-xl)';
    if (showWordFront) {
      phonEl.textContent = '点击显示单词';
    } else {
      phonEl.textContent = '';
    }
    hintEl.textContent = '点击卡片或按空格键查看答案';
  } else {
    // Minimal: word is the hero
    if (showWordFront) {
      wordEl.textContent = word.word;
      wordEl.classList.toggle('long', word.word.length > 12);
      wordEl.style.fontSize = '';
    } else {
      wordEl.textContent = '';
    }
    if (showPhoneticFront) {
      phonEl.textContent = word.translation.phonetic
        ? `/${word.translation.phonetic}/` : '';
    } else {
      phonEl.textContent = '';
    }
    hintEl.textContent = '点击卡片或按空格键显示释义';
  }
  hintEl.style.display = '';
  revealEl.classList.remove('open');
  // Update keyboard hint to pre-reveal state
  const keyHintEl = document.getElementById('fc-key-hint');
  if (keyHintEl) keyHintEl.innerHTML = '<kbd>Space</kbd>/<kbd>Enter</kbd> 翻面 · <kbd>1</kbd> 不认识 · <kbd>2</kbd> 模糊 · <kbd>3</kbd> 认识';
  ratingRow.classList.add('hidden');
  const card = document.getElementById('fc-card');
  if (card) card.classList.remove('revealed');

  // Show speaker button
  if (speakBtn) speakBtn.style.display = '';

  // ── Card Back (controlled by settings.cardBack) ──
  const showMeaning = settings.cardBack.includes('meaning');
  const showPos = settings.cardBack.includes('pos');
  const showContextBack = settings.cardBack.includes('context');
  const showSource = settings.cardBack.includes('source');

  // Pre-fill reveal content
  if (showMeaning) {
    let meaningHtml: string;
    if (word.translation.partsOfSpeech?.length) {
      meaningHtml = word.translation.partsOfSpeech.map(p =>
        `${showPos ? `<span class="syo-tag pos-tag">${escapeHtml(p.type)}</span>` : ''} ${escapeHtml(p.meanings.join('；'))}`
      ).join('<br>');
      posEl.innerHTML = showPos ? word.translation.partsOfSpeech.map(p =>
        `<span class="syo-tag pos-tag">${escapeHtml(p.type)}</span>`
      ).join('') : '';
    } else {
      meaningHtml = escapeHtml(word.translation.text);
      posEl.innerHTML = '';
    }
    meaningEl.innerHTML = meaningHtml;
    meaningEl.style.display = '';
  } else {
    meaningEl.innerHTML = '';
    meaningEl.style.display = 'none';
    posEl.innerHTML = '';
  }

  if (word.context && showContextBack) {
    ctxEl.style.display = '';
    ctxEl.textContent = word.context;
  } else {
    ctxEl.style.display = 'none';
  }

  if (showSource) {
    const hostname = word.sourceUrl ? extractHostname(word.sourceUrl) : '';
    metaEl.textContent =
      `${word.translation.source || ''}${hostname ? ' · ' + hostname : ''}`;
    metaEl.style.display = '';
  } else {
    metaEl.textContent = '';
    metaEl.style.display = 'none';
  }

  sessionInfoEl.textContent =
    `${item.isNew ? '新词' : '复习'}${item.sessionAppearances > 0 ? ` · 本轮第 ${item.sessionAppearances + 1} 次` : ''}`;
}

function revealCard(): void {
  if (revealed) return;
  revealed = true;
  revealTimestamp = Date.now();
  const revealEl = document.getElementById('fc-reveal');
  const hintEl = document.getElementById('fc-hint');
  const ratingRow = document.getElementById('rating-row');
  if (!revealEl || !hintEl || !ratingRow) return;
  revealEl.classList.add('open');
  hintEl.style.display = 'none';
  ratingRow.classList.remove('hidden');
  const card = document.getElementById('fc-card');
  if (card) card.classList.add('revealed');
  // Update keyboard hint to post-reveal state (Space now = submit 'known')
  const keyHintEl = document.getElementById('fc-key-hint');
  if (keyHintEl) keyHintEl.innerHTML = '<kbd>1</kbd>/<kbd>←</kbd> 不认识 · <kbd>2</kbd>/<kbd>↓</kbd> 模糊 · <kbd>3</kbd>/<kbd>→</kbd>/<kbd>Space</kbd> 认识';
  // Keep speaker button visible so user can hear pronunciation after seeing meaning
}

async function submitRating(quality: number): Promise<void> {
  if (submitting) return;
  const item = queue[currentIndex];
  if (!item) return;
  submitting = true;
  totalActions++;
  item.sessionAppearances++;

  // Record result for session tracking
  const result = quality === 5 ? 'known' : quality === 3 ? 'fuzzy' : 'unknown';
  item.sessionResult.push(result);

  let shouldSubmit = false;
  let submitQuality = quality;

  if (quality === 5) {
    if (item.sessionResult.includes('fuzzy') && !item.sessionResult.slice(0, -1).includes('known')) {
      // First time "known" after only "fuzzy" — needs re-confirmation
      insertBack(item, 5);
    } else {
      // Graduate: word mastered this session
      graduatedCount++;
      shouldSubmit = true;
      // Use best quality from session
      submitQuality = item.sessionResult.includes('known') ? 5
        : item.sessionResult.includes('fuzzy') ? 3 : 1;
    }
  } else if (quality === 3) {
    // After 3 fuzzies in a session, force graduate (prevent infinite loop)
    const fuzzyCount = item.sessionResult.filter(r => r === 'fuzzy').length;
    if (fuzzyCount >= 3) {
      graduatedCount++;
      shouldSubmit = true;
      submitQuality = 3;
    } else {
      insertBack(item, 5);
    }
  } else {
    // quality === 1
    let consecutiveUnknowns = 0;
    for (let i = item.sessionResult.length - 1; i >= 0; i--) {
      if (item.sessionResult[i] === 'unknown') consecutiveUnknowns++;
      else break;
    }
    if (consecutiveUnknowns >= 3 || item.sessionAppearances >= 5) {
      skippedCount++;
      shouldSubmit = true;
      submitQuality = 1;
    } else {
      const delay = item.isNew ? 2 : 3;
      insertBack(item, delay);
    }
  }

  // Submit to SM-2 ONLY when word leaves the queue (graduates or is skipped)
  if (shouldSubmit) {
    try {
      await chrome.runtime.sendMessage({ type: 'SUBMIT_REVIEW', wordId: item.word.id, quality: submitQuality });
    } catch {
      Sayo.toast.show('保存失败，请检查扩展是否正常运行', { type: 'error', duration: 6000 });
      submitting = false;
      return;
    }
  }

  // Animate card out
  const inner = document.getElementById('fc-inner');
  if (!inner) { submitting = false; return; }
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
  const iconEl = document.getElementById('done-icon');
  const speakBtn = document.getElementById('btn-speak') as HTMLElement | null;
  if (!fcArea || !ratingRow || !progressEl || !doneEl || !titleEl || !descEl) return;
  fcArea.style.display = 'none';
  ratingRow.classList.add('hidden');
  progressEl.style.display = 'none';
  doneEl.style.display = '';
  if (speakBtn) speakBtn.style.display = 'none';

  if (totalUnique === 0) {
    // Empty state — no words to review
    titleEl.textContent = '没有待复习的单词';
    descEl.innerHTML = '去网页中划词翻译并收藏，积累你的生词本吧 <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" style="vertical-align:middle"><path d="M8 1l1.5 4.5L14 6l-3.5 3L11.5 14 8 11l-3.5 3L5.5 9 2 6l4.5-.5L8 1z"/></svg>';
    if (iconEl) {
      iconEl.innerHTML = '<span class="ico"><svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:56px;height:56px"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span>';
      iconEl.style.color = 'var(--syo-fg-muted)';
    }
  } else {
    // Normal completion — show stats
    const accuracy = totalActions > 0 ? Math.round((graduatedCount / totalActions) * 100) : 0;
    titleEl.textContent = '本轮学习完成';
    let desc = `共 ${totalUnique} 个词，${graduatedCount} 个掌握`;
    if (skippedCount > 0) desc += `，${skippedCount} 个跳过`;
    if (accuracy > 0) desc += ` · 正确率 ${accuracy}%`;

    // Add streak info from fullStats if available
    const { fullStats } = getState();
    if (fullStats && fullStats.streak > 0) {
      desc += '<br>连续打卡 ' + fullStats.streak + ' 天';
      const remaining = Math.max(0, (fullStats.dailyGoal || 20) - fullStats.reviewedToday);
      if (remaining > 0) {
        desc += ' · 今日目标还差 ' + remaining + ' 词';
      } else {
        desc += ' · 今日目标已达成 <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="vertical-align:middle;color:var(--syo-success)"><circle cx="8" cy="8" r="7"/><path d="M5 8.5l2 2 4-4"/></svg>';
      }
    }

    descEl.innerHTML = desc;
    if (iconEl) {
      iconEl.innerHTML = '<span class="ico"><svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:56px;height:56px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span>';
      iconEl.style.color = 'var(--syo-success)';
    }
  }
  loadWords();
  loadFullStats();
}

function updateProgress(): void {
  const completed = graduatedCount + skippedCount;
  const pct = totalUnique > 0 ? Math.round((completed / totalUnique) * 100) : 0;
  const fillEl = document.getElementById('progress-fill');
  const textEl = document.getElementById('progress-text');
  if (!fillEl || !textEl) return;
  fillEl.style.width = `${pct}%`;
  const remaining = totalUnique - completed;
  textEl.textContent =
    `掌握 ${graduatedCount} ${skippedCount > 0 ? '· 跳过 ' + skippedCount : ''} · 剩余 ${remaining} 词 · 已练习 ${totalActions} 次`;
}

// ── Pronunciation ──

function speakWord(): void {
  const item = queue[currentIndex];
  if (!item) return;
  const utterance = new SpeechSynthesisUtterance(item.word.word);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

// ── Mount / Unmount ──

export function mountLearn(): void {
  revealHandler = (e) => {
    // Don't reveal if clicking a button inside the card area
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    revealCard();
  };
  unknownHandler = (e) => { e.stopPropagation(); submitRating(1); };
  fuzzyHandler = (e) => { e.stopPropagation(); submitRating(3); };
  knownHandler = (e) => { e.stopPropagation(); submitRating(5); };
  speakHandler = (e) => { e.stopPropagation(); speakWord(); };
  backHandler = () => {
    const doneEl = document.getElementById('review-done');
    const fcArea = document.getElementById('fc-area');
    const progressEl = document.getElementById('review-progress');
    if (doneEl) doneEl.style.display = 'none';
    if (fcArea) fcArea.style.display = '';
    if (progressEl) progressEl.style.display = '';
    document.querySelector<HTMLElement>('.nav-tab[data-panel="browse"]')?.click();
  };

  keydownHandler = (e: KeyboardEvent) => {
    // Ignore if in input/textarea or if drawer is open
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (document.getElementById('drawer')?.classList.contains('open')) return;

    const item = queue[currentIndex];
    if (!item) return;

    if (!revealed) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        revealCard();
      }
    } else {
      if (e.key === '1' || e.key === 'ArrowLeft') {
        e.preventDefault();
        submitRating(1);
      } else if (e.key === '2' || e.key === 'ArrowDown') {
        e.preventDefault();
        submitRating(3);
      } else if (e.key === '3' || e.key === 'ArrowRight') {
        e.preventDefault();
        submitRating(5);
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        // 500ms cooldown after reveal — prevent accidental double-press
        if (Date.now() - revealTimestamp < 500) return;
        submitRating(5);
      }
    }
  };

  document.getElementById('fc-area')?.addEventListener('click', revealHandler);
  document.getElementById('btn-unknown')?.addEventListener('click', unknownHandler);
  document.getElementById('btn-fuzzy')?.addEventListener('click', fuzzyHandler);
  document.getElementById('btn-known')?.addEventListener('click', knownHandler);
  document.getElementById('btn-speak')?.addEventListener('click', speakHandler);
  document.getElementById('back-to-browse')?.addEventListener('click', backHandler);
  document.addEventListener('keydown', keydownHandler);
}

export function unmountLearn(): void {
  if (revealHandler) document.getElementById('fc-area')?.removeEventListener('click', revealHandler);
  if (unknownHandler) document.getElementById('btn-unknown')?.removeEventListener('click', unknownHandler);
  if (fuzzyHandler) document.getElementById('btn-fuzzy')?.removeEventListener('click', fuzzyHandler);
  if (knownHandler) document.getElementById('btn-known')?.removeEventListener('click', knownHandler);
  if (speakHandler) document.getElementById('btn-speak')?.removeEventListener('click', speakHandler);
  if (backHandler) document.getElementById('back-to-browse')?.removeEventListener('click', backHandler);
  if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
  revealHandler = null; unknownHandler = null; fuzzyHandler = null; knownHandler = null;
  speakHandler = null; backHandler = null; keydownHandler = null;
  revealed = false;
  submitting = false;
  queue = [];
}
