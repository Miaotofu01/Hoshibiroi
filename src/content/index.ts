import type { WorkerRequest, WorkerResponse } from '../shared/messages';
import {
  translateRequest, speakRequest, toggleFavoriteRequest
} from '../shared/messages';
import { TriggerIcon } from './components/trigger-icon';
import { PopupBubble } from './components/popup-bubble';
import { SidePanel } from './components/side-panel';

const DEBOUNCE_MS = 200;

// ── Service Worker 通信 ──
async function sendToWorker(req: WorkerRequest): Promise<WorkerResponse> {
  return chrome.runtime.sendMessage(req);
}

// 某些帧（sandbox / about:blank / 受限上下文）没有 customElements，
// 组件无法注册，此时静默退出，绝不抛错拖垮整个脚本。
if (typeof customElements === 'undefined' || !customElements || !document.body) {
  console.debug('[划词翻译] 当前帧不支持自定义元素，跳过注入');
} else {
  init();
}

function init(): void {
  // 手动注册（组件已去掉 @customElement 自动注册），带 get 守卫防重复定义
  if (!customElements.get('trigger-icon')) customElements.define('trigger-icon', TriggerIcon);
  if (!customElements.get('popup-bubble')) customElements.define('popup-bubble', PopupBubble);
  if (!customElements.get('side-panel')) customElements.define('side-panel', SidePanel);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSelection: { text: string; rect: DOMRect } | null = null;

  // ── 初始化 DOM 容器 ──
  function createHost(id: string): HTMLElement {
    const host = document.createElement('div');
    host.id = `tr-${id}`;
    // 普通容器 div，挂到 document.body 下（各 Lit 组件内部有自己的 Shadow DOM）
    let root = document.getElementById('translate-extension-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'translate-extension-root';
      document.body.appendChild(root);
    }
    root.appendChild(host);
    return host;
  }

  const triggerIcon = new TriggerIcon();
  const popupBubble = new PopupBubble();
  const sidePanel = new SidePanel();

  createHost('trigger').appendChild(triggerIcon);
  createHost('popup').appendChild(popupBubble);
  createHost('panel').appendChild(sidePanel);

  console.debug('[划词翻译] 已注入，组件注册完成');

  // ── 选区检测 ──
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
      // 在 input/textarea 内选中不触发
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        triggerIcon.hide();
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      lastSelection = { text, rect };
      // 触发按钮显示在选区末尾右侧（视口坐标，position:fixed）
      triggerIcon.show(rect.right + 4, rect.top);
    }, DEBOUNCE_MS);
  });

  // ── 全局点击关闭 ──
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('#translate-extension-root')) {
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

  // ── 触发按钮 → 发起翻译 ──
  triggerIcon.addEventListener('trigger-translate', () => {
    if (!lastSelection) return;
    triggerIcon.hide();
    const rect = lastSelection.rect;
    popupBubble.setLoading(rect);
    sendToWorker(translateRequest(lastSelection.text, 'auto', 'zh', window.location.href))
      .then(res => {
        if (res.type === 'TRANSLATE_RESULT') {
          popupBubble.show(lastSelection!.text, res.translation, rect);
        } else if (res.type === 'TRANSLATE_ERROR') {
          popupBubble.setError(res.error, rect);
        }
      })
      .catch(() => popupBubble.setError('翻译失败，请重试', rect));
  });

  // ── 弹窗 → 展开侧边栏 ──
  popupBubble.addEventListener('expand-detail', () => {
    if (!lastSelection || !popupBubble.translation) return;
    const originalWord = lastSelection.text;
    const translation = popupBubble.translation;
    popupBubble.hide();
    sidePanel.show(originalWord, translation);
  });

  // ── 朗读 ──
  function onSpeak(e: Event) {
    const detail = (e as CustomEvent).detail;
    sendToWorker(speakRequest(detail.word, 'en')).catch(() => {});
  }
  popupBubble.addEventListener('speak-word', onSpeak);
  sidePanel.addEventListener('speak-word', onSpeak);

  // ── 收藏切换 ──
  function onToggleFav(e: Event) {
    const detail = (e as CustomEvent).detail;
    sendToWorker(toggleFavoriteRequest(detail.word, detail.translation, window.location.href))
      .then(res => {
        if (res.type === 'FAVORITE_RESULT') sidePanel.setFavorited(res.added);
      })
      .catch(() => {});
  }
  popupBubble.addEventListener('toggle-favorite', onToggleFav);
  sidePanel.addEventListener('toggle-favorite', onToggleFav);

  // ── 侧边栏换源（跳过缓存，确保用下一个翻译源）──
  sidePanel.addEventListener('switch-source', () => {
    if (!lastSelection) return;
    sidePanel.hide();
    popupBubble.setLoading(lastSelection.rect);
    sendToWorker(translateRequest(lastSelection.text, 'auto', 'zh', window.location.href, true))
      .then(res => {
        if (res.type === 'TRANSLATE_RESULT') {
          popupBubble.show(lastSelection!.text, res.translation, lastSelection!.rect);
        } else if (res.type === 'TRANSLATE_ERROR') {
          popupBubble.setError(res.error, lastSelection!.rect);
        }
      })
      .catch(() => {});
  });

  // ── 重试 ──
  popupBubble.addEventListener('retry-translate', () => {
    if (!lastSelection) return;
    popupBubble.setLoading(lastSelection.rect);
    sendToWorker(translateRequest(lastSelection.text, 'auto', 'zh', window.location.href))
      .then(res => {
        if (res.type === 'TRANSLATE_RESULT') {
          popupBubble.show(lastSelection!.text, res.translation, lastSelection!.rect);
        } else if (res.type === 'TRANSLATE_ERROR') {
          popupBubble.setError(res.error, lastSelection!.rect);
        }
      })
      .catch(() => {});
  });

  // ── 快捷键（来自 background 的 onCommand 转发）──
  chrome.runtime.onMessage.addListener((msg: unknown) => {
    const message = msg as { action?: string };
    if (message?.action === 'translate-selection' && lastSelection) {
      triggerIcon.dispatchEvent(new CustomEvent('trigger-translate'));
    }
    if (message?.action === 'speak-selection' && lastSelection) {
      sendToWorker(speakRequest(lastSelection.text, 'en')).catch(() => {});
    }
  });
}
