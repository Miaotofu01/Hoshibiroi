import type { HistoryEntry } from '../shared/types';

async function loadHistory(): Promise<void> {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_HISTORY' });
  const entries: HistoryEntry[] = resp?.entries ?? [];

  const list = document.getElementById('history-list')!;
  if (entries.length === 0) {
    list.innerHTML = '<div class="empty">暂无翻译记录</div>';
    return;
  }

  list.innerHTML = entries.slice(0, 20)
    .map(e => `
      <div class="entry">
        <div>
          <span class="word">${escapeHtml(e.word)}</span>
          <span class="source">${escapeHtml(e.translation.source)}</span>
        </div>
        <div>
          <span class="trans">${escapeHtml(e.translation.text)}</span>
        </div>
      </div>
    `).join('');
}

function escapeHtml(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

document.getElementById('open-options')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

loadHistory();
