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
  private pageCache: { at: number; text: string } | null = null;
  /**
   * 系统提示词按 focus 缓存：会话内前缀逐字节稳定，DeepSeek 前缀缓存才能命中
   * （命中部分输入价约为未命中的 1/50）。换选中范围只影响用户消息，不动前缀。
   * 缓存连带记下当时的页面地址：SPA 路由切换后标题/正文/地址都变了，必须重建，
   * 否则助手会一直描述上一个页面。
   */
  private promptCache = new Map<AssistantFocus, { url: string; content: string }>();

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
    this.session.finish(ZERO_STATS);
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

  /** 取页面正文（5 秒缓存，避免连续提问重复遍历 DOM） */
  private _pageText(): string {
    const now = Date.now();
    if (this.pageCache && now - this.pageCache.at < PAGE_CACHE_MS) return this.pageCache.text;
    const text = collectPageText();
    this.pageCache = { at: now, text };
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
    // 同一地址内命中即逐字节复用（前缀缓存）；地址变了就当作新页面重建
    const cached = this.promptCache.get(focus);
    if (cached && cached.url === pageUrl()) return cached.content;
    const built = buildSystemPrompt({ page: this._page(focus, anchor), instructions: this.settings.instructions });
    this.promptCache.set(focus, { url: pageUrl(), content: built });
    return built;
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
