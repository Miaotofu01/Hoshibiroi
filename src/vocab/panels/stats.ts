import type { FullStatsResponse } from '../../shared/messages';
import { getState } from '../state';

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
    `${stats.reviewedToday} / ${stats.dailyGoal} · 剩 ${remaining}`;
}

// ── Calendar Heatmap (GitHub-style: columns=weeks, rows=days) ──

function renderCalendar(stats: FullStatsResponse): void {
  const grid = document.getElementById('calendar-grid');
  const monthBar = document.getElementById('calendar-months');
  if (!grid) return;

  if (stats.calendar.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;color:var(--syo-fg-muted);font-size:14px;padding:20px 0;text-align:center">暂无数据</div>';
    if (monthBar) { monthBar.innerHTML = ''; monthBar.style.visibility = 'visible'; }
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
    monthBar.style.visibility = 'visible';
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
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
    const weekday = dayNames[d.getDay()];
    const pct = (day.count / maxCount) * 100;
    const heavy = day.count > 15 ? 'heavy' : '';
    return `<div class="forecast-row ${heavy}">
      <span class="date-label">${dateStr}</span>
      <span class="date-weekday">${weekday}</span>
      <div class="forecast-bar-track">
        <div class="forecast-bar-fill" style="width:${pct}%"></div>
      </div>
      <span class="count-label">${day.count} 个</span>
    </div>`;
  });

  list.innerHTML = bars.join('');
}

// ── Exports ──

export function renderStats(): void {
  const { fullStats } = getState();
  if (!fullStats) return;
  renderOverview(fullStats);
  renderCalendar(fullStats);
  renderForecast(fullStats);
}

export function mountStats(): void {
  // Stats panel has no interactive elements to bind
}

export function unmountStats(): void {
  // Stats panel has no interactive elements to unbind
}
