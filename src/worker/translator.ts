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

/** 各源单次请求的字符上限（保守值，避免触发各平台限制） */
const CHUNK_LIMITS: Record<string, number> = {
  deepseek: 2000, // LLM 输出也受 max_tokens 限制，块不宜过大
  google: 2000,   // 免费端点 ~5000 字符
  baidu: 1500,    // 6000 字节（中文 3 字节/字）
  tencent: 600,   // 2000 字节硬限制
  deepl: 4000,    // 5 万字符上限，宽松些
};

/**
 * 按句子边界把长文本切成不超过 max 字符的块。
 * 句子优先（保留句末标点），单句超长时硬切；块内尽量保持语义完整。
 */
export function splitIntoChunks(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^。！？!?\n]+[。！？!?]?|\n+/g) ?? [text];
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (s.length > max) {
      // 超长单句（如一大段无标点文本）：硬切
      if (cur) { chunks.push(cur); cur = ''; }
      for (let i = 0; i < s.length; i += max) chunks.push(s.slice(i, i + max));
    } else if (cur.length + s.length > max) {
      chunks.push(cur);
      cur = s;
    } else {
      cur += s;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** 单次调用（含缓存读写）；供整段与分块共用 */
async function translateOnce(
  text: string, from: string, to: string,
  config: { id: string; name: string; apiKey?: string },
  skipCache: boolean,
): Promise<TranslationResult> {
  const adapter = ADAPTERS[config.id];
  const cacheKey = makeCacheKey(text, from, to, config.id);
  const cached = skipCache ? null : await getCached(cacheKey);
  if (cached) {
    cached.sourceId = config.id;
    return cached;
  }
  const result = await adapter.translate(text, from, to, config.apiKey || undefined);
  result.sourceId = config.id;
  await setCached(cacheKey, result);
  return result;
}

export async function translate(
  text: string, from: string, to: string, skipCache = false, sourceId?: string
): Promise<TranslationResult> {
  const { translators } = await getSettings();

  // 按优先级排序，仅启用的
  let enabled = translators
    .filter(t => t.enabled && ADAPTERS[t.id])
    .sort((a, b) => a.priority - b.priority);

  // 指定了源：只用这一个（点击来源标签的场景）
  if (sourceId) {
    enabled = enabled.filter(t => t.id === sourceId);
    if (enabled.length === 0) {
      throw new Error('该翻译源未启用，请在设置中开启');
    }
  }

  if (enabled.length === 0) {
    throw new Error('没有启用的翻译源，请在设置中开启至少一个');
  }

  const errors: string[] = [];

  for (const config of enabled) {
    const adapter = ADAPTERS[config.id];
    const chunks = splitIntoChunks(text, CHUNK_LIMITS[config.id] ?? 1500);

    // 单块：走原路径（整体缓存）
    if (chunks.length === 1) {
      try {
        return await translateOnce(text, from, to, config, skipCache);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${adapter.name}: ${msg}`);
        console.warn(`[Translator] ${adapter.name} failed:`, msg);
        continue;
      }
    }

    // 长文本：逐块翻译（每块独立缓存），部分失败也返回已有结果
    const parts: string[] = [];
    const partErrors: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        const r = await translateOnce(chunks[i], from, to, config, skipCache);
        parts.push(r.text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        partErrors.push(`第 ${i + 1}/${chunks.length} 段：${msg}`);
        console.warn(`[Translator] ${adapter.name} chunk ${i + 1} failed:`, msg);
      }
    }

    if (parts.length === 0) {
      errors.push(`${adapter.name}: ${partErrors.join('；')}`);
      continue; // 全段失败 → 尝试下一个源
    }

    let textOut = parts.join('\n');
    if (partErrors.length > 0) {
      textOut += `\n\n[部分分段翻译失败：${partErrors.join('；')}]`;
    }
    const result: TranslationResult = {
      text: textOut,
      source: adapter.name,
      sourceId: config.id,
    };
    // 整体入缓存（命中后无需再分段调用）
    await setCached(makeCacheKey(text, from, to, config.id), result).catch(() => {});
    return result;
  }

  // 汇总所有失败原因，避免被最后一个源（如网络失败的 Google）掩盖真实问题
  if (errors.length > 0) {
    throw new Error(errors.join('；'));
  }

  throw new Error('没有启用的翻译源，请在设置中开启至少一个');
}

/** 已启用的翻译源列表（按优先级排序），供 UI 渲染来源标签 */
export async function getEnabledSources(): Promise<Array<{ id: string; name: string }>> {
  const { translators } = await getSettings();
  return translators
    .filter(t => t.enabled && ADAPTERS[t.id])
    .sort((a, b) => a.priority - b.priority)
    .map(t => ({ id: t.id, name: t.name }));
}

/** 测试指定翻译源是否可用（不要求启用、不走缓存），返回可读结果 */
export async function testTranslator(
  sourceId: string, apiKey?: string
): Promise<{ ok: boolean; message: string }> {
  const adapter = ADAPTERS[sourceId];
  if (!adapter) return { ok: false, message: '未知翻译源' };
  try {
    const result = await adapter.translate('Hello, world!', 'en', 'zh', apiKey || undefined);
    return { ok: true, message: result.text };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
