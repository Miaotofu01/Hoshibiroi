import type { FavoriteWord } from '../../shared/types';
import type { FullStatsResponse } from '../../shared/messages';
import { getState } from '../state';
import { formatDate } from '../utils';

// ── Module-level state ──

let selectedWordId: string | null = null;
let chipClickHandler: ((e: Event) => void) | null = null;

// ── Overview ──

function renderOverview(stats: FullStatsResponse): void {
  const totalEl = document.getElementById('stat-total');
  const learningEl = document.getElementById('stat-learning');
  const masteredEl = document.getElementById('stat-mastered');
  const streakEl = document.getElementById('stat-streak');
  const fillEl = document.getElementById('today-fill');
  const textEl = document.getElementById('today-text');
  if (!totalEl || !learningEl || !masteredEl || !streakEl || !fillEl || !textEl) return;

  totalEl.textContent = String(stats.total);
  learningEl.textContent = String(stats.learning);
  masteredEl.textContent = String(stats.mastered);
  streakEl.textContent = String(stats.streak);

  const pct = stats.dailyGoal > 0
    ? Math.min(100, Math.round((stats.reviewedToday / stats.dailyGoal) * 100))
    : 0;
  fillEl.style.width = `${pct}%`;

  const remaining = Math.max(0, stats.dailyGoal - stats.reviewedToday);
  textEl.textContent =
    `今日 ${stats.reviewedToday}/${stats.dailyGoal} 目标 · 已复习 ${stats.reviewedToday} 个 · 还剩 ${remaining} 个`;
}

// ── Calendar Heatmap ──

function renderCalendar(stats: FullStatsResponse): void {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  const cells: string[] = [];
  for (let i = 0; i < stats.calendar.length; i++) {
    const day = stats.calendar[i];
    let level = '';
    if (day.count >= 10) level = 'level-3';
    else if (day.count >= 5) level = 'level-2';
    else if (day.count >= 1) level = 'level-1';
    cells.push(
      `<span class="calendar-cell ${level}" title="${day.date}: ${day.count} 次复习"></span>`
    );
  }

  // Align first column to Monday
  if (stats.calendar.length > 0) {
    const firstDate = new Date(stats.calendar[0].date + 'T00:00:00');
    const dayOfWeek = firstDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const offset = (dayOfWeek + 6) % 7; // 0=Mon through 6=Sun
    for (let i = 0; i < offset; i++) {
      cells.unshift('<span class="calendar-cell" style="opacity:0"></span>');
    }
  }

  grid.innerHTML = cells.join('');
}

// ── Forecast Bars ──

function renderForecast(stats: FullStatsResponse): void {
  const list = document.getElementById('forecast-list');
  if (!list) return;

  const maxCount = Math.max(...stats.forecast.map(d => d.count), 1);
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const bars = stats.forecast.map(day => {
    const d = new Date(day.date + 'T00:00:00');
    const label = `${d.getMonth() + 1}/${d.getDate()} ${dayNames[d.getDay()]}`;
    const pct = (day.count / maxCount) * 100;
    const heavy = day.count > 15 ? 'heavy' : '';
    return `<div class="forecast-row ${heavy}">
      <span class="date-label">${label}</span>
      <div class="forecast-bar-track">
        <div class="forecast-bar-fill" style="width:${pct}%"></div>
      </div>
      <span class="count-label">${day.count} 个</span>
    </div>`;
  });

  list.innerHTML = bars.join('');
}

// ── SVG Memory Curve ──

