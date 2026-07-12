import type { WorkerRequest, WorkerResponse } from '../shared/messages';
import {
  translateRequest, speakRequest, toggleFavoriteRequest
} from '../shared/messages';
import { TriggerIcon } from './components/trigger-icon';
import { PopupBubble } from './components/popup-bubble';
import { SidePanel } from './components/side-panel';

const DEBOUNCE_MS = 200;

console.log('%c[划词翻译] content script 已加载 ✓', 'color:#7aa2f7;font-weight:bold');

// ── Service Worker 通信 ──
async function sendToWorker(req: WorkerRequest): Promise<WorkerResponse> {
  return chrome.runtime.sendMessage(req);
}

// 组件用 attachShadow + lit-html 渲染（不依赖 customElements，隔离世界可用）。
// 仅需 document.body 存在即可注入。
if (!document.body) {
  console.log('%c[划词翻译] 无 document.body，跳过注入', 'color:#e0af68');
} else {
  init();
}

function init(): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSelection: { text: string; rect: DOMRect } | null = null;

  // 所有 UI 挂在一个根容器下（普通 div，各组件内部自带 Shadow DOM）
  const root = document.createElement('div');
  root.id = 'translate-extension-root';
  document.body.appendChild(root);

  const triggerIcon = new TriggerIcon();
  const popupBubble = new PopupBubble();
  const sidePanel = new SidePanel();
  root.appendChild(triggerIcon.el);
  root.appendChild(popupBubble.el);
  root.appendChild(sidePanel.el);

  console.log('%c[划词翻译] 已注入，选中文字试试', 'color:#9ece6a;font-weight:bold');

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
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        triggerIcon.hide();
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      lastSelection = { text, rect };
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
  triggerIcon.el.addEventListener('trigger-translate', () => {
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
  popupBubble.el.addEventListener('expand-detail', () => {
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
  popupBubble.el.addEventListener('speak-word', onSpeak);
  sidePanel.el.addEventListener('speak-word', onSpeak);

  // ── 收藏切换 ──
  function onToggleFav(e: Event) {
    const detail = (e as CustomEvent).detail;
    sendToWorker(toggleFavoriteRequest(detail.word, detail.translation, window.location.href))
      .then(res => {
        if (res.type === 'FAVORITE_RESULT') sidePanel.setFavorited(res.added);
      })
      .catch(() => {});
  }
  popupBubble.el.addEventListener('toggle-favorite', onToggleFav);
  sidePanel.el.addEventListener('toggle-favorite', onToggleFav);

  // ── 侧边栏换源（跳过缓存，确保用下一个翻译源）──
  sidePanel.el.addEventListener('switch-source', () => {
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
  popupBubble.el.addEventListener('retry-translate', () => {
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
      triggerIcon.el.dispatchEvent(new CustomEvent('trigger-translate'));
    }
    if (message?.action === 'speak-selection' && lastSelection) {
      sendToWorker(speakRequest(lastSelection.text, 'en')).catch(() => {});
    }
  });
}
