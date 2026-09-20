import type { WorkerRequest, WorkerResponse } from '../shared/messages';
import {
  translateRequest, speakRequest, toggleFavoriteRequest, getSourcesRequest, analyzeGrammarRequest
} from '../shared/messages';
import { TriggerIcon } from './components/trigger-icon';
import { PopupBubble } from './components/popup-bubble';
import { SidePanel } from './components/side-panel';
import { AssistantController } from './assistant/controller';
import { triggerIntent } from './trigger-intent';

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
  // 翻译序号：滚动/关闭会使在途请求失效，避免结果回来后弹回一张位置错误的卡片。
  // 声明在 init 开头——上面的 scroll 监听器（capture）会引用它
  let translateSeq = 0;

  // 所有 UI 挂在一个根容器下（各组件内部自带 Shadow DOM）
  const root = document.createElement('div');
  root.id = 'translate-extension-root';
  document.body.appendChild(root);

  const triggerIcon = new TriggerIcon();
  const popupBubble = new PopupBubble();
  const sidePanel = new SidePanel();
  // 历史回显要带正确的收藏态：把同一份缓存注入卡片（content script 是它的所有者）
  popupBubble.attachFavoriteCache(favoriteCache);

  // ── AI 助手：一个页面一个控制器，弹泡与侧栏共享同一会话 ──
  const assistant = new AssistantController();
  popupBubble.attachAssistant(assistant);
  sidePanel.attachAssistant(assistant);

  root.appendChild(triggerIcon.el);
  root.appendChild(popupBubble.el);
  root.appendChild(sidePanel.el);

  // ── 页面明暗检测：给各组件挂 theme-light/theme-dark，Shadow DOM 内据此切换 token ──
  function detectPageTheme(): 'light' | 'dark' {
    for (const el of [document.body, document.documentElement]) {
      const bg = getComputedStyle(el).backgroundColor;
      const m = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' ? bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/) : null;
      if (m) {
        const lum = 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]);
        return lum > 140 ? 'light' : 'dark';
      }
    }
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  const pageTheme = detectPageTheme();
  for (const c of [triggerIcon, popupBubble, sidePanel]) {
    c.el.classList.add(`theme-${pageTheme}`);
  }

  // ── 视口滚动：未固定的弹泡/触发图标随选区滚走，一并隐藏（固定态除外）──
  window.addEventListener('scroll', () => {
    if (popupBubble.pinned) return;
    if (popupBubble.el.style.display !== 'none') {
      translateSeq++; // 使在途翻译请求失效
      popupBubble.hide();
    }
    triggerIcon.hide();
  }, { capture: true, passive: true });

  // ── 窗口尺寸变化：未固定的弹泡按锚点重新摆放 ──
  window.addEventListener('resize', () => {
    if (popupBubble.pinned || !lastSelection) return;
    if (popupBubble.el.style.display !== 'none') {
      popupBubble.reposition(lastSelection.rect);
    }
  });

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

  // ── 恢复助手模式的卡片尺寸（初始化时还在翻译模式，进助手模式时生效）──
  chrome.storage.local.get(['assistantSize']).then(data => {
    const sz = (data as any)?.assistantSize;
    if (sz?.width || sz?.maxHeight) popupBubble.restoreAssistantDimensions(sz.width, sz.maxHeight);
  }).catch(() => {});

  // ── 恢复弹泡知识区显示配置 ──
  chrome.storage.local.get(['popupSections']).then(data => {
    popupBubble.setSections((data as any)?.popupSections);
  }).catch(() => {});

  // ── 助手设置：读 local，变更写回，并跨上下文同步 ──
  // 侧栏不用注入设置：它渲染的一切都从共享控制器读（控制器才是权威）
  function applyAssistantSettings(raw: unknown): void {
    assistant.setSettings(raw);
    popupBubble.setAssistantSettings(raw);
  }
  chrome.storage.local.get(['assistantSettings']).then(d => {
    applyAssistantSettings((d as any)?.assistantSettings);
  }).catch(() => applyAssistantSettings(undefined));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.assistantSettings) return;
    applyAssistantSettings(changes.assistantSettings.newValue);   // 选项页改完立即生效
  });

  popupBubble.el.addEventListener('assistant-settings-change', (e: Event) => {
    const s = (e as CustomEvent).detail?.settings;
    if (!s) return;
    // 先同步交给控制器：写盘可能失败（配额/权限），失败时滑条与实际请求用的值就分叉了，
    // 而控制器是唯一决定下一次请求参数的权威
    assistant.setSettings(s);
    chrome.storage.local.set({ assistantSettings: s }).catch(() => {});
  });

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
      // 长文本支持：最多 20000 字符（worker 侧自动分块翻译；再长视为误选整页）
      if (text.length === 0 || text.length > 20000) {
        triggerIcon.hide();
        return;
      }
      const activeEl = document.activeElement as HTMLElement | null;
      const inEditable = activeEl !== null && (
        activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' ||
        activeEl.isContentEditable ||
        !!activeEl.closest?.('[contenteditable="true"], [contenteditable=""]')
      );
      // 选区落在富文本编辑区（Gmail/Notion/评论区等）也不触发——用户可能只是在编辑
      const anchorEl = sel.anchorNode?.nodeType === Node.TEXT_NODE
        ? sel.anchorNode.parentElement
        : (sel.anchorNode as HTMLElement | null);
      const inEditableSelection = !!anchorEl?.closest?.('[contenteditable="true"], [contenteditable=""]');
      if (inEditable || inEditableSelection) {
        triggerIcon.hide();
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const context = getContext(sel);
      lastSelection = { text, rect, context };
      assistant.setSelection(text, context);
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

  // Esc 关闭：先关设置窗，再清助手草稿，最后关卡片（固定态也关——用户显式按键盘）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (popupBubble.closeSettings()) return;
      if (popupBubble.handleEscape()) return;   // 助手输入框有草稿 → 先清草稿
      popupBubble.hide();
      sidePanel.hide();
      triggerIcon.hide();
    }
  });

  // ── 助手模式切换：进入时确保卡片可见并定位到选区 ──
  popupBubble.el.addEventListener('mode-change', (e: Event) => {
    const mode = (e as CustomEvent).detail?.mode as 'translate' | 'assistant' | undefined;
    if (mode !== 'assistant') return;
    const rect = lastSelection?.rect ?? new DOMRect(window.innerWidth / 2, 120, 1, 1);
    popupBubble.ensureVisible(rect);
  });

  // ── 卡片右上角 ✕：联动收起触发图标与侧栏 ──
  popupBubble.el.addEventListener('close-popup', () => {
    popupBubble.hide();
    sidePanel.hide();
    triggerIcon.hide();
  });

  // ── 翻译核心：发请求 → 浮层展示（所有翻译入口统一走这里）──
  function doTranslate(sourceId?: string) {
    if (!lastSelection) return;
    triggerIcon.hide();
    const rect = lastSelection.rect;
    popupBubble.setLoading(rect);
    const seq = ++translateSeq;
    const req = translateRequest(lastSelection.text, popupBubble.sourceLang, popupBubble.targetLang, window.location.href, !sourceId ? undefined : false, sourceId);
    sendToWorker(req)
      .then(res => {
        if (seq !== translateSeq) return; // 已被滚动/关闭失效
        if (res.type === 'TRANSLATE_RESULT') {
          popupBubble.show(lastSelection!.text, res.translation, rect, langSig(res.from, res.to), favoriteCache.has(lastSelection!.text));
          popupBubble.setSources(sources, res.translation.sourceId ?? '');
          // 记入译文历史（同词同源只留一条）；滚动/关闭不清空，只有刷新页面才清
          popupBubble.pushHistory(lastSelection!.text, res.translation.sourceId ?? '', langSig(res.from, res.to), res.translation);
          // 单查收藏状态（不再全量拉取词库；带 lemma 使词形归并后仍能正确高亮）
          sendToWorker({ type: 'CHECK_FAVORITE', word: lastSelection!.text, lemma: res.translation.lemma } as WorkerRequest)
            .then(favRes => {
              if (favRes.type === 'FAVORITE_CHECK_RESULT') {
                popupBubble.setFavorited(favRes.favorited);
                if (favRes.favorited) favoriteCache.add(lastSelection!.text);
                else favoriteCache.delete(lastSelection!.text);
              }
            })
            .catch(() => {});
        } else if (res.type === 'TRANSLATE_ERROR') {
          popupBubble.setError(res.error, rect);
        }
      })
      .catch(() => {
        if (seq !== translateSeq) return;
        popupBubble.setError('翻译失败，请检查网络或翻译源设置', rect);
      });
  }

  // ── 触发按钮 → 翻译 / 关闭（toggle）──
  triggerIcon.el.addEventListener('trigger-translate', () => {
    // 意图由纯逻辑判定（见 trigger-intent.ts）：卡片上已经是当前选区这个词 → 关闭；
    // 选区换成了别的词 → 翻译新词。旧实现只看「有没有译文」，导致卡片开着时
    // 选中第二个词再点「译」会直接把卡片关掉，新选的词永远不被翻译。
    const intent = triggerIntent({
      hasCard: !!popupBubble.translation,
      displayedWord: popupBubble.originalWord,
      selectionText: lastSelection?.text ?? null,
    });
    if (intent === 'close') {
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

  // ── 从弹泡把对话搬到侧栏（会话在控制器里，搬过去不中断）──
  popupBubble.el.addEventListener('open-assistant-panel', () => {
    // hide() 会清掉弹泡那份草稿，先把没发出去的问题读出来交给面板
    const draft = popupBubble.chatDraft;
    popupBubble.hide();
    sidePanel.showAssistant(draft);
  });

  // ── 朗读（语言由 worker 按文本自动检测）──
  function onSpeak(e: Event) {
    const detail = (e as CustomEvent).detail;
    sendToWorker(speakRequest(detail.word, 'auto')).catch(() => {});
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
          popupBubble.showToast(res.merged ? '已并入生词本' : res.added ? '已收藏' : '已取消收藏');
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

  // ── 打开设置页（content script 不能直接调 openOptionsPage，经 worker 中转）──
  // 弹泡的「去设置」与侧栏助手的「上下文/思考设置」入口共用这一条
  function onOpenOptions(): void {
    sendToWorker({ type: 'OPEN_OPTIONS' } as WorkerRequest).catch(() => {});
  }
  popupBubble.el.addEventListener('open-options', onOpenOptions);
  sidePanel.el.addEventListener('open-options', onOpenOptions);

  // ── 快捷键 / popup 打开侧栏（来自 background 转发）──
  chrome.runtime.onMessage.addListener((msg: unknown) => {
    const message = msg as { action?: string; word?: string; translation?: import('../shared/types').TranslationResult };
    if (message?.action === 'translate-selection' && lastSelection) {
      triggerIcon.el.dispatchEvent(new CustomEvent('trigger-translate'));
    }
    if (message?.action === 'speak-selection' && lastSelection) {
      sendToWorker(speakRequest(lastSelection.text, 'auto')).catch(() => {});
    }
    // Alt+Q：直接进助手模式对选中内容提问（已在助手模式时 setMode 提前返回、
    // 不发 mode-change，所以这里显式 ensureVisible）
    if (message?.action === 'ask-selection') {
      if (!lastSelection) return;
      popupBubble.setMode('assistant');
      popupBubble.ensureVisible(lastSelection.rect);
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

  // ── 弹泡显示内容配置变更 → 写入 local storage ──
  popupBubble.el.addEventListener('sections-change', (e) => {
    const detail = (e as CustomEvent).detail as { sections: Record<string, boolean> } | undefined;
    if (!detail) return;
    chrome.storage.local.set({ popupSections: detail.sections }).catch(() => {});
  });

  // ── 卡片调尺寸 → 按模式分别记忆 ──
  popupBubble.el.addEventListener('resize-end', (e) => {
    const d = (e as CustomEvent).detail as { width: number; maxHeight: number; mode?: string } | undefined;
    if (!d) return;
    const key = d.mode === 'assistant' ? 'assistantSize' : 'popupSize';
    chrome.storage.local.set({ [key]: { width: d.width, maxHeight: d.maxHeight } }).catch(() => {});
  });
}
