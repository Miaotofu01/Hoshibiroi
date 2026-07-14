import type { VocabSettings } from '../../shared/types';
import { getState, saveSettings, loadWords } from '../state';
import { exportCSV, exportJSON } from '../export';

// ── Field labels ──

const FRONT_LABELS: Record<string, string> = {
  word: '单词',
  phonetic: '音标',
  context: '上下文',
};

const BACK_LABELS: Record<string, string> = {
  meaning: '释义',
  pos: '词性',
  examples: '例句',
  context: '上下文',
  source: '来源',
};

// ── Drawer controls ──

export function openDrawer(): void {
  renderSettings();
  document.getElementById('drawer')?.classList.add('open');
  document.getElementById('drawer-overlay')?.classList.add('open');
  document.body.classList.add('overflow-hidden');
}

export function closeDrawer(): void {
  document.getElementById('drawer')?.classList.remove('open');
  document.getElementById('drawer-overlay')?.classList.remove('open');
  document.body.classList.remove('overflow-hidden');
}

// ── Render ──

export function renderSettings(): void {
  const s = getState().settings;
  const body = document.querySelector('.drawer-body');
  if (!body) return;

  const frontCheckboxes = (['word', 'phonetic', 'context'] as const).map(
    (f) =>
      `<label class="syo-checkbox setting-check">
        <input type="checkbox" data-field="front-${f}" ${s.cardFront.includes(f) ? 'checked' : ''}>
        <span class="syo-checkmark"></span> ${FRONT_LABELS[f]}
      </label>`,
  );

  const backCheckboxes = (
    ['meaning', 'pos', 'examples', 'context', 'source'] as const
  ).map(
    (f) =>
      `<label class="syo-checkbox setting-check">
        <input type="checkbox" data-field="back-${f}" ${s.cardBack.includes(f) ? 'checked' : ''}>
        <span class="syo-checkmark"></span> ${BACK_LABELS[f]}
      </label>`,
  );

  const newLimitOptions = [5, 10, 15, 20, 25]
    .map((n) => `<option value="${n}" ${s.dailyNewLimit === n ? 'selected' : ''}>${n}</option>`)
    .join('');

  const reviewLimitOptions = [
    { value: 20, label: '20' },
    { value: 30, label: '30' },
    { value: 50, label: '50' },
    { value: 100, label: '100' },
    { value: 0, label: '无限制' },
  ]
    .map((o) => `<option value="${o.value}" ${s.dailyReviewLimit === o.value ? 'selected' : ''}>${o.label}</option>`)
    .join('');

  const layoutRadios = (['minimal', 'context-first'] as const).map(
    (lo) =>
      `<label class="syo-radio setting-radio">
        <input type="radio" name="cardLayout" value="${lo}" ${s.cardLayout === lo ? 'checked' : ''}>
        <span class="syo-radiomark"></span> ${lo === 'minimal' ? '不背单词（单词为主）' : '上下文优先（句子挖空）'}
      </label>`,
  );

  body.innerHTML = `
    <div class="setting-section">
      <div class="setting-section-title">卡片模板</div>
      <div class="setting-group">
        <div class="setting-label">正面显示</div>
        ${frontCheckboxes.join('')}
      </div>
      <div class="setting-group">
        <div class="setting-label">背面显示</div>
        ${backCheckboxes.join('')}
      </div>
      <div class="setting-group">
        <div class="setting-label">布局风格</div>
        ${layoutRadios.join('')}
      </div>
    </div>
    <div class="setting-section">
      <div class="setting-section-title">学习参数</div>
      <div class="setting-group">
        <div class="setting-label">每日新词上限</div>
        <select class="syo-select setting-select" id="setting-new-limit">${newLimitOptions}</select>
      </div>
      <div class="setting-group">
        <div class="setting-label">每日复习上限</div>
        <select class="syo-select setting-select" id="setting-review-limit">${reviewLimitOptions}</select>
      </div>
    </div>
    <div class="setting-section">
      <div class="setting-section-title">通知</div>
      <label class="syo-checkbox setting-check">
        <input type="checkbox" id="setting-reminder" ${s.reviewReminder ? 'checked' : ''}>
        <span class="syo-checkmark"></span> 复习提醒
      </label>
      <label class="syo-checkbox setting-check">
        <input type="checkbox" id="setting-celebration" ${s.goalCelebration ? 'checked' : ''}>
        <span class="syo-checkmark"></span> 达标庆祝
      </label>
    </div>
    <div class="setting-section">
      <div class="setting-section-title">数据</div>
      <div class="setting-actions">
        <button class="syo-btn setting-btn" id="btn-export-csv">导出 CSV</button>
        <button class="syo-btn setting-btn" id="btn-export-json">导出 JSON</button>
        <button class="syo-btn setting-btn danger" id="btn-clear-all">清除全部数据</button>
      </div>
    </div>
  `;
}

// ── Read current form values ──

