import type { FavoriteWord } from '../../shared/types';
import type { FullStatsResponse } from '../../shared/messages';
import { getState } from '../state';

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
    `今日已复习 ${stats.reviewedToday} 个 · 目标 ${stats.dailyGoal} 个 · 还剩 ${remaining} 个`;
}

// ── Calendar Heatmap (GitHub-style: columns=weeks, rows=days) ──

function renderCalendar(stats: FullStatsResponse): void {
  const grid = document.getElementById('calendar-grid');
  const monthBar = document.getElementById('calendar-months');
  if (!grid) return;

  if (stats.calendar.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;color:var(--syo-fg-muted);font-size:14px;padding:20px 0;text-align:center">暂无数据</div>';
    if (monthBar) monthBar.innerHTML = '';
    return;
  }

  const firstDate = new Date(stats.calendar[0].date + 'T00:00:00');
  const startDay = firstDate.getDay(); // 0=Sun
  const offset = (startDay + 6) % 7;   // days to skip before Monday

  const cells: string[] = [];

  // Empty placeholder cells for day-of-week alignment
  for (let i = 0; i < offset; i++) {
    cells.push('<span class="calendar-cell empty"></span>');
  }

  // Data cells
  for (const day of stats.calendar) {
    let level = '';
    if (day.count >= 10) level = 'level-3';
    else if (day.count >= 5) level = 'level-2';
    else if (day.count >= 1) level = 'level-1';
    cells.push(
      `<span class="calendar-cell ${level}" title="${day.date}: ${day.count} 次复习"></span>`
    );
  }

  grid.innerHTML = cells.join('');

  // Month labels
  if (monthBar) {
    const months: string[] = [];
    let currentMonth = -1;
    for (let i = 0; i < stats.calendar.length; i++) {
      const d = new Date(stats.calendar[i].date + 'T00:00:00');
      if (d.getMonth() !== currentMonth) {
        currentMonth = d.getMonth();
        const weekIndex = Math.floor((i + offset) / 7);
        months.push(`<span style="grid-column:${weekIndex + 1}">${d.getMonth() + 1}月</span>`);
      }
    }
    monthBar.innerHTML = months.join('');
    monthBar.style.display = '';
  }
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

export function renderCurveSvg(word: FavoriteWord): string {
  const history = word.reviewHistory.slice(-8);
  if (history.length < 2) {
    return `<text x="300" y="100" text-anchor="middle" fill="var(--syo-fg-muted)" font-size="14">数据不足 — 完成至少 2 次复习后显示曲线</text>`;
  }

  const w = 600, h = 240, pad = { top: 20, right: 40, bottom: 40, left: 40 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const tMin = history[0].timestamp;
  const tMax = Math.max(history[history.length - 1].timestamp, word.nextReviewAt || 0);
  const tRange = (tMax - tMin) || 86400000;

  function tx(ts: number): number { return pad.left + ((ts - tMin) / tRange) * plotW; }
  function ry(r: number): number { return pad.top + plotH - (r * plotH); }
  function estStability(interval: number): number { return Math.max(0.3, interval / 1.05); }
  function postRetention(q: number): number {
    return q === 5 ? 0.95 : q === 3 ? 0.80 : 0.25;
  }

  let elements = '';

  // ── Y-axis: simple 0%/50%/100% ──
  for (const pct of [100, 50, 0]) {
    const y = pad.top + ((100 - pct) / 100) * plotH;
    elements += `<line x1="${pad.left}" y1="${y}" x2="${w - pad.right}" y2="${y}" stroke="var(--syo-border-muted)" stroke-width="0.5"/>`;
    elements += `<text x="${pad.left - 6}" y="${y + 4}" text-anchor="end" fill="var(--syo-fg-muted)" font-size="10">${pct}%</text>`;
  }
  elements += `<text x="12" y="${pad.top + plotH/2}" text-anchor="middle" fill="var(--syo-fg-muted)" font-size="10" transform="rotate(-90, 12, ${pad.top + plotH/2})">记忆保留率</text>`;

  // ── Build curve segments ──
  const reviewDots: Array<{ x: number; y: number; quality: number; interval: number; date: Date }> = [];
  let solidD = '';
  let dashD = '';

  for (let i = 0; i < history.length; i++) {
    const r = history[i];
    const rt = postRetention(r.quality);
    const revX = tx(r.timestamp);
    const revY = ry(rt);
    const S = estStability(r.interval);

    reviewDots.push({ x: revX, y: revY, quality: r.quality, interval: r.interval, date: new Date(r.timestamp) });

    const nextTs = i < history.length - 1 ? history[i + 1].timestamp
      : (word.nextReviewAt > Date.now() ? word.nextReviewAt : 0);
    if (nextTs <= r.timestamp || S <= 0) continue;

    const endX = tx(nextTs);
    const tDays = (nextTs - r.timestamp) / 86400000;
    const endRet = Math.max(0.05, rt * Math.exp(-tDays / S));
    const endY = ry(endRet);

    const dx = endX - revX;
    const dy = endY - revY;
    const cp1x = revX + dx * 0.25;
    const cp1y = revY + dy * 0.15;
    const cp2x = revX + dx * 0.65;
    const cp2y = revY + dy * 0.85;

    const isForecast = i === history.length - 1 && word.nextReviewAt > Date.now();
    if (isForecast) {
      if (!dashD) dashD = `M ${revX.toFixed(1)} ${revY.toFixed(1)}`;
      dashD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}`;
    } else {
      if (!solidD) solidD = `M ${revX.toFixed(1)} ${revY.toFixed(1)}`;
      solidD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${endX.toFixed(1)} ${endY.toFixed(1)}`;
    }
  }

  if (solidD) {
    elements += `<path d="${solidD}" fill="none" stroke="var(--syo-info)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  if (dashD) {
    elements += `<path d="${dashD}" fill="none" stroke="var(--syo-info)" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.4"/>`;
  }

  // ── X-axis: first & last date ──
  for (const idx of [0, history.length - 1]) {
    const d = reviewDots[idx];
    if (!d || (idx > 0 && reviewDots[0].date.toDateString() === d.date.toDateString())) continue;
    const ds = `${d.date.getMonth() + 1}/${d.date.getDate()}`;
    elements += `<text x="${d.x.toFixed(1)}" y="${pad.top + plotH + 16}" text-anchor="middle" fill="var(--syo-fg-muted)" font-size="10">${ds}</text>`;
  }

  // ── Review dots + ALL interval labels ──
  for (let i = 0; i < reviewDots.length; i++) {
    const d = reviewDots[i];
    const color = d.quality === 5 ? 'var(--syo-success)'
      : d.quality === 3 ? 'var(--syo-warning)'
      : 'var(--syo-danger)';
    elements += `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="5" fill="${color}" stroke="var(--syo-bg-base)" stroke-width="2"/>`;
    if (d.interval > 0) {
      // Show interval above each dot — this is the progress story
      const ly = d.y - 12;
      elements += `<text x="${d.x.toFixed(1)}" y="${ly}" text-anchor="middle" fill="var(--syo-fg-muted)" font-size="10">${d.interval}天</text>`;
    }
  }

  // ── Forecast: shaded uncertainty band ──
  if (word.nextReviewAt > Date.now() && history.length > 0) {
    const lastR = history[history.length - 1];
    const lastS = estStability(lastR.interval);
    const lastRt = postRetention(lastR.quality);
    const nx = tx(word.nextReviewAt);
    if (nx < w - pad.right) {
      const t = (word.nextReviewAt - lastR.timestamp) / 86400000;
      const nr = Math.max(0.05, lastRt * Math.exp(-t / lastS));
      const ny = ry(nr);
      // Wider uncertainty band
      const nrHi = Math.min(1, nr * 1.5);
      const nrLo = Math.max(0.02, nr * 0.5);
      elements += `<rect x="${tx(lastR.timestamp)}" y="${ry(nrHi)}" width="${nx - tx(lastR.timestamp)}" height="${ry(nrLo) - ry(nrHi)}" fill="var(--syo-info)" opacity="0.06" rx="4"/>`;
      elements += `<circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="5" fill="none" stroke="var(--syo-fg-muted)" stroke-width="1.5" stroke-dasharray="3,2"/>`;
      const nds = `${new Date(word.nextReviewAt).getMonth() + 1}/${new Date(word.nextReviewAt).getDate()}`;
      elements += `<text x="${nx.toFixed(1)}" y="${ny - 10}" text-anchor="middle" fill="var(--syo-fg-muted)" font-size="10">下次${nds}</text>`;
    }
  }

  // ── Legend ──
  const legendY = h - 10;
  const items = [
    { color: 'var(--syo-success)', label: '认识' },
    { color: 'var(--syo-warning)', label: '模糊' },
    { color: 'var(--syo-danger)', label: '不认识' },
  ];
  let lx = pad.left;
  for (const item of items) {
    elements += `<circle cx="${lx + 4}" cy="${legendY}" r="4" fill="${item.color}"/>`;
    elements += `<text x="${lx + 12}" y="${legendY + 4}" fill="var(--syo-fg-muted)" font-size="11">${item.label}</text>`;
    lx += 48;
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
    svgWrap.innerHTML = '<div style="text-align:center;padding:40px 0;color:var(--syo-fg-muted);font-size:14px">完成几次复习后，这里会显示每个词的记忆曲线</div>';
    return;
  }

  // Default to first if none selected or previous selection gone
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
  const history = selected.reviewHistory;
  const last = history[history.length - 1];
  const nextReview = selected.nextReviewAt > 0
    ? new Date(selected.nextReviewAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    : '-';
  const lastQualityLabel = last?.quality === 5 ? '认识' : last?.quality === 3 ? '模糊' : '不认识';

  // Trend: are intervals getting longer? (good sign)
  let trend = '';
  if (history.length >= 3) {
    const recent = history.slice(-3);
    const intervals = recent.map(r => r.interval).filter(Boolean);
    if (intervals.length >= 2 && intervals.every((v, i) => i === 0 || v >= intervals[i - 1])) {
      trend = ' · 间隔增长中 ↑';
    }
  }

  // Convert easeFactor to a user-friendly mastery indicator
  const ef = selected.easeFactor;
  let stabilityLabel: string;
  if (ef <= 0) stabilityLabel = '-';
  else if (ef < 1.5) stabilityLabel = '初级';
  else if (ef < 2.5) stabilityLabel = '稳定';
  else if (ef < 5.0) stabilityLabel = '熟练';
  else stabilityLabel = '精通';

  svgWrap.innerHTML = `<svg viewBox="0 0 600 240" xmlns="http://www.w3.org/2000/svg">
    ${svgContent}
  </svg>
  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-family:var(--font-mono);font-size:12px;color:var(--syo-fg-muted)">
    <span>上次复习：<b style="color:var(--syo-fg-default)">${lastQualityLabel}</b></span>
    <span>当前间隔：<b style="color:var(--syo-fg-default)">${last?.interval ?? '-'} 天</b></span>
    <span>熟练度：<b style="color:var(--syo-fg-default)">${stabilityLabel}</b></span>
    <span>下次复习：<b style="color:var(--syo-fg-default)">${nextReview}</b></span>
    ${trend ? `<span style="color:var(--syo-success)">${trend}</span>` : ''}
  </div>`;
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
