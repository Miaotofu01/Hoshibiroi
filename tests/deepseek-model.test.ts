/**
 * 模型名与思考模式回归：官方文档当前只提供 deepseek-flash / deepseek-v4-pro，
 * 且思考模式默认开启（effort=high）。翻译是结构化抽取任务，
 * 思考模式会显著变慢、变贵并让 temperature 失效 —— 必须显式关闭。
 * Run: npx vitest run tests/deepseek-model.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { deepseekTranslator } from '../src/worker/adapters/deepseek';

describe('deepseek 翻译请求参数', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('使用 deepseek-flash 且关闭思考模式', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"text":"你好"}' } }] }),
    } as unknown as Response));
    vi.stubGlobal('fetch', spy);

    await deepseekTranslator.translate('hello', 'en', 'zh', 'test-key');

    const body = JSON.parse(String(spy.mock.calls[0][1]!.body));
    expect(body.model).toBe('deepseek-flash');
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.temperature).toBe(0.3);
  });
});
