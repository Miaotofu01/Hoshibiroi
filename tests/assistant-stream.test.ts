/**
 * DeepSeek 流式解析：SSE 分块重组、reasoning/content 分离、usage 统计、
 * 空闲超时、HTTP 错误体。全部用假 fetch + 假 ReadableStream，不联网。
 * Run: npx vitest run tests/assistant-stream.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { iterateSSE, streamAssistant, buildAssistantBody, ASSISTANT_MODEL } from '../src/worker/assistant';

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
});
