import type { TranslationResult } from '../shared/types';
import { getCache, setCache } from './storage';

const MAX_ENTRIES = 2000;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

export function makeCacheKey(
  text: string, from: string, to: string, translator: string
): string {
  // 简单 hash: 拼接后取固定长度
  const raw = `${text}|${from}|${to}|${translator}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  // 用 hash + 文本前 N 字符保证可读性
  return `${translator}_${Math.abs(hash).toString(36)}_${text.slice(0, 30)}`;
}

export async function getCached(key: string): Promise<TranslationResult | null> {
  const cache = await getCache();
  const entry = cache[key];
  if (!entry) return null;

  // 检查过期
  if (Date.now() - entry.timestamp > TTL_MS) {
    delete cache[key];
    await setCache(cache);
    return null;
  }

  return entry.result;
}

export async function setCached(key: string, result: TranslationResult): Promise<void> {
  const cache = await getCache();

  // LRU eviction: 如果超过上限，删除最旧的条目
  const keys = Object.keys(cache);
  if (keys.length >= MAX_ENTRIES) {
    keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp);
    const toDelete = keys.slice(0, keys.length - MAX_ENTRIES + 1);
    for (const k of toDelete) delete cache[k];
  }

  cache[key] = { result, timestamp: Date.now() };
  await setCache(cache);
}

export async function cleanExpiredCache(): Promise<void> {
  const cache = await getCache();
  const now = Date.now();
  let changed = false;
  for (const key of Object.keys(cache)) {
    if (now - cache[key].timestamp > TTL_MS) {
      delete cache[key];
      changed = true;
    }
  }
  if (changed) await setCache(cache);
}
