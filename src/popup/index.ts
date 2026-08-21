import type { FavoriteWord } from '../shared/types';
import { Icons, escapeHtml } from '../vocab/utils';

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
  await Promise.all([loadStats(), loadDueAndRecent(), loadSetupBanner()]);
}

/** 没有启用的翻译源 → 显示配置引导横幅 */
async function loadSetupBanner(): Promise<void> {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }) as { translators?: Array<{ enabled: boolean }> } | undefined;
    const enabledCount = (resp?.translators ?? []).filter(t => t.enabled).length;
    const banner = document.getElementById('setup-banner');
    if (banner) banner.hidden = enabledCount > 0;
  } catch {
    // 查询失败时保持横幅隐藏，不打扰用户
  }
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
      ? f.translation.partsOfSpeech.map(p => p.meanings?.[0] ?? '').join('；')
      : f.translation.text;
    return `<div class="mini-word" tabindex="0" role="button" data-word-id="${f.id}">
      <span class="mw">${escapeHtml(f.word)}</span>
      <span class="mt">${escapeHtml(meaning)}</span>
    </div>`;
  }).join('');

  // Click to open side panel with word detail
  container.querySelectorAll('.mini-word').forEach(el => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.wordId;
      const word = recentFavs.find(f => f.id === id);
      if (!word) return;
      // 直接发给当前标签页的 content script；失败（chrome:// 页、新标签页等
      // 没有注入）时兜底打开生词本并定位到该词
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id != null) {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'show-sidebar',
            word: word.word,
            translation: word.translation,
          });
          window.close();
          return;
        }
      } catch { /* 当前页面不可用，走兜底 */ }
      await chrome.storage.local.set({ pendingFocusWord: word.word });
      await navigateOrFocus('browse');
    });
    el.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') {
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

// ── Tab navigation helper ──
// 无 "tabs" 权限时 chrome.tabs.query({url}) 的 URL 过滤不可用（chrome-extension:// 也无法配 host 权限），
// 因此改由 vocab 页加载时自报 tab id（chrome.tabs.getCurrent() 无需权限），这里按 id 复用/聚焦
async function navigateOrFocus(panel: string): Promise<void> {
  const targetUrl = chrome.runtime.getURL('src/vocab/index.html') + '#/' + panel;
  try {
    const { vocabTabId } = await chrome.storage.local.get('vocabTabId');
    if (typeof vocabTabId === 'number') {
      const tab = await chrome.tabs.get(vocabTabId); // 已关闭会 reject → 走兜底新开
      if (tab?.id != null) {
        await chrome.tabs.update(tab.id, { url: targetUrl, active: true });
        if (tab.windowId != null) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        window.close();
        return;
      }
    }
  } catch {
    // 标签页已关闭或不可用 → 新开
  }
  try {
    await chrome.tabs.create({ url: targetUrl });
  } catch { /* 兜底失败静默 */ }
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

document.getElementById('btn-setup')!.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// ── Go ──

init();
