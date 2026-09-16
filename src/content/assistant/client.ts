import {
  ASSISTANT_PORT, type AskAssistantPayload, type AssistantStreamEvent, type AssistantStreamRequest,
} from '../../shared/messages';
import type { AssistantStats } from '../../shared/types';

export interface StreamHandlers {
  onReasoning(text: string): void;
  onAnswer(text: string): void;
  onDone(stats: AssistantStats, aborted: boolean, finishReason?: string): void;
  onError(message: string): void;
}

/**
 * content → worker 的助手流式通道。
 * 一次只跑一个请求；请求结束即断开端口（worker 侧 onDisconnect 会兜底中止）。
 */
export class AssistantClient {
  private port: chrome.runtime.Port | null = null;
  private handlers: StreamHandlers | null = null;
  private _busy = false;

  get busy(): boolean { return this._busy; }

  ask(payload: AskAssistantPayload, handlers: StreamHandlers): void {
    this.abort();
    this.handlers = handlers;
    this._busy = true;

    const port = chrome.runtime.connect({ name: ASSISTANT_PORT });
    this.port = port;
    port.onMessage.addListener((ev: AssistantStreamEvent) => this._onEvent(ev));
    port.onDisconnect.addListener(() => {
      // 后台被回收 / 扩展重载：把在途请求标记为失败，用户可重试
      if (!this._busy) return;
      const h = this.handlers;
      this._finish();
      h?.onError('与后台的连接中断（后台可能被回收），请重试');
    });
    const req: AssistantStreamRequest = { kind: 'ask', payload };
    port.postMessage(req);
  }

  abort(): void {
    if (!this.port) return;
    const port = this.port;
    this._finish();
    try {
      port.postMessage({ kind: 'abort' } satisfies AssistantStreamRequest);
    } catch { /* 端口已断开 */ }
  }

  private _onEvent(ev: AssistantStreamEvent): void {
    if (ev.kind === 'ping') {
      // 回 pong：worker 侧收到端口消息会重置 MV3 空闲计时器
      try { this.port?.postMessage({ kind: 'pong' } satisfies AssistantStreamRequest); } catch { /* 忽略 */ }
      return;
    }
    if (ev.kind === 'reasoning') { this.handlers?.onReasoning(ev.text); return; }
    if (ev.kind === 'answer') { this.handlers?.onAnswer(ev.text); return; }
    const h = this.handlers;
    if (ev.kind === 'done') {
      this._finish();
      h?.onDone(ev.stats, !!ev.aborted, ev.finishReason);
      return;
    }
    if (ev.kind === 'error') {
      this._finish();
      h?.onError(ev.message);
    }
  }

  private _finish(): void {
    this._busy = false;
    const port = this.port;
    this.port = null;
    this.handlers = null;
    if (port) { try { port.disconnect(); } catch { /* 忽略 */ } }
  }
}
