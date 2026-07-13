import type { FavoriteWord } from '../shared/types';

// ── State ──

let words: FavoriteWord[] = [];
let dueWords: FavoriteWord[] = [];
let sortBy: 'newest' | 'oldest' | 'alpha-asc' | 'alpha-desc' = 'newest';
let searchQuery = '';
let mode: 'browse' | 'review' = 'browse';
let reviewIndex = 0;
let reviewTotal = 0;
let reviewedCount = 0;
let revealed = false;
let dailyGoal = 10; // 每日复习目标
let toastTimer: ReturnType<typeof setTimeout> | null = null;

// ── SVG icons ──

const icoCopy = '<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const icoLink = '<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
const icoTrash = '<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

// ── Utilities ──

function escapeHtml(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)} 天前`;
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function nextReviewStr(ts: number): string {
  if (!ts) return '';
  const diff = ts - Date.now();
  if (diff < 0) return '待复习';
  if (diff < 86400000) return '今天';
  if (diff < 172800000) return '明天';
  return formatDate(ts);
}

function extractHostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url.slice(0, 60); }
}

function sourceDotClass(sourceId?: string): string {
  if (!sourceId) return '';
  const id = sourceId.toLowerCase();
  if (id.includes('deepseek')) return 's-deepseek';
  if (id.includes('google')) return 's-google';
  if (id.includes('tencent')) return 's-tencent';
  if (id.includes('baidu')) return 's-baidu';
  if (id.includes('deepl')) return 's-deepl';
  return '';
}

function showToast(msg: string): void {
  const toast = document.getElementById('toast')!;
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

// ── Data loading ──

async function loadData(): Promise<void> {
  try {
    const [favResp, dueResp, goalData] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_FAVORITES' }),
      chrome.runtime.sendMessage({ type: 'GET_DUE_WORDS' }),
      chrome.storage.sync.get(['dailyGoal']),
    ]);
    words = (favResp?.words ?? []) as FavoriteWord[];
    dueWords = (dueResp?.words ?? []) as FavoriteWord[];
    if ((goalData as any)?.dailyGoal) dailyGoal = (goalData as any).dailyGoal;
  } catch { words = []; dueWords = []; }
  updateStats();
  renderCurrentMode();
}

async function loadStats(): Promise<void> {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_LEARN_STATS' });
    if (resp?.type === 'LEARN_STATS_RESULT') {
      renderStatsBar(resp.total, resp.due, resp.reviewedToday, resp.streak, resp.mastered);
    }
    const dueBadge = document.getElementById('due-badge')!;
    const count = resp?.due ?? dueWords.length;
    dueBadge.textContent = String(count);
    dueBadge.style.display = count > 0 ? '' : 'none';
  } catch { /* */ }
}

function updateStats(): void { loadStats(); }

function renderStatsBar(total: number, due: number, reviewedToday: number, streak: number, mastered: number): void {
  const goalMet = reviewedToday >= dailyGoal;
  document.getElementById('stats-bar')!.innerHTML = `
    <div class="stat-item"><span class="num">${total}</span> 词汇</div>
    <div class="stat-item due"><span class="num">${due}</span> 待复习</div>
    <div class="stat-item ${goalMet ? 'mastered' : ''}" id="goal-stat" title="点击修改每日目标">
      <span class="num">${reviewedToday}</span>/<span class="num">${dailyGoal}</span> 今日
    </div>
    <div class="stat-item mastered"><span class="num">${mastered}</span> 已掌握</div>
    <div class="stat-item"><span class="num">${streak}</span> 天连续</div>`;
  // click to change goal
  document.getElementById('goal-stat')!.addEventListener('click', async () => {
    const input = prompt('设置每日复习目标（当前: ' + dailyGoal + '）', String(dailyGoal));
    if (input) {
      const n = Math.max(1, Math.min(200, parseInt(input, 10) || 10));
      dailyGoal = n;
      await chrome.storage.sync.set({ dailyGoal: n });
      updateStats();
    }
  });
}

// ═══════════════════════════════════════════
//  BROWSE MODE
// ═══════════════════════════════════════════

function getFilteredAndSorted(): FavoriteWord[] {
  let result = [...words];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(w =>
      w.word.toLowerCase().includes(q) || w.translation.text.toLowerCase().includes(q));
  }
  switch (sortBy) {
    case 'newest': result.sort((a, b) => b.createdAt - a.createdAt); break;
    case 'oldest': result.sort((a, b) => a.createdAt - b.createdAt); break;
    case 'alpha-asc': result.sort((a, b) => a.word.localeCompare(b.word)); break;
    case 'alpha-desc': result.sort((a, b) => b.word.localeCompare(a.word)); break;
  }
  return result;
}

function renderBrowse(): void {
  const list = document.getElementById('list')!;
  const empty = document.getElementById('empty')!;
  const filtered = getFilteredAndSorted();

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.classList.add('visible');
    if (words.length === 0) {
      document.querySelector('.empty-title')!.textContent = '还没有收藏词汇';
      document.querySelector('.empty-desc')!.innerHTML = '在任意网页选中文字翻译后，<br>点击收藏即可加入生词本。';
    } else {
      document.querySelector('.empty-title')!.textContent = '没有匹配的词汇';
      document.querySelector('.empty-desc')!.textContent = '试试换一个搜索词？';
    }
    return;
  }
  empty.classList.remove('visible');

  list.innerHTML = filtered.map(f => {
    const hasContext = !!f.context;
    const hasPOS = f.translation.partsOfSpeech && f.translation.partsOfSpeech.length > 0;
    const dotCls = sourceDotClass(f.translation.sourceId);

    let meaningsHtml: string;
    if (hasPOS) {
      meaningsHtml = f.translation.partsOfSpeech!.map(pos =>
        `<span class="pos-tag">${escapeHtml(pos.type)}</span>
         <span class="pos-meanings">${escapeHtml(pos.meanings.join('；'))}</span>`).join('');
    } else {
      meaningsHtml = `<span class="plain">${escapeHtml(f.translation.text)}</span>`;
    }

    let contextHtml = '';
    if (hasContext) {
      contextHtml = `<div class="card-context">${escapeHtml(f.context!)}</div>`;
    }

    let reviewHtml = '';
    if (f.reviewCount > 0) {
      const nextStr = nextReviewStr(f.nextReviewAt);
      reviewHtml = `<span class="review-info">复习 ${f.reviewCount} 次${nextStr ? ' · ' + nextStr : ''}</span>`;
    }

    const hostname = f.sourceUrl ? extractHostname(f.sourceUrl) : '';

    return `
      <div class="card">
        <div class="card-body">
          <div class="card-head">
            <span class="word">${escapeHtml(f.word)}</span>
            ${f.translation.phonetic ? `<span class="phon">/${escapeHtml(f.translation.phonetic)}/</span>` : ''}
            <div class="card-actions">
              ${f.sourceUrl ? `<a class="act-btn act-link" href="${escapeHtml(f.sourceUrl)}" target="_blank" title="打开来源页面">${icoLink}</a>` : ''}
              <button class="act-btn act-copy" data-action="copy" data-id="${escapeHtml(f.id)}" title="复制译文">${icoCopy}</button>
              <button class="act-btn act-delete" data-action="delete" data-id="${escapeHtml(f.id)}" title="删除">${icoTrash}</button>
            </div>
          </div>
          <div class="card-meanings">${meaningsHtml}</div>
          ${contextHtml}
          <div class="card-meta">
            <span><span class="src-dot ${dotCls}"></span>${escapeHtml(f.translation.source || '未知')}</span>
            ${hostname ? `<a class="src-link" href="${escapeHtml(f.sourceUrl)}" target="_blank">${icoLink} ${escapeHtml(hostname)}</a>` : ''}
            <span>${formatDate(f.createdAt)}</span>
            ${reviewHtml}
          </div>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.act-delete').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); deleteWord((btn as HTMLElement).dataset.id!); });
  });
  list.querySelectorAll('.act-copy').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); copyTranslation((btn as HTMLElement).dataset.id!, btn as HTMLElement); });
  });
}

