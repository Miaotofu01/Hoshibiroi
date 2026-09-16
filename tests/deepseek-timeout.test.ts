/**
 * Regression test: DeepSeek (LLM) requests must not be killed by the
 * short 3s timeout that fits fast APIs (Google/Baidu/...).
 *
 * An LLM response with a long system prompt + max_tokens 4096 routinely
 * takes >3s; the old `setTimeout(() => controller.abort(), 3000)` in
 * adapters/deepseek.ts aborted every such request, surfacing as
 * "This operation was aborted" / 请求失败.
 *
 * Run: npx vitest run tests/deepseek-timeout.test.ts
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { deepseekTranslator } from '../src/worker/adapters/deepseek';

describe('deepseekTranslator timeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('survives an LLM response that takes longer than 3 seconds', async () => {
    // Simulate a slow LLM: response arrives at 3.5s (past the old 3s abort).
    // Honoring the AbortSignal mirrors real fetch behavior.
    const RESPONSE_DELAY_MS = 3500;

    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve({
            ok: true,
            json: async () => ({
              choices: [{ message: { content: '{"text":"你好","phonetic":"həˈloʊ"}' } }],
            }),
          } as Response);
        }, RESPONSE_DELAY_MS);

        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      });
    }));

    const result = await deepseekTranslator.translate('hello', 'en', 'zh', 'test-key');
    expect(result.text).toBe('你好');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
