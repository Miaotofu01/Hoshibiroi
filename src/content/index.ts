import type { WorkerRequest, WorkerResponse } from '../shared/messages';
import {
  translateRequest, speakRequest, toggleFavoriteRequest
} from '../shared/messages';
import { TriggerIcon } from './components/trigger-icon';
import { PopupBubble } from './components/popup-bubble';
import { SidePanel } from './components/side-panel';

// ── 挂载 Web Components ──
// Lit 组件定义通过 @customElement 自动注册，在这里 import 确保注册
// TriggerIcon, PopupBubble, SidePanel 已通过 decorator 注册

const DEBOUNCE_MS = 200;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// ── 初始化 DOM 容器 ──
function createHost(id: string): HTMLElement {
  const host = document.createElement('div');
  host.id = `tr-${id}`;
  // 挂载到 document.body 下的 Shadow DOM 容器
  const wrapper = document.createElement('div');
  wrapper.id = 'translate-extension-root';
  const existing = document.getElementById('translate-extension-root');
  if (existing) {
    existing.appendChild(host);
  } else {
    wrapper.appendChild(host);
    document.body.appendChild(wrapper);
  }
  return host;
}

// 所有 UI 组件在独立的容器内
const triggerHost = createHost('trigger');
const popupHost = createHost('popup');
const panelHost = createHost('panel');

const triggerIcon = document.createElement('trigger-icon') as TriggerIcon;
const popupBubble = document.createElement('popup-bubble') as PopupBubble;
const sidePanel = document.createElement('side-panel') as SidePanel;

triggerHost.appendChild(triggerIcon);
popupHost.appendChild(popupBubble);
panelHost.appendChild(sidePanel);

// ── 选区检测 ──
let lastSelection: { text: string; rect: DOMRect } | null = null;

document.addEventListener('mouseup', () => {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      triggerIcon.hide();
      return;
    }

    const text = sel.toString().trim();
    if (text.length === 0 || text.length > 2000) {
      triggerIcon.hide();
      return;
    }

    // 检查是否在 input/textarea 内
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      triggerIcon.hide();
      return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    lastSelection = { text, rect };

    // 在选区末尾右侧显示触发按钮
    const x = rect.right + 4;
    const y = rect.top;
    triggerIcon.show(x, y);
  }, DEBOUNCE_MS);
});

// ── 全局点击关闭 ──
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  // 检查点击是否在插件 UI 内部
  const isInExtension = target.closest('#translate-extension-root');
  if (!isInExtension) {
    popupBubble.hide();
    sidePanel.hide();
    triggerIcon.hide();
  }
});

// Esc 关闭
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    popupBubble.hide();
    sidePanel.hide();
    triggerIcon.hide();
  }
});

// ── 事件处理 ──

// 触发按钮 → 发起翻译
triggerIcon.addEventListener('trigger-translate', () => {
  if (!lastSelection) return;
  triggerIcon.hide();

  const rect = lastSelection.rect;
  popupBubble.setLoading(rect);

  sendToWorker(translateRequest(lastSelection.text, 'auto', 'zh'))
    .then(res => {
      if (res.type === 'TRANSLATE_RESULT') {
        popupBubble.show(lastSelection!.text, res.translation, rect);
      } else if (res.type === 'TRANSLATE_ERROR') {
        popupBubble.setError(res.error, rect);
      }
    });
});

// 弹窗 → 展开侧边栏
popupBubble.addEventListener('expand-detail', () => {
  if (!lastSelection || !popupBubble.translation) return;
  popupBubble.hide();
  sidePanel.show(lastSelection.text, popupBubble.translation);
});

// 朗读
function onSpeak(e: Event) {
  const detail = (e as CustomEvent).detail;
  sendToWorker(speakRequest(detail.word, 'en'));
}
popupBubble.addEventListener('speak-word', onSpeak);
sidePanel.addEventListener('speak-word', onSpeak);

// 收藏切换
function onToggleFav(e: Event) {
  const detail = (e as CustomEvent).detail;
  sendToWorker(toggleFavoriteRequest(
    detail.word, detail.translation, window.location.href
  )).then(res => {
    if (res.type === 'FAVORITE_RESULT') {
      sidePanel.setFavorited(res.added);
    }
  });
}
popupBubble.addEventListener('toggle-favorite', onToggleFav);
sidePanel.addEventListener('toggle-favorite', onToggleFav);

// 侧边栏换源
sidePanel.addEventListener('switch-source', () => {
  if (!lastSelection) return;
  // 简单重试翻译（translator 会自动尝试下一个源，但由于当前翻译可能已经被缓存，这里直接重新请求）
  // 实际逻辑可以跳过缓存，但简单起见：告知用户手动在 options 调整优先级后关闭面板重新划词
  // TODO: 更完善的换源逻辑 — 传 skipCache 标记
  sidePanel.hide();
  popupBubble.setLoading(lastSelection.rect);
  sendToWorker(translateRequest(lastSelection.text, 'auto', 'zh'))
    .then(res => {
      if (res.type === 'TRANSLATE_RESULT') {
        popupBubble.show(lastSelection!.text, res.translation, lastSelection!.rect);
      }
    });
});

// 重试
popupBubble.addEventListener('retry-translate', () => {
  if (!lastSelection) return;
  popupBubble.setLoading(lastSelection.rect);
  sendToWorker(translateRequest(lastSelection.text, 'auto', 'zh'))
    .then(res => {
      if (res.type === 'TRANSLATE_RESULT') {
        popupBubble.show(lastSelection!.text, res.translation, lastSelection!.rect);
      } else if (res.type === 'TRANSLATE_ERROR') {
        popupBubble.setError(res.error, lastSelection!.rect);
      }
    });
});

// ── Service Worker 通信 ──
async function sendToWorker(req: WorkerRequest): Promise<WorkerResponse> {
  return chrome.runtime.sendMessage(req);
}

// ── 快捷键 ──
chrome.runtime.onMessage.addListener((msg: unknown) => {
  const message = msg as { action?: string };
  // 处理来自 background 的快捷键指令
  if (message?.action === 'translate-selection' && lastSelection) {
    triggerIcon.dispatchEvent(new CustomEvent('trigger-translate'));
  }
});