// ═══════════════════════════════════════════
//  REVIEW MODE — 不背单词 style
// ═══════════════════════════════════════════

function startReview(): void {
  reviewIndex = 0;
  reviewTotal = dueWords.length;
  reviewedCount = 0;
  if (reviewTotal === 0) {
    document.getElementById('review-progress')!.style.display = 'none';
    document.getElementById('flashcard-area')!.style.display = 'none';
    document.getElementById('rating-row')!.classList.add('hidden');
    document.getElementById('review-done')!.classList.add('active');
    document.getElementById('done-desc')!.textContent = '暂时没有需要复习的单词。';
    return;
  }
  document.getElementById('review-progress')!.style.display = '';
  document.getElementById('flashcard-area')!.style.display = '';
  document.getElementById('review-done')!.classList.remove('active');
  document.getElementById('rating-row')!.classList.add('hidden');
  updateReviewProgress();
  showCard();
}

function showCard(): void {
  if (reviewIndex >= reviewTotal) { finishReview(); return; }

  const word = dueWords[reviewIndex];
  revealed = false;

  // reset reveal state
  document.getElementById('fc-reveal')!.classList.remove('open');
  document.getElementById('fc-hint')!.style.display = '';
  document.getElementById('rating-row')!.classList.add('hidden');

  // word
  const wordEl = document.getElementById('fc-word')!;
  wordEl.textContent = word.word;
  wordEl.classList.toggle('long', word.word.length > 12);

  // phonetic
  const phonEl = document.getElementById('fc-phon')!;
  phonEl.textContent = word.translation.phonetic ? `/${word.translation.phonetic}/` : '';

  // meaning (hidden until reveal)
  let meaningHtml: string;
  let posHtml = '';
  if (word.translation.partsOfSpeech && word.translation.partsOfSpeech.length > 0) {
    meaningHtml = word.translation.partsOfSpeech.map(pos =>
      `${pos.type}. ${pos.meanings.join('；')}`).join('<br>');
    posHtml = word.translation.partsOfSpeech.map(pos =>
      `<span class="pos-tag">${escapeHtml(pos.type)}</span>`).join('');
  } else {
    meaningHtml = escapeHtml(word.translation.text);
  }
  document.getElementById('fc-pos')!.innerHTML = posHtml || '';
  document.getElementById('fc-meaning')!.innerHTML = meaningHtml;

  // context
  const ctxEl = document.getElementById('fc-context')!;
  if (word.context) { ctxEl.style.display = ''; ctxEl.textContent = word.context; }
  else { ctxEl.style.display = 'none'; }

  // meta
  const hostname = word.sourceUrl ? extractHostname(word.sourceUrl) : '';
  document.getElementById('fc-meta')!.textContent =
    `${word.translation.source || ''}${hostname ? ' · ' + hostname : ''}`;
}

