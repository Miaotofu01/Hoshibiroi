import type { AssistantMessage, AssistantStats } from '../../shared/types';
import { trimHistory, type ApiMessage } from '../../shared/assistant';

/** 送给模型的最近轮数上限（一轮 = user + assistant） */
export const MAX_HISTORY_TURNS = 8;
/** 历史 token 上限（超出从最老的整轮开始丢；页面上下文不在历史里，走系统消息） */
export const MAX_HISTORY_TOKENS = 6000;

/**
 * 助手会话状态机（纯逻辑，无 DOM / 无 chrome）。
 * 展示用的 messages 与送给 API 的消息分开维护：
 * reasoning 只用于展示，错误消息不进上下文。
 */
export class ChatSession {
  messages: AssistantMessage[] = [];
  private _streaming = false;

  get streaming(): boolean { return this._streaming; }
  get empty(): boolean { return this.messages.length === 0; }

  /** 记录提问并开启一条空的助手消息（流式写入它的 content/reasoning） */
  ask(question: string): void {
    this.messages.push({ role: 'user', content: question });
    this.messages.push({ role: 'assistant', content: '' });
    this._streaming = true;
  }

  pushReasoning(text: string): void {
    const last = this._lastAssistant();
    if (last) last.reasoning = (last.reasoning ?? '') + text;
  }

  pushAnswer(text: string): void {
    const last = this._lastAssistant();
    if (last) last.content += text;
  }

  finish(stats: AssistantStats): void {
    const last = this._lastAssistant();
    if (last) last.stats = stats;
    this._streaming = false;
  }

  fail(message: string): void {
    const last = this._lastAssistant();
    if (last) {
      last.content = message;
      last.error = true;
    }
    this._streaming = false;
  }

  /**
   * 供 API 使用的历史：只保留「提问 + 成功回答」成对的轮次，再做轮数/token 裁剪。
   * 失败的一轮（错误消息、被放弃的空回答）整轮丢弃：错误文本不能当上下文，
   * 孤立提问也不能回传，否则下一轮请求里会出现一个没有回答的旧问题。
   */
  toApiMessages(): ApiMessage[] {
    const flat: ApiMessage[] = [];
    let pending: string | null = null;   // 已经提问、还没等到成功回答的一轮
    for (const m of this.messages) {
      const content = m.content.trim();
      if (m.role === 'user') { pending = content || null; continue; }  // 新提问顶掉上一个没答上的
      if (m.error || !pending || !content) { pending = null; continue; }  // 这一轮作废
      flat.push({ role: 'user', content: pending }, { role: 'assistant', content });
      pending = null;
    }
    return trimHistory(flat, MAX_HISTORY_TURNS, MAX_HISTORY_TOKENS);
  }

  reset(): void {
    this.messages = [];
    this._streaming = false;
  }

  private _lastAssistant(): AssistantMessage | null {
    const last = this.messages[this.messages.length - 1];
    return last && last.role === 'assistant' ? last : null;
  }
}
