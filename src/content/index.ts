import type { WorkerRequest, WorkerResponse } from '../shared/messages';
import {
  translateRequest, speakRequest, toggleFavoriteRequest, getSourcesRequest, analyzeGrammarRequest
} from '../shared/messages';
import { TriggerIcon } from './components/trigger-icon';
import { PopupBubble } from './components/popup-bubble';
import { SidePanel } from './components/side-panel';

const DEBOUNCE_MS = 200;

// ── Service Worker 通信 ──
async function sendToWorker(req: WorkerRequest): Promise<WorkerResponse> {
  return chrome.runtime.sendMessage(req);
}

// 语言签名，如 "EN → ZH"
function langSig(from: string, to: string): string {
  return `${from.toUpperCase()} → ${to.toUpperCase()}`;
}

// 组件用 attachShadow + lit-html 渲染（不依赖 customElements，隔离世界可用）。
// 仅需 document.body 存在即可注入。
if (document.body) {
  init();
}
// 从选区中提取上下文句子（选区所在的完整句子）
function getContext(sel: Selection): string {
  try {
    const range = sel.getRangeAt(0);
    // 获取选区所在段落/父元素的文本
    const container = range.commonAncestorContainer;
    const fullText = container.textContent || "";
    if (!fullText) return "";
    const selStart = range.startOffset;
    // 从选区开始位置向前后扩展到句子边界
    const sentenceBreaks = /[.!?。！？\n]/g;
    let ctxStart = selStart;
    let ctxEnd = selStart + sel.toString().length;
    // 向前扩展：找到最近的句子分隔符
    for (let i = selStart - 1; i >= 0; i--) {
      if (/[.!?。！？\n]/.test(fullText[i])) { ctxStart = i + 1; break; }
      ctxStart = i;
    }
    // 向后扩展：找到最近的句子分隔符
    for (let i = ctxEnd; i < fullText.length; i++) {
      if (/[.!?。！？\n]/.test(fullText[i])) { ctxEnd = i; break; }
      ctxEnd = i + 1;
    }
    const ctx = fullText.slice(ctxStart, ctxEnd).trim();
    return ctx.length > 0 && ctx.length < 500 ? ctx : "";
  } catch {
    return "";
  }
}


