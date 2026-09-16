/**
 * 端口 runner（registerAssistantPort）行为测试：不依赖真实 chrome 运行时与真实网络。
 * 用手写的假 Port 对象驱动端口消息（onMessage/onDisconnect/postMessage/disconnect），
 * 用假 fetch 代替 DeepSeek 请求，用 vi.useFakeTimers() 控制 20s 心跳与 60s 空闲超时。
 * 覆盖：被新 ask 取代后的心跳归属、取代时不得补发过期的 aborted done、用户主动 abort 仍回 done。
 * Run: npx vitest run tests/assistant-port.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerAssistantPort } from '../src/worker/handlers/assistant';
import { ASSISTANT_PORT } from '../src/shared/messages';
import type {
  AskAssistantPayload, AssistantStreamEvent, AssistantStreamRequest,
} from '../src/shared/messages';

const PAYLOAD: AskAssistantPayload = {
  messages: [{ role: 'user', content: '你好' }],
  thinking: 'off',
  maxTokens: 100,
};

/** 假 chrome.storage：让 resolveApiKey() 里的 getSettings() 取到一个可用的 DeepSeek Key */
function stubChromeStorage(): void {
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async () => ({
          translators: [{ id: 'deepseek', name: 'DeepSeek', enabled: true, priority: 1, apiKey: 'sk-test' }],
        }),
        set: async () => { /* 本测试不触发迁移写入 */ },
      },
      sync: { get: async () => ({}) },
    },
  });
}

/** 测试可自己控制的假响应：决定何时推数据块、何时正常结束；signal 中止时像真流一样报错 */
function controllableResponse(init?: RequestInit) {
  let streamCtrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      streamCtrl = c;
      init?.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
    },
  });
  const enc = new TextEncoder();
  return {
    response: { ok: true, body } as unknown as Response,
    push: (text: string) => streamCtrl.enqueue(enc.encode(text)),
  };
}

/**
 * 假 fetch：signal 已中止时与真 fetch 一致地直接抛 AbortError（不计入返回的响应数组），
 * 否则返回一个等待测试驱动的流。返回数组按「真的发出了 HTTP 请求」的顺序记录响应。
 */
function stubFetch(): Array<ReturnType<typeof controllableResponse>> {
  const made: Array<ReturnType<typeof controllableResponse>> = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const held = controllableResponse(init);
    made.push(held);
    return held.response;
  }));
  return made;
}

interface FakePort {
  /** postMessage 记录下来的全部事件（按顺序） */
  events: AssistantStreamEvent[];
  ask: (payload?: AskAssistantPayload) => void;
  abort: () => void;
  disconnect: () => void;
}

/** 手写假 Port：只实现 runner 用到的成员；断开后 postMessage 抛错，与真实 Port 行为一致 */
function makePort(): FakePort {
  const events: AssistantStreamEvent[] = [];
  const messageListeners: Array<(msg: AssistantStreamRequest) => void> = [];
  const disconnectListeners: Array<() => void> = [];
  let connected = true;

  const port = {
    name: ASSISTANT_PORT,
    onMessage: {
      addListener: (fn: (msg: AssistantStreamRequest) => void) => { messageListeners.push(fn); },
    },
    onDisconnect: {
      addListener: (fn: () => void) => { disconnectListeners.push(fn); },
    },
    postMessage: (ev: AssistantStreamEvent) => {
      if (!connected) throw new Error('Attempting to use a disconnected port object');
      events.push(ev);
    },
    disconnect: () => {
      connected = false;
      for (const fn of disconnectListeners) fn();
    },
  };

  registerAssistantPort(port as unknown as chrome.runtime.Port);

  const deliver = (req: AssistantStreamRequest) => { for (const fn of messageListeners) fn(req); };
  return {
    events,
    ask: (payload: AskAssistantPayload = PAYLOAD) => deliver({ kind: 'ask', payload }),
    abort: () => deliver({ kind: 'abort' }),
    disconnect: port.disconnect,
  };
}

/** 只推进微任务、不推进定时器，让 resolveApiKey → streamAssistant → fetch 的 await 链跑到位 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(0);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('registerAssistantPort', () => {
  it('被第二次 ask 取代后只剩新请求的心跳：每 20s 恰好一个 ping', async () => {
    vi.useFakeTimers();
    stubChromeStorage();
    stubFetch();
    const port = makePort();

    port.ask();
    port.ask();                                   // 第二次 ask 取代第一次
    const baseline = port.events.length;          // 取代之后产生的事件
    await flushMicrotasks();

    // 每次只数取代之后新增的 ping：旧请求收尾若误清新请求的心跳，这里会是 0
    await vi.advanceTimersByTimeAsync(20_000);
    expect(port.events.slice(baseline).filter(ev => ev.kind === 'ping')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(port.events.slice(baseline).filter(ev => ev.kind === 'ping')).toHaveLength(2);

    port.disconnect();
    await flushMicrotasks();
  });

  it('被取代的请求保持静默：不补发过期的 aborted done，新请求照常完成', async () => {
    vi.useFakeTimers();
    stubChromeStorage();
    const made = stubFetch();
    const port = makePort();

    port.ask();
    port.ask();
    const baseline = port.events.length;
    await flushMicrotasks();

    // 只有新请求真的发出了 HTTP 请求（旧请求的 signal 已被中止，fetch 直接抛 AbortError）
    expect(made).toHaveLength(1);
    // 旧请求不得有任何终止事件：它的 aborted done 与新一轮的 done 无法区分，会截断新回答
    expect(port.events.slice(baseline).filter(ev => ev.kind !== 'ping')).toEqual([]);

    // 正对照：新请求仍然活着，能把数据块推给 content 并以 done 收尾
    made[0].push('data: {"choices":[{"delta":{"content":"新答案"}}]}\n\n');
    made[0].push('data: [DONE]\n\n');
    await flushMicrotasks();

    const tail = port.events.slice(baseline);
    expect(tail).toContainEqual({ kind: 'answer', text: '新答案' });
    expect(tail[tail.length - 1]).toMatchObject({ kind: 'done' });
    expect(tail.some(ev => ev.kind === 'done' && ev.aborted === true)).toBe(false);
  });

  it('用户主动 abort 仍回一条 aborted done，并停掉心跳', async () => {
    vi.useFakeTimers();
    stubChromeStorage();
    const made = stubFetch();
    const port = makePort();

    port.ask();
    await flushMicrotasks();
    expect(made).toHaveLength(1);

    port.abort();
    await flushMicrotasks();

    const done = port.events.filter(ev => ev.kind === 'done');
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ kind: 'done', aborted: true });
    expect(port.events.some(ev => ev.kind === 'error')).toBe(false);

    // 心跳与空闲超时都已清理：再推进 20s 不应有任何事件
    const baseline = port.events.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(port.events.slice(baseline)).toEqual([]);
  });
});
