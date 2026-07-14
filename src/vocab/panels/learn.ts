import type { FavoriteWord } from '../../shared/types';
import { getState, loadWords, loadFullStats } from '../state';
import { escapeHtml, extractHostname } from '../utils';

// ═══════════════════════════════════════════════
//  FSRS Grades
// ═══════════════════════════════════════════════

const AGAIN = 1;  // forgot
const HARD  = 2;  // remembered with difficulty
const GOOD  = 3;  // remembered normally
const EASY  = 4;  // remembered effortlessly

type Grade = typeof AGAIN | typeof HARD | typeof GOOD | typeof EASY;
type SessionResult = 'again' | 'hard' | 'good' | 'easy';

function gradeToResult(g: Grade): SessionResult {
  switch (g) {
    case AGAIN: return 'again';
    case HARD:  return 'hard';
    case GOOD:  return 'good';
    case EASY:  return 'easy';
  }
}

interface QueueItem {
  word: FavoriteWord;
  isNew: boolean;
  sessionAppearances: number;
  sessionResult: SessionResult[];
  learningStep: number;
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
let againHandler: ((e: Event) => void) | null = null;
let hardHandler: ((e: Event) => void) | null = null;
let goodHandler: ((e: Event) => void) | null = null;
let easyHandler: ((e: Event) => void) | null = null;
let backHandler: (() => void) | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let speakHandler: ((e: Event) => void) | null = null;
let speakBackHandler: ((e: Event) => void) | null = null;

// ═══════════════════════════════════════════════
//  Queue building
// ═══════════════════════════════════════════════

function buildQueue(): void {
  const { dueWords, settings } = getState();
  const newLimit = settings.dailyNewLimit;
  const reviewLimit = settings.dailyReviewLimit;

  const newWords = dueWords.filter(w => w.reviewCount === 0).slice(0, newLimit);
  const reviewWords = dueWords.filter(w => w.reviewCount > 0);
  const limitedReview = reviewLimit > 0 ? reviewWords.slice(0, reviewLimit) : reviewWords;

  queue = [];
  for (const w of newWords) {
    queue.push({ word: w, isNew: true, sessionAppearances: 0, sessionResult: [], learningStep: 1 });
  }
  for (const w of limitedReview) {
    queue.push({ word: w, isNew: false, sessionAppearances: 0, sessionResult: [], learningStep: 0 });
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

// ═══════════════════════════════════════════════
//  Rendering
// ═══════════════════════════════════════════════

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
  const ratingRow = document.getElementById('rating-row');
  const wordBackEl = document.getElementById('fc-word-back');
  const phonBackEl = document.getElementById('fc-phon-back');
  const posEl = document.getElementById('fc-pos');
  const meaningEl = document.getElementById('fc-meaning');
  const ctxEl = document.getElementById('fc-context');
  const metaEl = document.getElementById('fc-meta');
  const sessionInfoEl = document.getElementById('fc-session-info');
  const speakBtn = document.getElementById('btn-speak') as HTMLElement | null;
  if (!inner || !wordEl || !phonEl || !hintEl || !ratingRow || !wordBackEl || !phonBackEl || !posEl || !meaningEl || !ctxEl || !metaEl || !sessionInfoEl) return;

  inner.classList.remove('exit-left');

  // ── Card Front ──
  const showWordFront = settings.cardFront.includes('word');
  const showPhoneticFront = settings.cardFront.includes('phonetic');
  const showContextFront = settings.cardFront.includes('context');

  if (settings.cardLayout === 'context-first' && word.context && showContextFront) {
    const blanked = word.context.replace(new RegExp(word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '______');
    wordEl.textContent = blanked;
    wordEl.classList.add('long');
    wordEl.style.fontSize = 'var(--text-xl)';
    phonEl.textContent = showWordFront ? '点击显示单词' : '';
    hintEl.textContent = '点击卡片或按空格键查看答案';
  } else {
    if (showWordFront) {
      wordEl.textContent = word.word;
      wordEl.classList.toggle('long', word.word.length > 12);
      wordEl.style.fontSize = '';
    } else {
      wordEl.textContent = '';
    }
    phonEl.textContent = showPhoneticFront && word.translation.phonetic
      ? `/${word.translation.phonetic}/` : '';
    hintEl.textContent = '点击卡片或按空格键显示释义';
  }
  hintEl.style.display = '';

  ratingRow.classList.add('hidden');
  const card = document.getElementById('fc-card');
  if (card) card.classList.remove('revealed');
  if (speakBtn) speakBtn.style.display = '';

  // ── Card Back (pre-fill) ──
  if (wordBackEl) {
    wordBackEl.textContent = word.word;
    wordBackEl.classList.toggle('long', word.word.length > 12);
  }
  if (phonBackEl) {
    phonBackEl.textContent = word.translation.phonetic ? `/${word.translation.phonetic}/` : '';
  }

  const showMeaning = settings.cardBack.includes('meaning');
  const showPos = settings.cardBack.includes('pos');
  const showExamples = settings.cardBack.includes('examples');
  const showContextBack = settings.cardBack.includes('context');
  const showSource = settings.cardBack.includes('source');

  if (showMeaning) {
    if (word.translation.partsOfSpeech?.length) {
      posEl.innerHTML = '';
      meaningEl.innerHTML = word.translation.partsOfSpeech.map(p =>
        `<div class="fc-meaning-group"><span class="fc-meaning-pos">${escapeHtml(p.type)}</span><span class="fc-meaning-text">${escapeHtml(p.meanings.join('；'))}</span></div>`
      ).join('');
    } else {
      meaningEl.innerHTML = escapeHtml(word.translation.text);
      posEl.innerHTML = '';
    }
    meaningEl.style.display = '';
  } else {
    meaningEl.innerHTML = '';
    meaningEl.style.display = 'none';
    posEl.innerHTML = '';
  }

  // ── Examples: web page context + translator examples ──
  const examples = word.translation.examples?.length ? word.translation.examples : [];
  const hasContext = !!(word.context && showContextBack);
  const hasExamples = !!(examples.length && showExamples);

  if (hasContext || hasExamples) {
    ctxEl.style.display = '';
    const sourceLabel = word.translation.source || '例句';
    let html = `<div class="ctx-source-label">${escapeHtml(sourceLabel)} · 例句</div>`;
    html += '<div class="syo-inertia" data-syo-inertia style="padding-bottom:8px">';
    if (hasContext) {
      html += `<article class="syo-card" style="width:260px;margin-right:12px"><div class="syo-card-head"><h3 class="syo-card-title">${escapeHtml(sourceLabel)} · 原文</h3></div><p class="syo-card-desc">${escapeHtml(word.context)}</p></article>`;
    }
    if (hasExamples) {
      for (const ex of examples) {
        html += `<article class="syo-card" style="width:260px;margin-right:12px"><div class="syo-card-head"><h3 class="syo-card-title">${escapeHtml(ex.original)}</h3></div><p class="syo-card-desc">${escapeHtml(ex.translated)}</p></article>`;
      }
    }
    html += '</div>';
    ctxEl.innerHTML = html;
    ctxEl.querySelectorAll('[data-syo-inertia]').forEach(el => {
      if (!(el as any)._syoInertia) (el as any)._syoInertia = (window as any).Sayo?.inertiaScroll?.init(el);
    });
  } else {
    ctxEl.style.display = 'none';
  }

  if (showSource) {
    const hostname = word.sourceUrl ? extractHostname(word.sourceUrl) : '';
    metaEl.textContent = `${word.translation.source || ''}${hostname ? ' · ' + hostname : ''}`;
    metaEl.style.display = '';
  } else {
    metaEl.textContent = '';
    metaEl.style.display = 'none';
  }

  let info = item.isNew ? '新词' : '复习';
  if (item.learningStep === 2) info += ' · 确认中';
  if (item.sessionAppearances > 0) info += ` · 本轮第 ${item.sessionAppearances + 1} 次`;
  sessionInfoEl.textContent = info;
}

function revealCard(): void {
  if (revealed) return;
  revealed = true;
  revealTimestamp = Date.now();
  const hintEl = document.getElementById('fc-hint');
  const ratingRow = document.getElementById('rating-row');
  if (!hintEl || !ratingRow) return;
  const card = document.getElementById('fc-card');
  if (card) card.classList.add('revealed');
  hintEl.style.transition = 'opacity 300ms var(--syo-ease-out)';
  hintEl.style.opacity = '0';
  setTimeout(() => { hintEl.style.display = 'none'; }, 300);
  ratingRow.classList.remove('hidden');
}

// ═══════════════════════════════════════════════
//  Rating / Submission logic
// ═══════════════════════════════════════════════

const STEP1_DELAY = 1;
const STEP2_DELAY = 5;
const REVIEW_AGAIN_DELAY = 2;
const REVIEW_HARD_DELAY = 3;

async function submitRating(grade: Grade): Promise<void> {
  if (submitting) return;
  const item = queue[currentIndex];
  if (!item) return;
  submitting = true;
  totalActions++;
  item.sessionAppearances++;
  item.sessionResult.push(gradeToResult(grade));

  let shouldSubmit = false;
  let shouldSend = false;
  let backendGrade = grade;

  if (item.isNew) {
    if (grade === AGAIN) {
      item.learningStep = 1;
      insertBack(item, STEP1_DELAY);
    } else if (grade === HARD) {
      const delay = item.learningStep === 1 ? STEP1_DELAY : STEP2_DELAY;
      insertBack(item, delay);
    } else if (grade === GOOD) {
      if (item.learningStep === 1) {
        item.learningStep = 2;
        insertBack(item, STEP2_DELAY);
      } else {
        graduatedCount++;
        shouldSubmit = true;
        shouldSend = true;
        backendGrade = GOOD;
      }
    } else {
      graduatedCount++;
      shouldSubmit = true;
      shouldSend = true;
      backendGrade = EASY;
    }
  } else {
    if (grade === AGAIN) {
      shouldSend = true;
      backendGrade = AGAIN;
      let consecutiveAgain = 0;
      for (let i = item.sessionResult.length - 1; i >= 0; i--) {
        if (item.sessionResult[i] === 'again') consecutiveAgain++;
        else break;
      }
      if (consecutiveAgain >= 3 || item.sessionAppearances >= 5) {
        skippedCount++;
        shouldSubmit = true;
      } else {
        insertBack(item, REVIEW_AGAIN_DELAY);
      }
    } else if (grade === HARD) {
      shouldSend = true;
      backendGrade = HARD;
      let consecutiveHard = 0;
      for (let i = item.sessionResult.length - 1; i >= 0; i--) {
        if (item.sessionResult[i] === 'hard') consecutiveHard++;
        else break;
      }
      if (consecutiveHard >= 3 || item.sessionAppearances >= 4) {
        graduatedCount++;
        shouldSubmit = true;
      } else {
        insertBack(item, REVIEW_HARD_DELAY);
      }
    } else if (grade === GOOD) {
      graduatedCount++;
      shouldSubmit = true;
      shouldSend = true;
      backendGrade = GOOD;
    } else {
      graduatedCount++;
      shouldSubmit = true;
      shouldSend = true;
      backendGrade = EASY;
    }
  }

  if (shouldSend) {
    try {
      await chrome.runtime.sendMessage({
        type: 'SUBMIT_REVIEW',
        wordId: item.word.id,
        quality: backendGrade,
      });
    } catch {
      Sayo.toast.show('保存失败，请检查扩展是否正常运行', { type: 'error', duration: 6000 });
      submitting = false;
      return;
    }
  }

  const inner = document.getElementById('fc-inner');
  const cardEl = document.getElementById('fc-card');
  if (!inner) { submitting = false; return; }
  if (cardEl?.classList.contains('revealed')) {
    inner.style.transition = 'none';
    cardEl.classList.remove('revealed');
    void inner.offsetHeight;
    inner.style.transition = '';
  }
  inner.classList.add('exit-left');

  let finished = false;
  const advanceCard = () => {
    if (finished) return;
    finished = true;
    inner.removeEventListener('transitionend', onTransitionEnd);
    currentIndex++;
    inner.classList.remove('exit-left');
    inner.classList.add('enter-right');
    showCard();
    updateProgress();
    setTimeout(() => inner.classList.remove('enter-right'), 350);
    submitting = false;
  };
  const onTransitionEnd = () => advanceCard();
  inner.addEventListener('transitionend', onTransitionEnd, { once: true });
  setTimeout(advanceCard, 600);
}

// ═══════════════════════════════════════════════
//  Done state
// ═══════════════════════════════════════════════

function showDoneState(): void {
  submitting = false;
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
    titleEl.textContent = '没有待复习的单词';
    descEl.innerHTML = '在网页中选中文字翻译并收藏，像捡星星一样积累词汇吧';
    if (iconEl) {
      iconEl.innerHTML = '<span class="ico"><svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span>';
      iconEl.style.color = 'var(--syo-fg-muted)';
    }
  } else {
    const accuracy = totalActions > 0 ? Math.round((graduatedCount / totalActions) * 100) : 0;
    titleEl.textContent = '本轮学习完成';
    let desc = `共 ${totalUnique} 个词，${graduatedCount} 个掌握`;
    if (skippedCount > 0) desc += `，${skippedCount} 个跳过`;
    if (accuracy > 0) desc += ` · 正确率 ${accuracy}%`;

    const { fullStats } = getState();
    if (fullStats && fullStats.streak > 0) {
      desc += '<br>连续打卡 ' + fullStats.streak + ' 天';
      const remaining = Math.max(0, (fullStats.dailyGoal || 20) - fullStats.reviewedToday);
      if (remaining > 0) {
        desc += ' · 今日目标还差 ' + remaining + ' 词';
      } else {
        desc += ' · 今日目标已达成';
      }
    }

    descEl.innerHTML = desc;
    if (iconEl) {
      iconEl.innerHTML = '<span class="ico"><svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span>';
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

// ═══════════════════════════════════════════════
//  Pronunciation
// ═══════════════════════════════════════════════

function speakWord(): void {
  const item = queue[currentIndex];
  if (!item) return;
  chrome.runtime.sendMessage({ type: 'SPEAK', text: item.word.word, lang: 'en' });
}

// ═══════════════════════════════════════════════
//  Mount / Unmount
// ═══════════════════════════════════════════════

export function mountLearn(): void {
  revealHandler = (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    revealCard();
  };
  againHandler = (e) => { e.stopPropagation(); submitRating(AGAIN); };
  hardHandler  = (e) => { e.stopPropagation(); submitRating(HARD); };
  goodHandler  = (e) => { e.stopPropagation(); submitRating(GOOD); };
  easyHandler  = (e) => { e.stopPropagation(); submitRating(EASY); };
  speakHandler = (e) => { e.stopPropagation(); speakWord(); };
  speakBackHandler = (e) => { e.stopPropagation(); speakWord(); };
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
      if (e.key === '1') { e.preventDefault(); submitRating(AGAIN); }
      else if (e.key === '2') { e.preventDefault(); submitRating(HARD); }
      else if (e.key === '3') { e.preventDefault(); submitRating(GOOD); }
      else if (e.key === '4') { e.preventDefault(); submitRating(EASY); }
    }
  };

  document.getElementById('fc-area')?.addEventListener('click', revealHandler);
  document.getElementById('btn-again')?.addEventListener('click', againHandler);
  document.getElementById('btn-hard')?.addEventListener('click', hardHandler);
  document.getElementById('btn-good')?.addEventListener('click', goodHandler);
  document.getElementById('btn-easy')?.addEventListener('click', easyHandler);
  document.getElementById('btn-speak')?.addEventListener('click', speakHandler);
  document.getElementById('btn-speak-back')?.addEventListener('click', speakBackHandler);
  document.getElementById('back-to-browse')?.addEventListener('click', backHandler);
  document.addEventListener('keydown', keydownHandler);
}

export function unmountLearn(): void {
  if (revealHandler) document.getElementById('fc-area')?.removeEventListener('click', revealHandler);
  if (againHandler) document.getElementById('btn-again')?.removeEventListener('click', againHandler);
  if (hardHandler)  document.getElementById('btn-hard')?.removeEventListener('click', hardHandler);
  if (goodHandler)  document.getElementById('btn-good')?.removeEventListener('click', goodHandler);
  if (easyHandler)  document.getElementById('btn-easy')?.removeEventListener('click', easyHandler);
  if (speakHandler) document.getElementById('btn-speak')?.removeEventListener('click', speakHandler);
  if (speakBackHandler) document.getElementById('btn-speak-back')?.removeEventListener('click', speakBackHandler);
  if (backHandler)  document.getElementById('back-to-browse')?.removeEventListener('click', backHandler);
  if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
  revealHandler = null;
  againHandler = null;
  hardHandler = null;
  goodHandler = null;
  easyHandler = null;
  speakHandler = null;
  speakBackHandler = null;
  backHandler = null;
  keydownHandler = null;
  revealed = false;
  submitting = false;
  queue = [];
}
