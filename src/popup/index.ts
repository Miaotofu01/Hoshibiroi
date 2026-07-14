import type { FavoriteWord } from '../shared/types';
import { Icons } from '../vocab/utils';

interface StatsData {
  reviewedToday: number;
  dailyGoal: number;
  streak: number;
  total: number;
}

let dueCount = 0;
let recentFavs: FavoriteWord[] = [];

// ── Load all data ──

async function init(): Promise<void> {
  await Promise.all([loadStats(), loadDueAndRecent()]);
  updateCtaIcon();
}

async function loadStats(): Promise<void> {
  try {
    const stats = await chrome.runtime.sendMessage({ type: 'GET_FULL_STATS' }) as StatsData | undefined;
    if (!stats || typeof stats.reviewedToday !== 'number') {
      showFallback();
      return;
    }

    // Streak
    document.getElementById('streak-num')!.textContent = String(stats.streak);
    const fireEl = document.getElementById('streak-fire')!;
    if (stats.streak >= 3) {
      fireEl.style.display = '';
      fireEl.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28"><path d="M12 23c-3.866 0-7-3.134-7-7 0-3.566 2.292-6.514 4.446-9.79C10.252 4.83 11 3.295 11 2c0 0 2 3 2 6 0 1.933-1.567 3.5-3.5 3.5S6 9.933 6 8c0-.684.172-1.33.473-1.892C5.535 7.544 5 9.188 5 11c0 3.866 3.134 7 7 7s7-3.134 7-7c0-1.812-.535-3.456-1.473-4.892C17.828 6.67 18 7.316 18 8c0 1.933-1.567 3.5-3.5 3.5S11 9.933 11 8c0-3 2-6 2-6 0 1.295.748 2.83 1.554 4.21C16.708 9.486 19 12.434 19 16c0 3.866-3.134 7-7 7z"/></svg>';
    } else {
      fireEl.style.display = 'none';
    }

    // Today stat
    document.getElementById('reviewed-today')!.textContent = String(stats.reviewedToday);
    document.getElementById('daily-goal')!.textContent = String(stats.dailyGoal || 20);

    // Progress bar
    const goal = stats.dailyGoal || 20;
    const pct = goal > 0 ? Math.min(100, Math.round((stats.reviewedToday / goal) * 100)) : 0;
    document.getElementById('progress-fill')!.style.width = pct + '%';
    document.getElementById('progress-label')!.textContent =
      pct >= 100 ? '今日目标达成！' : `目标 ${stats.reviewedToday}/${goal}`;
  } catch {
    showFallback();
  }
}

async function loadDueAndRecent(): Promise<void> {
  try {
    const [favResp, dueResp] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_FAVORITES' }),
      chrome.runtime.sendMessage({ type: 'GET_DUE_WORDS' }),
    ]);
    const words = (favResp?.words ?? []) as FavoriteWord[];
    const due = (dueResp?.words ?? []) as FavoriteWord[];
    dueCount = due.length;

    // Due info + CTA update
    const dueEl = document.getElementById('due-info')!;
    const ctaBtn = document.getElementById('btn-review')!;
    if (dueCount > 0) {
      dueEl.innerHTML = `共 <strong>${dueCount}</strong> 个词待复习`;
      ctaBtn.innerHTML = `<span class="ico">${Icons.play}</span> 开始复习`;
      ctaBtn.style.opacity = '1';
    } else if (words.length === 0) {
      dueEl.textContent = '收藏单词即可开始';
      ctaBtn.innerHTML = `<span class="ico">${Icons.book}</span> 浏览生词本`;
      ctaBtn.style.opacity = '1';
    } else {
      dueEl.textContent = '暂无待复习词汇';
      ctaBtn.innerHTML = `<span class="ico">${Icons.book}</span> 浏览生词本`;
      ctaBtn.style.background = 'var(--syo-bg-elevated)';
      ctaBtn.style.color = 'var(--syo-info)';
      ctaBtn.style.border = '1px solid var(--syo-info)';
    }

    // Show due words if any; otherwise recent favorites
    if (due.length > 0) {
      recentFavs = due.slice(0, 5);
    } else {
      recentFavs = words.slice(-5).reverse();
    }
    renderRecent(due.length > 0);
  } catch {
    document.getElementById('due-info')!.textContent = '加载失败';
    const container = document.getElementById('recent-favs')!;
    container.innerHTML = '<div class="mini-empty">加载失败，请重试</div>';
  }
}

// Update CTA icon to SVG (replaces unicode text)
function updateCtaIcon(): void {
  const btn = document.getElementById('btn-review');
  if (!btn) return;
  // Remove text prefix nodes, keep only SVG icon
  const ico = btn.querySelector('.ico');
  if (ico && !ico.querySelector('svg')) {
    ico.innerHTML = '<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  }
}

function renderRecent(isDue: boolean): void {
  const container = document.getElementById('recent-favs')!;
  const titleEl = document.querySelector('.mini-title');
  if (titleEl) titleEl.textContent = isDue ? '待复习' : '最近收藏';
  if (recentFavs.length === 0) {
    container.innerHTML = '<div class="mini-empty">还没有收藏词汇</div>';
    return;
  }
  container.innerHTML = recentFavs.map(f => {
    const meaning = f.translation.partsOfSpeech?.length
      ? f.translation.partsOfSpeech.map(p => p.meanings[0]).join('；')
      : f.translation.text;
    return `<div class="mini-word" tabindex="0" role="button" data-word-id="${f.id}">
      <span class="mw">${escapeHtml(f.word)}</span>
      <span class="mt">${escapeHtml(meaning)}</span>
    </div>`;
  }).join('');

  // Click to open side panel with word detail
  container.querySelectorAll('.mini-word').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.wordId;
      const word = recentFavs.find(f => f.id === id);
      if (!word) return;
      chrome.runtime.sendMessage({
        type: 'SHOW_SIDEBAR',
        word: word.word,
        translation: word.translation,
      }).catch(() => {});
      window.close();
    });
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        (el as HTMLElement).click();
      }
    });
  });
}

function showFallback(): void {
  document.getElementById('streak-num')!.textContent = '--';
  document.getElementById('reviewed-today')!.textContent = '--';
  document.getElementById('daily-goal')!.textContent = '--';
}

function escapeHtml(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

// ── Tab navigation helper ──
async function navigateOrFocus(panel: string): Promise<void> {
  const baseUrl = chrome.runtime.getURL('src/vocab/index.html');
  const targetUrl = baseUrl + '#/' + panel;
  try {
    const tabs = await chrome.tabs.query({ url: baseUrl + '*' });
    if (tabs.length > 0 && tabs[0].id != null) {
      // Update URL hash of existing tab and focus it
      await chrome.tabs.update(tabs[0].id, { url: targetUrl, active: true });
      if (tabs[0].windowId != null) {
        await chrome.windows.update(tabs[0].windowId, { focused: true });
      }
    } else {
      await chrome.tabs.create({ url: targetUrl });
    }
  } catch {
    // Fallback: create new tab
    await chrome.tabs.create({ url: targetUrl });
  }
  window.close();
}

// ── Events ──

document.getElementById('btn-review')!.addEventListener('click', () => {
  navigateOrFocus('learn');
});

document.getElementById('open-vocab')!.addEventListener('click', () => {
  navigateOrFocus('browse');
});

document.getElementById('open-options')!.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ── Go ──

init();
