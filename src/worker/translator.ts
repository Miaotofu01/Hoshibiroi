import type { TranslationResult } from '../shared/types';
import type { TranslatorAdapter } from './adapters/base';
import { googleTranslator } from './adapters/google';
import { tencentTranslator } from './adapters/tencent';
import { baiduTranslator } from './adapters/baidu';
import { deepseekTranslator } from './adapters/deepseek';
import { deeplTranslator } from './adapters/deepl';
import { getCached, setCached, makeCacheKey } from './cache';
import { getSettings } from './storage';

const ADAPTERS: Record<string, TranslatorAdapter> = {
  google: googleTranslator,
  tencent: tencentTranslator,
  baidu: baiduTranslator,
  deepseek: deepseekTranslator,
  deepl: deeplTranslator,
};

export async function translate(
  text: string, from: string, to: string
): Promise<TranslationResult> {
  const { translators } = await getSettings();

  // 按优先级排序，仅启用的
  const enabled = translators
    .filter(t => t.enabled && ADAPTERS[t.id])
    .sort((a, b) => a.priority - b.priority);

  if (enabled.length === 0) {
    throw new Error('没有启用的翻译源，请在设置中开启至少一个');
  }

  let lastError: Error | null = null;

  for (const config of enabled) {
    const adapter = ADAPTERS[config.id];

    // 尝试缓存
    const cacheKey = makeCacheKey(text, from, to, adapter.id);
    const cached = await getCached(cacheKey);
    if (cached) return cached;

    try {
      const result = await adapter.translate(text, from, to, config.apiKey || undefined);
      await setCached(cacheKey, result);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Translator] ${adapter.name} failed:`, lastError.message);
      // 继续尝试下一个
    }
  }

  throw new Error(lastError?.message ?? '所有翻译源均失败');
}