function readSettingsFromForm(): VocabSettings {
  const body = document.querySelector('.drawer-body');
  if (!body) return getState().settings;

  // Card front checkboxes
  const cardFront: VocabSettings['cardFront'] = [];
  for (const f of ['word', 'phonetic', 'context'] as const) {
    const el = body.querySelector(`[data-field="front-${f}"]`) as HTMLInputElement | null;
    if (el?.checked) cardFront.push(f);
  }

  // Card back checkboxes
  const cardBack: VocabSettings['cardBack'] = [];
  for (const f of ['meaning', 'pos', 'examples', 'context', 'source'] as const) {
    const el = body.querySelector(`[data-field="back-${f}"]`) as HTMLInputElement | null;
    if (el?.checked) cardBack.push(f);
  }

  // Select values
  const newLimitSelect = document.getElementById(
    'setting-new-limit',
  ) as HTMLSelectElement | null;
  const reviewLimitSelect = document.getElementById(
    'setting-review-limit',
  ) as HTMLSelectElement | null;
  const dailyNewLimit = newLimitSelect ? parseInt(newLimitSelect.value, 10) : 10;
  const dailyReviewLimit = reviewLimitSelect
    ? parseInt(reviewLimitSelect.value, 10)
    : 50;

  // Notification checkboxes
  const reminderEl = document.getElementById(
    'setting-reminder',
  ) as HTMLInputElement | null;
  const celebrationEl = document.getElementById(
    'setting-celebration',
  ) as HTMLInputElement | null;
  const reviewReminder = reminderEl?.checked ?? true;
  const goalCelebration = celebrationEl?.checked ?? false;

  // Read cardLayout from radio buttons
  const layoutEl = body.querySelector('input[name="cardLayout"]:checked') as HTMLInputElement | null;
  const cardLayout = (layoutEl?.value as 'minimal' | 'context-first') || 'minimal';

  return {
    cardFront,
    cardBack,
    cardLayout,
    dailyNewLimit,
    dailyReviewLimit,
    reviewReminder,
    goalCelebration,
  };
}

// ── Event handlers (stored for cleanup) ──

let saveHandler: ((e: Event) => void) | null = null;
let delegationHandler: ((e: Event) => void) | null = null;
let closeHandler: ((e: Event) => void) | null = null;
let overlayClickHandler: ((e: Event) => void) | null = null;
let escapeKeyHandler: ((e: Event) => void) | null = null;

export function mountSettings(): void {
  saveHandler = async () => {
    const newSettings = readSettingsFromForm();
    await saveSettings(newSettings);
    Sayo.toast.show('设置已保存', { type: 'success' });
    closeDrawer();
  };

  delegationHandler = (e: Event) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('button');
    if (!btn) return;
    if (btn.id === 'btn-export-csv') { e.stopPropagation(); exportCSV(); }
    else if (btn.id === 'btn-export-json') { e.stopPropagation(); exportJSON(); }
    else if (btn.id === 'btn-clear-all') {
      e.stopPropagation();
      (async () => {
        const ok = await Sayo.dialog.confirm({
          title: '清除全部数据',
          message: '此操作不可恢复，所有生词和复习记录将被永久删除。',
          confirmText: '确认清除',
          cancelText: '取消',
        });
        if (!ok) return;
        const { words } = getState();
        for (const w of words) {
          try {
            await chrome.runtime.sendMessage({ type: 'REMOVE_FAVORITE', wordId: w.id });
          } catch { /* continue */ }
        }
        await loadWords();
        Sayo.toast.show('已清除全部数据', { type: 'success' });
      })();
    }
  };

  closeHandler = (e: Event) => {
    e.stopPropagation();
    closeDrawer();
  };

  overlayClickHandler = (_e: Event) => {
    closeDrawer();
  };

  escapeKeyHandler = (e: Event) => {
    if ((e as KeyboardEvent).key === 'Escape') {
      closeDrawer();
    }
  };

  document.getElementById('save-settings')?.addEventListener('click', saveHandler);
  document.querySelector('.drawer-body')?.addEventListener('click', delegationHandler);
  document.getElementById('drawer-close-btn')?.addEventListener('click', closeHandler);
  document.getElementById('drawer-overlay')?.addEventListener('click', overlayClickHandler);
  document.addEventListener('keydown', escapeKeyHandler);
}

export function unmountSettings(): void {
  if (saveHandler) {
    document.getElementById('save-settings')?.removeEventListener('click', saveHandler);
  }
  if (delegationHandler) {
    document.querySelector('.drawer-body')?.removeEventListener('click', delegationHandler);
  }
  if (closeHandler) {
    document.getElementById('drawer-close-btn')?.removeEventListener('click', closeHandler);
  }
  if (overlayClickHandler) {
    document.getElementById('drawer-overlay')?.removeEventListener('click', overlayClickHandler);
  }
  if (escapeKeyHandler) {
    document.removeEventListener('keydown', escapeKeyHandler);
  }
  saveHandler = null;
  delegationHandler = null;
  closeHandler = null;
  overlayClickHandler = null;
  escapeKeyHandler = null;
}