function renderCurveSvg(word: FavoriteWord): string {
  const history = word.reviewHistory.slice(-8);
  if (history.length < 2) {
    return '<text x="300" y="110" text-anchor="middle" fill="var(--fg-muted)" font-size="14">数据不足</text>';
  }

  const w = 600, h = 200, pad = { top: 20, right: 40, bottom: 30, left: 40 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  // Calculate mastery for each review
  const points: Array<{ x: number; y: number; quality: number }> = [];
  for (let i = 0; i < history.length; i++) {
    const base = history[i].quality === 5 ? 95 : history[i].quality === 3 ? 70 : 30;
    points.push({
      x: pad.left + (i / (history.length - 1)) * plotW,
      y: pad.top + plotH - (base / 100) * plotH,
      quality: history[i].quality,
    });
  }

  // Forecast: 2 future points
  const last = history[history.length - 1];
  const lastBase = last.quality === 5 ? 95 : last.quality === 3 ? 70 : 30;
  for (let i = 0; i < 2; i++) {
    const decayMastery = Math.max(5, lastBase - (i + 1) * (100 - lastBase) * 0.3);
    points.push({
      x: pad.left + ((history.length - 1 + (i + 1) * 0.5) / (history.length - 1)) * plotW,
      y: pad.top + plotH - (decayMastery / 100) * plotH,
      quality: -1, // forecast marker
    });
  }

  let elements = '';

  // Y-axis grid + labels
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * plotH;
    elements += `<line x1="${pad.left}" y1="${y}" x2="${w - pad.right}" y2="${y}" stroke="var(--border-muted)" stroke-width="0.5"/>`;
    elements += `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" fill="var(--fg-muted)" font-size="10">${100 - i * 25}%</text>`;
  }

  // Solid polyline for real data
  const realPts = points.filter(p => p.quality >= 0);
  if (realPts.length > 1) {
    const d = realPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    elements += `<path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>`;
  }

  // Dashed polyline for forecast
  const forecastPts = points.filter(p => p.quality < 0);
  if (forecastPts.length > 0 && realPts.length > 0) {
    const lastReal = realPts[realPts.length - 1];
    const allForecast = [lastReal, ...forecastPts];
    const d = allForecast.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    elements += `<path d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.5"/>`;
  }

  // Colored dots
  for (const p of points) {
    const color = p.quality === 5 ? 'var(--accent-success)'
      : p.quality === 3 ? 'var(--accent-warning)'
      : p.quality === 1 ? 'var(--accent-danger)'
      : 'var(--fg-muted)';
    const r = p.quality < 0 ? 3 : 5;
    elements += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${color}" stroke="var(--bg-base)" stroke-width="1.5"/>`;
  }

  return elements;
}

function renderCurve(): void {
  const { words } = getState();
  const chipContainer = document.getElementById('curve-word-select');
  const svgWrap = document.getElementById('curve-svg-wrap');
  if (!chipContainer || !svgWrap) return;

  // Words with review history, up to 20, sorted by most recently reviewed
  const historyWords = words
    .filter(w => w.reviewHistory.length >= 2)
    .sort((a, b) => b.lastReviewedAt - a.lastReviewedAt)
    .slice(0, 20);

  if (historyWords.length === 0) {
    chipContainer.innerHTML = '';
    svgWrap.innerHTML = '<div style="text-align:center;padding:40px 0;color:var(--fg-muted);font-size:14px">暂无复习数据</div>';
    return;
  }

  // Default to first (most recently reviewed) if none selected or previous selection gone
  if (!selectedWordId || !historyWords.some(w => w.id === selectedWordId)) {
    selectedWordId = historyWords[0].id;
  }

  // Render chips
  chipContainer.innerHTML = historyWords.map(w =>
    `<button class="curve-word-chip${w.id === selectedWordId ? ' active' : ''}" data-word-id="${w.id}">${w.word}</button>`
  ).join('');

  // Render SVG for selected word
  const selected = words.find(w => w.id === selectedWordId);
  if (!selected) return;

  const svgContent = renderCurveSvg(selected);
  const lastInterval = selected.reviewHistory[selected.reviewHistory.length - 1]?.interval ?? '-';
  const nextReview = selected.nextReviewAt > 0 ? formatDate(selected.nextReviewAt) : '-';

  svgWrap.innerHTML = `<svg viewBox="0 0 600 220" xmlns="http://www.w3.org/2000/svg">
    ${svgContent}
    <text x="${600 - 40}" y="${220 - 8}" text-anchor="end" fill="var(--fg-muted)" font-size="10">
      EF: ${selected.easeFactor.toFixed(2)} · 间隔: ${lastInterval}天 · 下次: ${nextReview}
    </text>
  </svg>`;
}

// ── Exports ──

export function renderStats(): void {
  const { fullStats } = getState();
  if (!fullStats) return;
  renderOverview(fullStats);
  renderCalendar(fullStats);
  renderForecast(fullStats);
  renderCurve();
}

export function mountStats(): void {
  chipClickHandler = (e: Event) => {
    const target = e.target as HTMLElement;
    const chip = target.closest('.curve-word-chip') as HTMLElement | null;
    if (!chip?.dataset.wordId) return;
    selectedWordId = chip.dataset.wordId;
    renderCurve();
  };

  const container = document.getElementById('curve-word-select');
  if (container) {
    container.addEventListener('click', chipClickHandler);
  }
}

export function unmountStats(): void {
  if (chipClickHandler) {
    const container = document.getElementById('curve-word-select');
    if (container) {
      container.removeEventListener('click', chipClickHandler);
    }
    chipClickHandler = null;
  }
  selectedWordId = null;
}