function revealCard(): void {
  if (revealed) return;
  revealed = true;
  document.getElementById('fc-reveal')!.classList.add('open');
  document.getElementById('fc-hint')!.style.display = 'none';
  document.getElementById('rating-row')!.classList.remove('hidden');
}

function finishReview(): void {
  document.getElementById('flashcard-area')!.style.display = 'none';
  document.getElementById('rating-row')!.classList.add('hidden');
  document.getElementById('review-done')!.classList.add('active');
  document.getElementById('done-desc')!.textContent =
    reviewedCount > 0
      ? `本次复习了 ${reviewedCount} 个单词，继续保持！`
      : '暂时没有需要复习的单词，先去收藏一些吧。';
  updateReviewProgress();
  loadData();
}

function updateReviewProgress(): void {
  const pct = reviewTotal > 0 ? Math.round((reviewedCount / reviewTotal) * 100) : 0;
  document.getElementById('progress-fill')!.style.width = `${pct}%`;
  document.getElementById('progress-text')!.textContent = `${reviewedCount}/${reviewTotal}`;
}

async function submitRating(quality: number): Promise<void> {
  const word = dueWords[reviewIndex];
  if (!word) return;
  try { await chrome.runtime.sendMessage({ type: 'SUBMIT_REVIEW', wordId: word.id, quality }); }
  catch { /* continue */ }
  reviewedCount++;
  reviewIndex++;
  updateReviewProgress();
  showCard();
}

