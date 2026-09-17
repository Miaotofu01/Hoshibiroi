/**
 * DeepSeek 流式解析：SSE 分块重组、reasoning/content 分离、usage 统计、
 * 空闲超时、HTTP 错误体。全部用假 fetch + 假 ReadableStream，不联网。
 * Run: npx vitest run tests/assistant-stream.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { iterateSSE, streamAssistant, buildAssistantBody, ASSISTANT_MODEL } from '../src/worker/assistant';
import { API_MESSAGE_MAX_CHARS, type ApiMessage } from '../src/shared/assistant';

const enc = new TextEncoder();

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(enc.encode(chunk));
      c.close();
    },
  });
}

function sse(...lines: string[]): string {
  return lines.map(l => `data: ${l}\n\n`).join('');
}

afterEach(() => vi.unstubAllGlobals());

describe('buildAssistantBody', () => {
  it('关闭思考时不发 reasoning_effort，且 temperature 生效', () => {
    const body = buildAssistantBody({ apiKey: 'k', messages: [{ role: 'user', content: 'hi' }], thinking: 'off', maxTokens: 1000 }) as any;
    expect(body.model).toBe(ASSISTANT_MODEL);
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.temperature).toBe(0.3);
    expect(body.max_tokens).toBe(1000);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it('开启思考时带 reasoning_effort 并为思考追加预算', () => {
    const body = buildAssistantBody({ apiKey: 'k', messages: [], thinking: 'high', maxTokens: 1000 }) as any;
    expect(body.thinking).toEqual({ type: 'enabled' });
    expect(body.reasoning_effort).toBe('high');
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBe(4000); // 1000 + high 预算 3000
  });
});

describe('iterateSSE', () => {
  it('重组被切断的数据块并分离 reasoning/content/usage', async () => {
    const raw = sse(
      '{"choices":[{"delta":{"reasoning_content":"思考中"}}]}',
      '{"choices":[{"delta":{"content":"你"}}]}',
      '{"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"prompt_cache_hit_tokens":8,"completion_tokens_details":{"reasoning_tokens":3}}}',
      '[DONE]',
    );
    // 故意在 JSON 中间切开，验证跨块缓冲
    const parts = [raw.slice(0, 40), raw.slice(40, 90), raw.slice(90)];
    const out = [];
    for await (const d of iterateSSE(streamOf(parts))) out.push(d);
    expect(out.map(d => d.reasoning).filter(Boolean).join('')).toBe('思考中');
    expect(out.map(d => d.content).filter(Boolean).join('')).toBe('你好');
    // 倒数第二条是带 finish_reason/usage 的数据块，最后一条是 [DONE]
    const last = out[out.length - 1];
    expect(last.done).toBe(true);
    const usageChunk = out[out.length - 2];
    expect(usageChunk.finishReason).toBe('stop');
    expect(usageChunk.usage?.prompt_cache_hit_tokens).toBe(8);
  });

  it('注释心跳行产出空增量（供上层重新计时），空行不产出', async () => {
    const raw = ': keep-alive\n\n' + sse('{"choices":[{"delta":{"content":"答"}}]}', '[DONE]');
    const out = [];
    for await (const d of iterateSSE(streamOf([raw]))) out.push(d);
    // 注释行 1 条 + 数据块 1 条 + [DONE] 1 条；事件之间的空行不算
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ content: '', reasoning: '', done: false });
    expect(out[1].content).toBe('答');
    expect(out[2].done).toBe(true);
  });
});

describe('streamAssistant', () => {
  it('依次产出 reasoning → answer → done，并带上用量与耗时', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      body: streamOf([
        sse('{"choices":[{"delta":{"reasoning_content":"先想"}}]}'),
        sse('{"choices":[{"delta":{"content":"答案"}}]}'),
        sse('{"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":20,"prompt_cache_hit_tokens":90,"completion_tokens_details":{"reasoning_tokens":5}}}', '[DONE]'),
      ]),
    } as unknown as Response)));

    const events = [];
    for await (const ev of streamAssistant({ apiKey: 'k', messages: [], thinking: 'off', maxTokens: 500 })) events.push(ev);

    expect(events.map(e => e.kind)).toEqual(['reasoning', 'answer', 'done']);
    const done = events[2] as Extract<typeof events[number], { kind: 'done' }>;
    expect(done.stats.promptTokens).toBe(100);
    expect(done.stats.cachedTokens).toBe(90);
    expect(done.stats.answerTokens).toBe(20);
    expect(done.stats.reasoningTokens).toBe(5);
    expect(done.finishReason).toBe('stop');
    expect(done.stats.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('流在没有 [DONE] 时断掉：标记 incomplete，但已收到的部分回答照常交付', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      // 直接关闭 body：既没有 [DONE]，也没有 finish_reason
      body: streamOf([
        sse('{"choices":[{"delta":{"content":"半截"}}]}'),
        sse('{"choices":[{"delta":{"content":"回答"}}]}'),
      ]),
    } as unknown as Response)));

    const events = [];
    for await (const ev of streamAssistant({ apiKey: 'k', messages: [], thinking: 'off', maxTokens: 500 })) events.push(ev);

    expect(events.map(e => e.kind)).toEqual(['answer', 'answer', 'done']);
    const done = events[2] as Extract<typeof events[number], { kind: 'done' }>;
    expect(done.finishReason).toBe('incomplete');
    expect(done.aborted).toBeUndefined();          // 是「不完整」而不是错误/用户中止
    expect(events.filter(e => e.kind === 'answer').map(e => (e as { text: string }).text).join('')).toBe('半截回答');
  });

  it('消息总量超过硬上限时在发请求前拒绝', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const messages: ApiMessage[] = [{ role: 'user', content: 'x'.repeat(API_MESSAGE_MAX_CHARS + 1) }];

    await expect(async () => {
      for await (const _ of streamAssistant({ apiKey: 'k', messages, thinking: 'off', maxTokens: 500 })) { /* drain */ }
    }).rejects.toThrow(/请求内容过大（200001 字，上限 200000）/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('HTTP 非 2xx 时抛出服务端错误信息', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 401,
      json: async () => ({ error: { message: 'Authentication Fails' } }),
    } as unknown as Response)));
    await expect(async () => {
      for await (const _ of streamAssistant({ apiKey: 'bad', messages: [], thinking: 'off', maxTokens: 500 })) { /* drain */ }
    }).rejects.toThrow('Authentication Fails');
  });

  it('长时间没有数据块时按空闲超时中止', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => ({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(c) {
            init?.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
          },
        }),
      } as unknown as Response)));

      const run = (async () => {
        for await (const _ of streamAssistant({ apiKey: 'k', messages: [], thinking: 'off', maxTokens: 500 })) { /* drain */ }
      })();
      const assertion = expect(run).rejects.toThrow(/超时/);
      await vi.advanceTimersByTimeAsync(61_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('只靠注释心跳保活的流不会被空闲超时掐断（心跳要重新计时）', async () => {
    vi.useFakeTimers();
    try {
      let push!: (text: string) => void;
      vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => ({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(c) {
            push = (text: string) => c.enqueue(enc.encode(text));
            init?.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
          },
        }),
      } as unknown as Response)));

      const answers: string[] = [];
      let finish: string | undefined = 'UNSET';
      const run = (async () => {
        for await (const ev of streamAssistant({ apiKey: 'k', messages: [], thinking: 'off', maxTokens: 500 })) {
          if (ev.kind === 'answer') answers.push(ev.text);
          if (ev.kind === 'done') finish = ev.finishReason;
        }
      })();

      for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0);   // 让 fetch/流读取就位
      await vi.advanceTimersByTimeAsync(59_000);                          // 第一个空闲窗口快到期
      push(': keep-alive\n\n');                                           // 注释心跳
      for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0);   // 跑完「产出空增量 → 重新计时」
      await vi.advanceTimersByTimeAsync(30_000);                          // 不重新计时的话这里早已越过 60s
      push('data: {"choices":[{"delta":{"content":"答案"}}]}\n\n');
      push('data: [DONE]\n\n');
      await run;

      expect(answers).toEqual(['答案']);
      expect(finish).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('signal 在调用前就已中止时不发请求，并按用户停止抛出 AbortError', async () => {
    vi.useFakeTimers();
    try {
      // 记录「真的发出去了」的请求数：真实环境里就是被计费、且再也取消不掉的那次调用
      let issued = 0;
      vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
        if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');   // 真实 fetch：signal 已中止则直接拒绝
        issued++;
        return {
          ok: true,
          body: new ReadableStream<Uint8Array>({
            start(c) {
              init?.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
            },
          }),
        } as unknown as Response;
      }));

      const ctrl = new AbortController();
      ctrl.abort();                       // 同一 tick 里点了停止，或复用同一个 controller 发下一次请求
      const drained = (async () => {
        for await (const _ of streamAssistant({ apiKey: 'k', messages: [], thinking: 'off', maxTokens: 500, signal: ctrl.signal })) { /* drain */ }
      })();
      const outcome = drained.then(() => null, (err: unknown) => err);

      await vi.advanceTimersByTimeAsync(0);      // 只跑完微任务，不推进 60 秒空闲超时

      expect(issued).toBe(0);                    // 请求没有被发出（若被发出，这里已经是 1，随后才靠空闲超时兜底）
      const err = await outcome;
      expect(err).toBeInstanceOf(DOMException);
      expect((err as DOMException).name).toBe('AbortError');   // 用户停止：原样抛出，交给上层判定
      expect((err as DOMException).message).not.toMatch(/超时/);   // 不能被误报成空闲超时
    } finally {
      vi.useRealTimers();
    }
  });
});
