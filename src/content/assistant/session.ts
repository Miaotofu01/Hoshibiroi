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

  /**
   * 记录失败。调用方可能没有先 ask()（例如「上下文长度为 0，无法整页速览」这类短路分支），
   * 此时最后一条消息是上一轮已完成的回答：必须新开一条助手消息来写错误，
   * 不能把错误文本盖到那份回答上，否则上一轮的真实答案会被抹掉并从历史里整轮消失。
   * 已经流出一部分回答时（端口中途断开）同样不能整段替换：
   * 那会把用户正在读的内容抹掉，错误另起一行追加即可。
   */
  fail(message: string): void {
    if (!this._openAssistant()) this.messages.push({ role: 'assistant', content: '' });
    const last = this._lastAssistant();
    if (last) {
      last.content = last.content ? `${last.content}\n${message}` : message;
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

  /**
   * ask() 打开、还没结束（finish / fail / reset）的那条助手消息。
   * 只有它才接收错误文本；上一轮已完成的回答不属于任何打开的轮次，
   * 因此 fail() 遇到它时必须另起一条，而不是就地覆写。
   */
  private _openAssistant(): AssistantMessage | null {
    return this._streaming ? this._lastAssistant() : null;
  }
}
