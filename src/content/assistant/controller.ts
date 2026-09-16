import type { AssistantSettings, AssistantStats } from '../../shared/types';
import {
  DEFAULT_ASSISTANT_SETTINGS, buildSystemPrompt, buildUserTurn, estimateTokens,
  normalizeAssistantSettings, truncateAround, type ApiMessage,
} from '../../shared/assistant';
import { ChatSession } from './session';
import { AssistantClient } from './client';
import { collectPageText, headingPath, pageTitle, pageUrl } from '../page-context';

const PAGE_CACHE_MS = 5000;
const ZERO_STATS: AssistantStats = { elapsedMs: 0, promptTokens: 0, cachedTokens: 0, answerTokens: 0, reasoningTokens: 0 };

export type AssistantFocus = 'selection' | 'document-start';

export interface AskOptions {
  /** selection=围绕选中内容开窗；document-start=从页面开头取（整页速览用） */
  focus?: AssistantFocus;
  /** 覆盖当前选中范围（快捷提问可能来自旧选区） */
  selection?: string;
}

/**
 * 弹泡与侧栏共享的助手控制器：设置、会话、页面缓存、请求装配都在这里，
 * UI 只负责渲染 session 与转发用户动作。
 */
export class AssistantController {
  readonly session = new ChatSession();
  settings: AssistantSettings = DEFAULT_ASSISTANT_SETTINGS;
  /** 输入框旁「深想」开关：只影响当前会话（覆盖设置里的思考深度） */
  deepThink = false;
  /** 当前页面里最新的选中范围 */
  selection: { text: string; context: string } = { text: '', context: '' };
  /** 最近一次回答的结束原因（'length' 时 UI 提示被截断） */
  lastFinishReason = '';

  private client = new AssistantClient();
  private listeners = new Set<() => void>();
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  /** 页面正文缓存：按地址区分，SPA 导航后旧正文不能冒充新页面 */
  private pageCache: { url: string; at: number; text: string } | null = null;
  /**
   * 系统提示词按 focus 缓存：会话内前缀逐字节稳定，DeepSeek 前缀缓存才能命中
   * （命中部分输入价约为未命中的 1/50）。
   * 连带记下当时的页面地址与选段探针：地址变了要重建（否则助手会一直描述上一个页面），
   * 选段变了也要重建（正文是按选中范围开窗的，沿用旧窗口会让新选区拿不到对应片段）。
   */
  private promptCache = new Map<AssistantFocus, { url: string; anchor: string; content: string }>();

  get busy(): boolean { return this.client.busy; }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  setSettings(raw: unknown): void {
    this.settings = normalizeAssistantSettings(raw);
    this.promptCache.clear();
    this.lastFinishReason = '';               // 上一轮的截断提示不能飘到新设置下
    this.notify(true);
  }

  setSelection(text: string, context: string): void {
    this.selection = { text: (text ?? '').trim(), context: (context ?? '').trim() };
    this.notify(true);
  }

  ask(question: string, opts: AskOptions = {}): void {
    const q = question.trim();
    if (!q || this.client.busy) return;
    const focus: AssistantFocus = opts.focus ?? 'selection';
    const sel = (opts.selection ?? this.selection.text).trim();

    if (focus === 'document-start' && this.settings.contextChars === 0) {
      // 清掉上一轮的结束原因：否则截断提示会和这条无关的错误同屏
      this.lastFinishReason = '';
      this.session.fail('上下文长度为 0，无法速览整页：请在设置里把「上下文长度」调大。');
      this.notify(true);
      return;
    }

    const system = this._systemPrompt(focus, sel);
    const user = buildUserTurn({
      question: q,
      selection: this.settings.includeSelection ? sel : '',
      selectionContext: this.settings.includeSelection ? this.selection.context : '',
    });
    const messages: ApiMessage[] = [
      { role: 'system', content: system },
      ...this.session.toApiMessages(),
      { role: 'user', content: user },
    ];

    this.lastFinishReason = '';
    this.session.ask(q);
    this.notify(true);

    this.client.ask(
      { messages, thinking: this.deepThink ? 'high' : this.settings.thinking, maxTokens: this.settings.maxAnswerTokens },
      {
        onReasoning: (text) => { this.session.pushReasoning(text); this.notify(); },
        onAnswer: (text) => { this.session.pushAnswer(text); this.notify(); },
        onDone: (stats, aborted, finishReason) => {
          this.session.finish(stats ?? ZERO_STATS);
          this.lastFinishReason = aborted ? 'aborted' : (finishReason ?? '');
          this.notify(true);
        },
        onError: (message) => { this.session.fail(message); this.notify(true); },
      },
    );
  }

  stop(): void {
    if (!this.client.busy) return;
    this.client.abort();
    // 端口已断开，不会再收到 done —— 本地收敛这一轮，避免「生成中」永远停不下来
    this.session.finish({ ...ZERO_STATS });
    this.lastFinishReason = 'aborted';
    this.notify(true);
  }

  clear(): void {
    this.stop();
    this.session.reset();
    this.promptCache.clear();
    this.lastFinishReason = '';
    this.notify(true);
  }

  /** 上下文规模提示（输入行上方的脚注） */
  contextSummary(focus: AssistantFocus = 'selection'): { chars: number; tokens: number; truncated: boolean; selectionChars: number } {
    const page = this._page(focus, this.selection.text);
    return {
      chars: page.text.length,
      tokens: estimateTokens(page.text),
      truncated: page.totalChars > page.text.length,
      selectionChars: this.selection.text.length,
    };
  }

  /** 取页面正文（同一地址 5 秒缓存，避免连续提问重复遍历 DOM；换地址立即重采） */
  private _pageText(): string {
    const now = Date.now();
    const url = pageUrl();
    if (this.pageCache && this.pageCache.url === url && now - this.pageCache.at < PAGE_CACHE_MS) {
      return this.pageCache.text;
    }
    const text = collectPageText();
    this.pageCache = { url, at: now, text };
    return text;
  }

  private _page(focus: AssistantFocus, anchor: string) {
    const raw = this._pageText();
    const window = truncateAround(raw, focus === 'selection' ? anchor : '', this.settings.contextChars);
    return {
      title: pageTitle(),
      url: pageUrl(),
      heading: focus === 'selection' ? headingPath() : '',
      text: window.text,
      totalChars: raw.length,
    };
  }

  private _systemPrompt(focus: AssistantFocus, anchor: string): string {
    const url = pageUrl();
    const cached = this.promptCache.get(focus);
    const probe = anchor.trim().slice(0, 60);
    // 选中范围仍落在缓存片段里（或本次不需要锚点）时复用，保持系统前缀逐字节稳定以命中 DeepSeek 前缀缓存
    if (cached && cached.url === url && (!probe || cached.anchor === probe || cached.content.includes(probe))) {
      return cached.content;
    }
    const page = this._page(focus, anchor);
    const content = buildSystemPrompt({ page, instructions: this.settings.instructions });
    this.promptCache.set(focus, { url, anchor: probe, content });
    return content;
  }

  /** 节流通知：流式期间合并重渲染（后台标签页 setTimeout 会被降频，但不会丢最后一次） */
  private notify(immediate = false): void {
    if (immediate) {
      if (this.notifyTimer) { clearTimeout(this.notifyTimer); this.notifyTimer = null; }
      this.listeners.forEach(l => l());
      return;
    }
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.listeners.forEach(l => l());
    }, 50);
  }
}
