import type { TranslatorConfig, Preferences } from '../shared/types';

/** 需要 API Key 的翻译源 ID 集合 */
const API_KEY_IDS = new Set(['deepseek', 'tencent', 'baidu', 'deepl']);

/** 测试超时（毫秒）：请求可能长期挂起，UI 层兜底 */
const TEST_TIMEOUT_MS = 15000;

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

  translators.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'translator-card';
    card.dataset.id = t.id;
    const needsKey = API_KEY_IDS.has(t.id);
    const isFirst = i === 0;
    const isLast = i === translators.length - 1;
    card.innerHTML = `
      <div class="arrow-buttons">
        <button class="arrow-btn up-btn" ${isFirst ? 'disabled' : ''} data-index="${i}" title="上移">▲</button>
        <button class="arrow-btn down-btn" ${isLast ? 'disabled' : ''} data-index="${i}" title="下移">▼</button>
      </div>
      <div class="translator-info">
        <div class="translator-name">${t.name}</div>
        <div class="translator-desc">${needsKey ? '需要 API Key' : '免费使用'}</div>
        ${needsKey ? `<input class="api-key-input" type="password" placeholder="输入 API Key" data-id="${t.id}">` : ''}
      </div>
      <button class="toggle ${t.enabled ? 'enabled' : ''}" data-id="${t.id}" title="开关"></button>
    `;
    card.innerHTML += `
      <div class="translator-actions" style="flex-basis:100%">
        <button class="test-btn" data-test-id="${t.id}">测试连接</button>
        <span class="test-result" data-test-result="${t.id}"></span>
      </div>
    `;
    list.appendChild(card);
  });

  // 上移事件
  list.querySelectorAll('.up-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index!);
      if (index > 0) {
        [translators[index - 1], translators[index]] = [translators[index], translators[index - 1]];
        renderTranslators(translators);
      }
    });
  });

  // 下移事件
  list.querySelectorAll('.down-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index!);
      if (index < translators.length - 1) {
        [translators[index], translators[index + 1]] = [translators[index + 1], translators[index]];
        renderTranslators(translators);
      }
    });
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
    const id = (input as HTMLInputElement).dataset.id!;
    const t = translators.find(x => x.id === id)!;
    (input as HTMLInputElement).value = t.apiKey || '';
    input.addEventListener('input', () => {
      t.apiKey = (input as HTMLInputElement).value;
    });
  });

  // 测试连接事件
  list.querySelectorAll('.test-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.testId!;
      void runTest(id, list);
    });
  });
}

/** 测试指定翻译源：填写中的 Key 立即可测，无需先保存 */
async function runTest(id: string, list: HTMLElement): Promise<void> {
  const card = list.querySelector<HTMLElement>(`.translator-card[data-id="${id}"]`);
  if (!card) return;
  const btn = card.querySelector<HTMLButtonElement>('.test-btn');
  const resultEl = card.querySelector<HTMLElement>('.test-result');
  if (!btn || !resultEl) return;

  const input = card.querySelector<HTMLInputElement>('.api-key-input');
  const needsKey = API_KEY_IDS.has(id);
  const apiKey = input?.value.trim() || '';
  if (needsKey && !apiKey) {
    resultEl.className = 'test-result fail';
    resultEl.textContent = '请先填写 API Key';
    return;
  }

  const originalText = btn.textContent || '测试连接';
  btn.disabled = true;
  btn.textContent = '测试中…';
  resultEl.className = 'test-result';
  resultEl.textContent = '';

  let resp: { ok: boolean; message: string } | null = null;
  try {
    const send = chrome.runtime.sendMessage({
      type: 'TEST_TRANSLATOR',
      translatorId: id,
      apiKey,
    }) as Promise<{ ok: boolean; message: string }>;
    const timeout = new Promise<null>(res => setTimeout(() => res(null), TEST_TIMEOUT_MS));
    resp = await Promise.race([send, timeout]);
  } catch {
    resp = null;
  }

  btn.disabled = false;
  btn.textContent = originalText;

  if (resp?.ok) {
    resultEl.className = 'test-result ok';
    resultEl.textContent = `✓ 连接正常：${resp.message}`;
  } else {
    resultEl.className = 'test-result fail';
    resultEl.textContent = `✗ ${resp?.message || `测试超时（${TEST_TIMEOUT_MS / 1000} 秒），请检查网络、Key 或稍后重试`}`;
  }
}

let state: State;

async function init() {
  state = await loadSettings();

  // 按优先级排序一次，后续通过上下按钮调整顺序
  state.translators.sort((a, b) => a.priority - b.priority);
  renderTranslators(state.translators);

  // 没有启用任何翻译源 → 显示顶部引导横幅
  const enabledCount = state.translators.filter(t => t.enabled).length;
  const banner = document.getElementById('setup-banner');
  if (banner) banner.classList.toggle('visible', enabledCount === 0);

  const targetSel = document.getElementById('target-lang') as HTMLSelectElement;
  const sourceSel = document.getElementById('source-lang') as HTMLSelectElement;
  targetSel.value = state.preferences.targetLang;
  sourceSel.value = state.preferences.sourceLang;

  // ── 外观默认值（字体大小 + 透明度）──
  const fontSlider = document.getElementById('font-scale') as HTMLInputElement;
  const fontVal = document.getElementById('font-val')!;
  const opacitySlider = document.getElementById('opacity') as HTMLInputElement;
  const opacityVal = document.getElementById('opacity-val')!;

  // 加载当前值
  const local = await chrome.storage.local.get(['fontScale', 'popupOpacity']);
  const curFont = (local as any)?.fontScale ?? 20;
  const curOpacity = (local as any)?.popupOpacity ?? 0.95;
  fontSlider.value = String(curFont);
  fontVal.textContent = `${curFont}px`;
  opacitySlider.value = String(Math.round(curOpacity * 100));
  opacityVal.textContent = `${Math.round(curOpacity * 100)}%`;

  fontSlider.addEventListener('input', () => {
    fontVal.textContent = `${fontSlider.value}px`;
  });
  opacitySlider.addEventListener('input', () => {
    opacityVal.textContent = `${opacitySlider.value}%`;
  });

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

    // 同时保存外观默认值到 local storage
    await chrome.storage.local.set({
      fontScale: parseInt(fontSlider.value, 10),
      popupOpacity: parseInt(opacitySlider.value, 10) / 100,
    });

    const toast = document.getElementById('toast')!;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  });
}

init();
