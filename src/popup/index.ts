import type { HistoryEntry, FavoriteWord } from '../shared/types';

let currentTab: 'history' | 'favorites' = 'history';
let historyEntries: HistoryEntry[] = [];
let favoriteWords: FavoriteWord[] = [];

// ── 数据加载 ──

async function loadData(): Promise<void> {
  const [histResp, favResp] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_HISTORY' }),
    chrome.runtime.sendMessage({ type: 'GET_FAVORITES' }),
  ]);
  historyEntries = histResp?.entries ?? [];
  favoriteWords = favResp?.words ?? [];
  document.getElementById('hist-count')!.textContent = historyEntries.length ? `(${historyEntries.length})` : '';
  document.getElementById('fav-count')!.textContent = favoriteWords.length ? `(${favoriteWords.length})` : '';
  renderList();
}

// ── 渲染 ──

function escapeHtml(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

function renderList(): void {
  const list = document.getElementById('list')!;
  const query = (document.getElementById('search') as HTMLInputElement).value.trim().toLowerCase();

  if (currentTab === 'history') {
    const filtered = query
      ? historyEntries.filter(e => e.word.toLowerCase().includes(query) || e.translation.text.toLowerCase().includes(query))
      : historyEntries;
    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty">${query ? '没有匹配的记录' : '暂无翻译记录'}</div>`;
      return;
    }
    list.innerHTML = filtered.map((e, i) => `
      <div class="entry" data-idx="${i}" data-tab="history">
        <div class="row1">
          <span class="word">${escapeHtml(e.word)}</span>
          <span class="src">${escapeHtml(e.translation.source)}</span>
          <button class="cpy-btn" data-text="${escapeHtml(e.translation.text)}" title="复制译文">📋</button>
        </div>
        <div class="trans">${escapeHtml(e.translation.text)}</div>
        <div class="meta">${timeAgo(e.timestamp)}</div>
      </div>`).join('');
  } else {
    const filtered = query
      ? favoriteWords.filter(f => f.word.toLowerCase().includes(query) || f.translation.text.toLowerCase().includes(query))
      : favoriteWords;
    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty">${query ? '没有匹配的收藏' : '暂无收藏词汇 · 在浮层点 ⭐ 收藏'}</div>`;
      return;
    }
    list.innerHTML = filtered.map((f, i) => `
      <div class="entry" data-idx="${i}" data-tab="favorites">
        <div class="row1">
          <span class="word">${escapeHtml(f.word)}</span>
          <span class="src">${escapeHtml(f.translation.source)}</span>
          <button class="cpy-btn" data-text="${escapeHtml(f.translation.text)}" title="复制译文">📋</button>
        </div>
        <div class="trans">${escapeHtml(f.translation.text)}</div>
        <div class="meta">${timeAgo(f.createdAt)} · 复习 ${f.reviewCount} 次</div>
      </div>`).join('');
  }

  // 复制按钮
  list.querySelectorAll('.cpy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = (btn as HTMLElement).dataset.text || '';
      navigator.clipboard.writeText(text).then(() => showToast()).catch(() => {});
    });
  });

  // 条目点击 → 打开侧栏显示详情
  list.querySelectorAll('.entry').forEach(el => {
    el.addEventListener('click', () => {
      const tab = (el as HTMLElement).dataset.tab;
      const idx = parseInt((el as HTMLElement).dataset.idx || '', 10);
      if (isNaN(idx)) return;
      const entry = tab === 'favorites' ? favoriteWords[idx] : historyEntries[idx];
      if (!entry) return;
      chrome.runtime.sendMessage({
        type: 'SHOW_SIDEBAR',
        word: entry.word,
        translation: entry.translation,
      }).catch(() => {});
      window.close(); // 关闭 popup
    });
  });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Toast ──

function showToast(): void {
  const toast = document.getElementById('toast')!;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1200);
}

// ── 标签页 ──

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = (btn as HTMLElement).dataset.tab as 'history' | 'favorites';
    (document.getElementById('search') as HTMLInputElement).value = '';
    renderList();
  });
});

// ── 搜索 ──

document.getElementById('search')!.addEventListener('input', () => renderList());

// ── 打开生词本 ──

document.getElementById('open-vocab')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/vocab/index.html') });
});

// ── 打开设置 ──

document.getElementById('open-options')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ── Go ──

loadData();
