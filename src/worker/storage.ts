import type {
  CacheEntry, HistoryEntry, FavoriteWord,
  TranslatorConfig, Preferences
} from '../shared/types';

// ── 默认设置 ──

const DEFAULT_TRANSLATORS: TranslatorConfig[] = [
  { id: 'deepseek', name: 'DeepSeek', enabled: true, priority: 1, apiKey: '' },
  { id: 'tencent',  name: '腾讯云 TMT', enabled: false, priority: 2, apiKey: '' },
  { id: 'baidu',    name: '百度翻译', enabled: false, priority: 3, apiKey: '' },
  { id: 'google',   name: 'Google Translate', enabled: true, priority: 4 },
  { id: 'deepl',    name: 'DeepL', enabled: false, priority: 5, apiKey: '' },
];

const DEFAULT_PREFERENCES: Preferences = {
  theme: 'tokyo-night',
  fontSize: 'medium',
  targetLang: 'zh',
  sourceLang: 'auto',
};

// ── 缓存 ──

export async function getCache(): Promise<Record<string, CacheEntry>> {
  const result = await chrome.storage.local.get('cache');
  return (result.cache ?? {}) as Record<string, CacheEntry>;
}

export async function setCache(map: Record<string, CacheEntry>): Promise<void> {
  await chrome.storage.local.set({ cache: map });
}

// ── 历史 ──

export async function getHistory(): Promise<HistoryEntry[]> {
  const result = await chrome.storage.local.get('history');
  return (result.history ?? []) as HistoryEntry[];
}

export async function addHistory(entry: HistoryEntry): Promise<void> {
  const history = await getHistory();
  history.unshift(entry);
  // 上限 500 条
  if (history.length > 500) history.length = 500;
  await chrome.storage.local.set({ history });
}

// ── 收藏 ──

export async function getFavorites(): Promise<FavoriteWord[]> {
  const result = await chrome.storage.local.get('favorites');
  return (result.favorites ?? []) as FavoriteWord[];
}

export async function addFavorite(word: FavoriteWord): Promise<void> {
  const favorites = await getFavorites();
  favorites.unshift(word);
  await chrome.storage.local.set({ favorites });
}

export async function removeFavorite(id: string): Promise<void> {
  const favorites = await getFavorites();
  await chrome.storage.local.set({
    favorites: favorites.filter(f => f.id !== id)
  });
}

export async function isFavorite(word: string): Promise<FavoriteWord | null> {
  const favorites = await getFavorites();
  return favorites.find(f => f.word === word) ?? null;
}

// ── 设置 ──

export async function getSettings(): Promise<{
  translators: TranslatorConfig[];
  preferences: Preferences;
}> {
  const result = await chrome.storage.sync.get(['translators', 'preferences']);
  return {
    translators: (result.translators ?? DEFAULT_TRANSLATORS) as TranslatorConfig[],
    preferences: { ...DEFAULT_PREFERENCES, ...(result.preferences ?? {}) as Partial<Preferences> },
  };
}

export async function saveSettings(
  translators: TranslatorConfig[],
  preferences: Preferences
): Promise<void> {
  await chrome.storage.sync.set({ translators, preferences });
}
