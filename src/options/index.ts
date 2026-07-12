import type { TranslatorConfig, Preferences } from '../shared/types';

/** 需要 API Key 的翻译源 ID 集合 */
const API_KEY_IDS = new Set(['deepseek', 'tencent', 'baidu', 'deepl']);

interface State {
  translators: TranslatorConfig[];
  preferences: Preferences;
}

async function loadSettings(): Promise<State> {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  return {
    translators: resp.translators ?? [],
    preferences: resp.preferences ?? { theme: 'tokyo-night', fontSize: 'medium', targetLang: 'zh', sourceLang: 'auto' },
  };
}

function renderTranslators(translators: TranslatorConfig[]) {
  const list = document.getElementById('translators-list')!;
  list.innerHTML = '';

  translators
    .sort((a, b) => a.priority - b.priority)
    .forEach(t => {
      const card = document.createElement('div');
      card.className = 'translator-card';
      card.draggable = true;
      card.dataset.id = t.id;
      const needsKey = API_KEY_IDS.has(t.id);
      card.innerHTML = `
        <span class="drag-handle" title="拖拽排序">☰</span>
        <div class="translator-info">
          <div class="translator-name">${t.name}</div>
          <div class="translator-desc">${needsKey ? '需要 API Key' : '免费使用'}</div>
          ${needsKey ? `<input class="api-key-input" type="password" placeholder="输入 API Key" value="${escapeHtml(t.apiKey || '')}" data-id="${t.id}">` : ''}
        </div>
        <button class="toggle ${t.enabled ? 'enabled' : ''}" data-id="${t.id}" title="开关"></button>
      `;
      list.appendChild(card);
    });

  // 开关事件
  list.querySelectorAll('.toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id!;
      const t = translators.find(x => x.id === id)!;
      t.enabled = !t.enabled;
      renderTranslators(translators);
    });
  });

  // API key 输入事件
  list.querySelectorAll('.api-key-input').forEach(input => {
    input.addEventListener('input', () => {
      const id = (input as HTMLInputElement).dataset.id!;
      const t = translators.find(x => x.id === id)!;
      t.apiKey = (input as HTMLInputElement).value;
    });
  });

  // 拖拽排序 (简化版: 上下按钮)
  // 注意: 完整的拖拽排序需要更复杂的 DragEvent 处理
  // 这里用简单的上下箭头替代，后续可升级为完整拖拽
}

function escapeHtml(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

let state: State;

async function init() {
  state = await loadSettings();

  renderTranslators(state.translators);

  const targetSel = document.getElementById('target-lang') as HTMLSelectElement;
  const sourceSel = document.getElementById('source-lang') as HTMLSelectElement;
  targetSel.value = state.preferences.targetLang;
  sourceSel.value = state.preferences.sourceLang;

  document.getElementById('save')!.addEventListener('click', async () => {
    state.preferences.targetLang = targetSel.value as Preferences['targetLang'];
    state.preferences.sourceLang = sourceSel.value as Preferences['sourceLang'];

    // 重新编号优先级
    state.translators.forEach((t, i) => { t.priority = i + 1; });

    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      translators: state.translators,
      preferences: state.preferences,
    });

    const toast = document.getElementById('toast')!;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  });
}

init();