// ═══════════════════════════════════════════
//  ACTIONS
// ═══════════════════════════════════════════

async function deleteWord(id: string): Promise<void> {
  const word = words.find(w => w.id === id);
  if (!word) return;
  if (!confirm(`确定删除「${word.word}」吗？`)) return;
  try { await chrome.runtime.sendMessage({ type: 'REMOVE_FAVORITE', id }); } catch { /* */ }
  words = words.filter(w => w.id !== id);
  dueWords = dueWords.filter(w => w.id !== id);
  updateStats();
  renderBrowse();
  showToast('已删除');
}

async function copyTranslation(id: string, btn: HTMLElement): Promise<void> {
  const word = words.find(w => w.id === id);
  if (!word) return;
  try {
    await navigator.clipboard.writeText(word.translation.text);
    btn.classList.add('copied');
    showToast('已复制译文');
    setTimeout(() => btn.classList.remove('copied'), 1500);
  } catch { showToast('复制失败'); }
}

// ═══════════════════════════════════════════
//  MODE SWITCHING
// ═══════════════════════════════════════════

function switchMode(newMode: 'browse' | 'review'): void {
  mode = newMode;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', (b as HTMLElement).dataset.mode === mode);
  });
  document.getElementById('browse-wrap')!.classList.toggle('hidden', mode !== 'browse');
  document.getElementById('review-wrap')!.classList.toggle('active', mode === 'review');
  if (mode === 'review') startReview(); else renderBrowse();
}

function renderCurrentMode(): void {
  if (mode === 'browse') renderBrowse(); else startReview();
}

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════

function exportCSV(): void {
  const filtered = getFilteredAndSorted();
  if (filtered.length === 0) { showToast("没有可导出的词汇"); return; }
  const header = "word,meaning,context,source,date";
  const rows = filtered.map(f => {
    const meaning = f.translation.text.replace(/"/g, '""');
    const context = (f.context || "").replace(/"/g, '""');
    const source = (f.sourceUrl || f.translation.source || "").replace(/"/g, '""');
    const date = new Date(f.createdAt).toISOString().slice(0, 10);
    return `"${f.word.replace(/"/g, '""')}","${meaning}","${context}","${source}","${date}"`;
  });
  const csv = [header, ...rows].join("\n");
  downloadFile("vocab-export.csv", csv, "text/csv");
}

function exportJSON(): void {
  const filtered = getFilteredAndSorted();
  if (filtered.length === 0) { showToast("没有可导出的词汇"); return; }
  const data = filtered.map(f => ({
    word: f.word,
    meaning: f.translation.text,
    phonetic: f.translation.phonetic || "",
    partsOfSpeech: f.translation.partsOfSpeech || [],
    examples: f.translation.examples || [],
    context: f.context || "",
    sourceUrl: f.sourceUrl,
    source: f.translation.source,
    createdAt: new Date(f.createdAt).toISOString(),
    reviewCount: f.reviewCount,
  }));
  const json = JSON.stringify(data, null, 2);
  downloadFile("vocab-export.json", json, "application/json");
}

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("导出完成");
}


function init(): void {
  // tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchMode((btn as HTMLElement).dataset.mode as 'browse' | 'review');
    });
  });

  // search
  document.getElementById('search')!.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value.trim();
    renderBrowse();
  });

  // sort
  document.getElementById('sort')!.addEventListener('change', (e) => {
    sortBy = (e.target as HTMLSelectElement).value as typeof sortBy;
    renderBrowse();

  // export
  document.getElementById("btn-export-csv")!.addEventListener("click", () => exportCSV());
  document.getElementById("btn-export-json")!.addEventListener("click", () => exportJSON());
  });

  // flashcard — click to reveal
  document.getElementById('flashcard-area')!.addEventListener('click', () => revealCard());

  // rating buttons
  document.getElementById('btn-unknown')!.addEventListener('click', (e) => {
    e.stopPropagation(); submitRating(1);
  });
  document.getElementById('btn-known')!.addEventListener('click', (e) => {
    e.stopPropagation(); submitRating(4);
  });

  // back to browse
  document.getElementById('back-to-browse')!.addEventListener('click', () => switchMode('browse'));

  loadData();
}

init();
