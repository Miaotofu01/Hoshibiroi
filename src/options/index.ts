import type { TranslatorConfig, Preferences, AssistantSettings, AssistantPreset } from '../shared/types';
import { CONTEXT_STEPS, DEFAULT_ASSISTANT_PRESETS, LOCKED_INJECTION_RULE, normalizeAssistantSettings } from '../shared/assistant';
import { escapeHtml } from '../vocab/utils';

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

  // ── AI 助手设置（直接读写 storage.local，无需经 worker）──
  const ctxSlider = document.getElementById('assistant-context') as HTMLInputElement;
  const ctxVal = document.getElementById('assistant-context-val')!;
  const thinkSel = document.getElementById('assistant-thinking') as HTMLSelectElement;
  const maxTok = document.getElementById('assistant-max-tokens') as HTMLInputElement;
  const rulesBox = document.getElementById('assistant-rules') as HTMLTextAreaElement;
  const presetsBox = document.getElementById('assistant-presets')!;

  // 锁定的防注入规则只读展示：让用户看得到兜底存在，也知道为何改不了
  document.getElementById('assistant-locked-rule')!.textContent = LOCKED_INJECTION_RULE;

  const ctxLabel = () => (CONTEXT_STEPS[parseInt(ctxSlider.value, 10)] === 0
    ? '仅选中范围'
    : `${CONTEXT_STEPS[parseInt(ctxSlider.value, 10)] / 1000}k 字`);

  const localAssistant = await chrome.storage.local.get(['assistantSettings']);
  const a = normalizeAssistantSettings((localAssistant as any)?.assistantSettings);

  /** 预设编辑区的当前值（与 storage 分开维护：用户改完点保存才写盘） */
  let presets: AssistantPreset[] = a.presets.map(p => ({ ...p }));

  /**
   * 渲染预设列表。每行：标签 / 提示词 / 需要选中 / 取上下文 / 上移 / 下移 / 删除。
   * 用 index 定位而不是 id：id 由归一化在保存时补生成，编辑期可能还是空的。
   */
  const renderPresets = (): void => {
    if (presets.length === 0) {
      presetsBox.innerHTML = '<div class="hint" style="padding:4px 0">还没有预设，保存后会恢复默认预设。</div>';
      return;
    }
    presetsBox.innerHTML = presets.map((p, i) => `
      <div class="preset-row" data-i="${i}">
        <div class="preset-head">
          <input class="api-key-input preset-label" data-i="${i}" data-f="label" value="${escapeAttr(p.label)}" placeholder="按钮文字" style="width:140px;margin-left:0">
          <label class="hint" style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap">
            <input type="checkbox" data-i="${i}" data-f="needsSelection" ${p.needsSelection ? 'checked' : ''}> 需要选中
          </label>
          <select class="api-key-input" data-i="${i}" data-f="focus" style="width:150px;margin-left:0">
            <option value="selection" ${p.focus === 'selection' ? 'selected' : ''}>围绕选中内容</option>
            <option value="document-start" ${p.focus === 'document-start' ? 'selected' : ''}>从页面开头</option>
          </select>
          <span style="margin-left:auto;display:inline-flex;gap:4px">
            <button type="button" class="arrow-btn" data-i="${i}" data-a="up" title="上移" ${i === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" class="arrow-btn" data-i="${i}" data-a="down" title="下移" ${i === presets.length - 1 ? 'disabled' : ''}>▼</button>
            <button type="button" class="arrow-btn" data-i="${i}" data-a="del" title="删除">✕</button>
          </span>
        </div>
        <textarea class="api-key-input preset-prompt" data-i="${i}" data-f="prompt" placeholder="点击后发出的提问" style="width:100%;height:56px;margin-left:0">${escapeHtml(p.prompt)}</textarea>
      </div>`).join('');
  };

  /** 事件委托：列表是重渲染出来的，逐行绑监听会在每次增删后失效 */
  presetsBox.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const i = Number(el.dataset.i);
    const f = el.dataset.f as keyof AssistantPreset | undefined;
    if (!Number.isFinite(i) || !f || !presets[i]) return;
    if (f === 'needsSelection') presets[i].needsSelection = (el as HTMLInputElement).checked;
    else if (f === 'focus') presets[i].focus = (el as HTMLSelectElement).value === 'document-start' ? 'document-start' : 'selection';
    else if (f === 'label') presets[i].label = el.value;
    else if (f === 'prompt') presets[i].prompt = el.value;
  });

  presetsBox.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button[data-a]') as HTMLButtonElement | null;
    if (!btn) return;
    const i = Number(btn.dataset.i);
    if (!Number.isFinite(i) || !presets[i]) return;
    const action = btn.dataset.a;
    if (action === 'del') presets.splice(i, 1);
    else if (action === 'up' && i > 0) [presets[i - 1], presets[i]] = [presets[i], presets[i - 1]];
    else if (action === 'down' && i < presets.length - 1) [presets[i + 1], presets[i]] = [presets[i], presets[i + 1]];
    else return;
    renderPresets();
  });

  document.getElementById('assistant-preset-add')!.addEventListener('click', () => {
    // id 留空：保存时由归一化按内容确定性补生成，避免这里造出会重复的 id
    presets.push({ id: '', label: '', prompt: '', needsSelection: true, focus: 'selection' });
    renderPresets();
  });

  document.getElementById('assistant-preset-reset')!.addEventListener('click', () => {
    presets = DEFAULT_ASSISTANT_PRESETS.map(p => ({ ...p }));
    renderPresets();
  });

  document.getElementById('assistant-rules-reset')!.addEventListener('click', () => {
    rulesBox.value = '';   // 留空即回落默认（归一化负责），保存时生效
  });

  /** 把一条设置灌回控件（初始化与 storage 变更共用） */
  const fillControls = (s: AssistantSettings): void => {
    ctxSlider.value = String(Math.max(0, CONTEXT_STEPS.indexOf(s.contextChars)));
    ctxVal.textContent = ctxLabel();
    thinkSel.value = s.thinking;
    maxTok.value = String(s.maxAnswerTokens);
    rulesBox.value = s.rules;
    presets = s.presets.map(p => ({ ...p }));
    renderPresets();
  };
  fillControls(a);

  ctxSlider.addEventListener('input', () => { ctxVal.textContent = ctxLabel(); });

  // 选项页可能长期开着：弹泡那边改了上下文长度/思考深度，这里要跟着刷新控件，
  // 否则保存时会把弹泡刚改的值按过期的控件值写回去（下面保存时虽然会重读 storage，
  // 但「控件值覆盖上去」的合并规则挡不住这份过期值）。
  // includeSelection 没有对应控件，完全以 storage 为准，绝不在保存时被硬编码成 true。
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.assistantSettings) return;
    fillControls(normalizeAssistantSettings(changes.assistantSettings.newValue));
  });

  document.getElementById('save')!.addEventListener('click', async () => {
    // 先重读一次 storage 再做合并：本页初始化时读到的是一份旧快照，
    // 直接按控件重写全部字段会顺手把弹泡改过的设置和已存的 includeSelection 抹掉
    const stored = await chrome.storage.local.get(['assistantSettings']);
    const base = normalizeAssistantSettings((stored as any)?.assistantSettings);
    await chrome.storage.local.set({
      assistantSettings: normalizeAssistantSettings({
        ...base,
        contextChars: CONTEXT_STEPS[parseInt(ctxSlider.value, 10)],
        thinking: thinkSel.value,
        maxAnswerTokens: parseInt(maxTok.value, 10),
        // 规则与预设以本页控件为准（这两个正是本页在编辑的东西）
        rules: rulesBox.value,
        presets,
      }),
    });
  });
}

/**
 * 属性值转义：复用共享的 escapeHtml（覆盖 & < >），再补上引号——
 * escapeHtml 基于 textContent，只挡文本节点的那三个字符，属性值里的引号必须自己挡。
 */
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

init();