function init(): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSelection: { text: string; rect: DOMRect; context: string } | null = null;
  let sources: Array<{ id: string; name: string }> = [];
  const favoriteCache = new Set<string>();  // local cache to avoid flash on re-translate

  // 所有 UI 挂在一个根容器下（各组件内部自带 Shadow DOM）
  const root = document.createElement('div');
  root.id = 'translate-extension-root';
  document.body.appendChild(root);

  const triggerIcon = new TriggerIcon();
  const popupBubble = new PopupBubble();
  const sidePanel = new SidePanel();
  root.appendChild(triggerIcon.el);
  root.appendChild(popupBubble.el);
  root.appendChild(sidePanel.el);

  // 拉取已启用的翻译源（供侧栏和浮层设置面板渲染来源标签）
  function refreshSources(): void {
    sendToWorker(getSourcesRequest())
      .then(res => {
        if (res.type === 'SOURCES_RESULT') {
          sources = res.sources;
          popupBubble.setSources(sources, popupBubble.translation?.sourceId ?? '');
        }
      })
      .catch(() => {});
  }
  refreshSources();

  // ── 恢复用户偏好：字号（优先取滑条数值，否则从旧 string 转换）──
  chrome.storage.local.get(['fontScale']).then(data => {
    const val = (data as any)?.fontScale;
    const scale = typeof val === 'number' ? val : 20;
    popupBubble.applyFontScale(scale);
    sidePanel.applyFontScale(scale);
  }).catch(() => {});

  // ── 恢复透明度 ──
  chrome.storage.local.get(['popupOpacity']).then(data => {
    const v = (data as any)?.popupOpacity;
    if (typeof v === 'number') {
      popupBubble.setOpacity(v);
      sidePanel.el.style.setProperty('--card-opacity', String(v));
    }
  }).catch(() => {});

  // ── 恢复已存卡片尺寸 ──
  chrome.storage.local.get(['popupSize']).then(data => {
    const sz = (data as any)?.popupSize;
    if (sz?.width || sz?.maxHeight) popupBubble.restoreDimensions(sz.width, sz.maxHeight);
  }).catch(() => {});

  // ── 恢复翻译方向 ──
  chrome.storage.sync.get(['preferences']).then(data => {
    const prefs = (data as any)?.preferences;
    if (prefs) popupBubble.setLangs(prefs.sourceLang || 'auto', prefs.targetLang || 'zh');
  }).catch(() => {});

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
      lastSelection = { text, rect, context: getContext(sel) };
      triggerIcon.showAtRect(rect);
    }, DEBOUNCE_MS);
  });

  // ── 全局点击关闭（浮层固定时不关）──
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('#translate-extension-root')) {
      if (!popupBubble.pinned) popupBubble.hide();
      sidePanel.hide();
      triggerIcon.hide();
    }
  });

  // Esc 关闭：先关设置窗，再关卡片（固定态也关——用户显式按键盘）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (popupBubble.closeSettings()) return;
      popupBubble.hide();
      sidePanel.hide();
      triggerIcon.hide();
    }
  });

  // ── 翻译核心：发请求 → 浮层展示（所有翻译入口统一走这里）──
  function doTranslate(sourceId?: string) {
    if (!lastSelection) return;
    triggerIcon.hide();
    const rect = lastSelection.rect;
    popupBubble.setLoading(rect);
    const req = translateRequest(lastSelection.text, popupBubble.sourceLang, popupBubble.targetLang, window.location.href, !sourceId ? undefined : false, sourceId);
    sendToWorker(req)
      .then(res => {
        if (res.type === 'TRANSLATE_RESULT') {
          popupBubble.show(lastSelection!.text, res.translation, rect, langSig(res.from, res.to), favoriteCache.has(lastSelection!.text));
          popupBubble.setSources(sources, res.translation.sourceId ?? '');
          // Check if word is already favorited
          sendToWorker({ type: 'GET_FAVORITES' } as WorkerRequest)
            .then(favRes => {
              if (favRes.type === 'FAVORITES_RESULT') {
                const words = (favRes as any).words as Array<{word: string}> | undefined;
                const isFav = words?.some(w => w.word === lastSelection!.text) ?? false;
                popupBubble.setFavorited(isFav);
              }
            })
            .catch(() => {});
        } else if (res.type === 'TRANSLATE_ERROR') {
          popupBubble.setError(res.error, rect);
        }
      })
      .catch(() => popupBubble.setError('翻译失败，请重试', rect));
  }

  // ── 触发按钮 → 翻译 / 关闭（toggle）──
  triggerIcon.el.addEventListener('trigger-translate', () => {
    if (popupBubble.translation) {
      // 已有翻译结果浮层 → 关闭所有
      popupBubble.hide();
      sidePanel.hide();
      triggerIcon.hide();
      return;
    }
    doTranslate();
  });

  // ── 弹窗 → 展开侧边栏 ──
  popupBubble.el.addEventListener('expand-detail', () => {
    if (!lastSelection || !popupBubble.translation) return;
    const originalWord = lastSelection.text;
    const translation = popupBubble.translation;
    popupBubble.hide();
    sidePanel.show(originalWord, translation, sources, translation.sourceId);
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
    sendToWorker(toggleFavoriteRequest(detail.word, detail.translation, window.location.href, lastSelection?.context))
      .then(res => {
        if (res.type === 'FAVORITE_RESULT') {
          popupBubble.setFavorited(res.added);
          sidePanel.setFavorited(res.added);
          // Brief toast-like feedback via the popup bubble
          popupBubble.showToast(res.added ? '已收藏' : '已取消收藏');
          // Update local cache
          if (res.added) favoriteCache.add(detail.word);
          else favoriteCache.delete(detail.word);
        }
      })
      .catch(() => {});
  }
  popupBubble.el.addEventListener('toggle-favorite', onToggleFav);
  sidePanel.el.addEventListener('toggle-favorite', onToggleFav);

  // ── 侧栏 → 语法分析 ──
  sidePanel.el.addEventListener('analyze-grammar', (e) => {
    const detail = (e as CustomEvent).detail as { text: string; detail: 'brief' | 'full' } | undefined;
    if (!detail?.text) return;
    sidePanel.setGrammarLoading();
    sendToWorker(analyzeGrammarRequest(detail.text, 'en', detail.detail))
      .then(res => {
        if (res.type === 'GRAMMAR_RESULT') sidePanel.setGrammarResult(res.analysis);
        else if (res.type === 'GRAMMAR_ERROR') sidePanel.setGrammarError(res.error);
      })
      .catch(() => sidePanel.setGrammarError('语法分析失败'));
  });

  // ── 侧栏点击来源标签换源（指定源、面板原地刷新）──
  sidePanel.el.addEventListener('switch-source', (e) => {
    const sourceId = (e as CustomEvent).detail?.sourceId as string | undefined;
    if (!lastSelection || !sourceId) return;
    sendToWorker(translateRequest(lastSelection.text, 'auto', 'zh', window.location.href, false, sourceId))
      .then(res => {
        if (res.type === 'TRANSLATE_RESULT') {
          sidePanel.applySwitch(res.translation, sourceId);
        } else {
          sidePanel.clearSwitching();
        }
      })
      .catch(() => sidePanel.clearSwitching());
  });

  // ── 重试 ──
  popupBubble.el.addEventListener('retry-translate', () => doTranslate());

  // ── 快捷键 / popup 打开侧栏（来自 background 转发）──
  chrome.runtime.onMessage.addListener((msg: unknown) => {
    const message = msg as { action?: string; word?: string; translation?: import('../shared/types').TranslationResult };
    if (message?.action === 'translate-selection' && lastSelection) {
      triggerIcon.el.dispatchEvent(new CustomEvent('trigger-translate'));
    }
    if (message?.action === 'speak-selection' && lastSelection) {
      sendToWorker(speakRequest(lastSelection.text, 'en')).catch(() => {});
    }
    if (message?.action === 'show-sidebar' && message.word && message.translation) {
      popupBubble.hide();
      triggerIcon.hide();
      sidePanel.show(message.word, message.translation, sources, message.translation.sourceId ?? '');
    }
  });

  // ── 字号滑条变更 → 同步到侧栏 + 写入 local storage ──
  popupBubble.el.addEventListener('font-size-change', (e) => {
    const scale = (e as CustomEvent).detail?.scale as number | undefined;
    if (!scale) return;
    sidePanel.applyFontScale(scale);
    chrome.storage.local.set({ fontScale: scale }).catch(() => {});
  });

  // ── 翻译方向变更 → 写入 sync storage ──
  popupBubble.el.addEventListener('direction-change', (e) => {
    const detail = (e as CustomEvent).detail as { sourceLang: string; targetLang: string } | undefined;
    if (!detail) return;
    chrome.storage.sync.get(['preferences']).then(data => {
      const prefs: Record<string, unknown> = (data as any)?.preferences ?? {};
      prefs.sourceLang = detail.sourceLang;
      prefs.targetLang = detail.targetLang;
      chrome.storage.sync.set({ preferences: prefs }).catch(() => {});
    }).catch(() => {});
  });

  // ── 透明度变更 → 写入 local storage + 同步侧栏 ──
  popupBubble.el.addEventListener('opacity-change', (e) => {
    const opacity = (e as CustomEvent).detail?.opacity as number | undefined;
    if (opacity == null) return;
    chrome.storage.local.set({ popupOpacity: opacity }).catch(() => {});
    sidePanel.el.style.setProperty('--card-opacity', String(opacity));
  });

  // ── 浮层设置面板切源 → 重新翻译并原地刷新浮层 ──
  popupBubble.el.addEventListener('switch-source', (e) => {
    const sourceId = (e as CustomEvent).detail?.sourceId as string | undefined;
    if (sourceId) doTranslate(sourceId);
  });

  // ── 卡片调尺寸 → 写入 local storage 记住 ──
  popupBubble.el.addEventListener('resize-end', (e) => {
    const detail = (e as CustomEvent).detail as { width: number; maxHeight: number } | undefined;
    if (!detail) return;
    chrome.storage.local.set({ popupSize: { width: detail.width, maxHeight: detail.maxHeight } }).catch(() => {});
  });
}
