import type {
  CacheEntry, HistoryEntry, FavoriteWord, VocabSettings,
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

export async function updateFavorite(id: string, patch: Partial<FavoriteWord>): Promise<FavoriteWord | null> {
  const favorites = await getFavorites();
  const idx = favorites.findIndex(f => f.id === id);
  if (idx === -1) return null;
  favorites[idx] = { ...favorites[idx], ...patch };
  await chrome.storage.local.set({ favorites });
  return favorites[idx];
}

// ── 词形归并 ──
// 同一词条的不同写法（大小写/时态变体）按 key 归并：
//   key = lemma 优先（DeepSeek 返回的原形），否则取 word 本身，统一小写。
// 收藏 "running" 时若已有 lemma=run 的词条，则并入而非新建。

/** 词条匹配 key（小写原形） */
export function favoriteKey(word: string, lemma?: string): string {
  return (lemma ?? word).trim().toLowerCase();
}

/** 按匹配 key 查找（大小写/词形不敏感） */
export async function findFavoriteByKey(key: string): Promise<FavoriteWord | null> {
  const favorites = await getFavorites();
  return favorites.find(f => favoriteKey(f.word, f.lemma) === key) ?? null;
}

/**
 * 生成把词形 form 并入已有词条的补丁：
 * - 新词形记入 forms（去重、忽略大小写）
 * - 有 lemma 时词头归一为 lemma 原形（原词头挪进 forms）
 * - context / sourceUrl 空缺时补齐
 */
export function mergeFormPatch(
  existing: FavoriteWord,
  form: string,
  context?: string,
  sourceUrl?: string,
): Partial<FavoriteWord> {
  const forms = [...(existing.forms ?? [])];
  const formTrim = form.trim();

  // 词头归一为 lemma 原形（仅当有 lemma 且当前词头不是它）
  let word = existing.word;
  if (existing.lemma && word.trim().toLowerCase() !== existing.lemma.toLowerCase()) {
    if (!forms.some(f => f.toLowerCase() === word.trim().toLowerCase())) forms.push(word.trim());
    word = existing.lemma;
  }

  // 新词形记入 forms
  const headKey = favoriteKey(existing.word, existing.lemma);
  if (formTrim && formTrim.toLowerCase() !== headKey && !forms.some(f => f.toLowerCase() === formTrim.toLowerCase())) {
    forms.push(formTrim);
  }

  const patch: Partial<FavoriteWord> = { word, forms };
  if (!existing.context && context) patch.context = context;
  if (!existing.sourceUrl && sourceUrl) patch.sourceUrl = sourceUrl;
  return patch;
}

/**
 * 存量数据迁移：把大小写/词形重复的词条合并为一条。
 * 保留复习进度最多的词条（reviewCount → lastReviewedAt → createdAt），
 * 其余词条的词形并入 forms 后删除。幂等，可重复执行。
 * @returns 删除的重复词条数
 */
export async function dedupeFavorites(): Promise<number> {
  const favorites = await getFavorites();
  const groups = new Map<string, FavoriteWord[]>();
  for (const f of favorites) {
    const key = favoriteKey(f.word, f.lemma);
    const list = groups.get(key) ?? [];
    list.push(f);
    groups.set(key, list);
  }

  let removed = 0;
  for (const [, list] of groups) {
    if (list.length <= 1) continue;
    // 幸存者：复习进度最多
    const survivor = [...list].sort((a, b) =>
      (b.reviewCount - a.reviewCount)
      || (b.lastReviewedAt - a.lastReviewedAt)
      || (a.createdAt - b.createdAt)
    )[0];

    let patch: Partial<FavoriteWord> = { forms: survivor.forms ?? [] };
    for (const other of list) {
      if (other.id === survivor.id) continue;
      patch = { ...patch, ...mergeFormPatch({ ...survivor, ...patch }, other.word, other.context, other.sourceUrl) };
      await removeFavorite(other.id);
      removed++;
    }
    if (Object.keys(patch).length > 0) {
      await updateFavorite(survivor.id, patch);
    }
  }
  return removed;
}

export async function getDueWords(): Promise<FavoriteWord[]> {
  const favorites = await getFavorites();
  const now = Date.now();
  // 新词 (nextReviewAt === 0) 或 到期词 (nextReviewAt <= now)
  return favorites.filter(f => f.nextReviewAt === 0 || f.nextReviewAt <= now);
}

// ── 设置 ──
// 翻译源配置（含 API key）存 local：key 属敏感信息，不应随 sync 同步到 Google 账号云端
// 偏好（主题/字号/语向）仍存 sync，跨设备同步

export async function getSettings(): Promise<{
  translators: TranslatorConfig[];
  preferences: Preferences;
}> {
  const [local, sync] = await Promise.all([
    chrome.storage.local.get('translators'),
    chrome.storage.sync.get(['translators', 'preferences']),
  ]);
  let translators = (local.translators ?? sync.translators ?? DEFAULT_TRANSLATORS) as TranslatorConfig[];
  // 迁移：旧版本 key 存在 sync，读出后写入 local（并保留 sync 副本供回退，不主动删除）
  if (local.translators === undefined && sync.translators !== undefined) {
    await chrome.storage.local.set({ translators }).catch(() => {});
  }
  return {
    translators,
    preferences: { ...DEFAULT_PREFERENCES, ...(sync.preferences ?? {}) as Partial<Preferences> },
  };
}

export async function saveSettings(
  translators: TranslatorConfig[],
  preferences: Preferences
): Promise<void> {
  await Promise.all([
    chrome.storage.local.set({ translators }),
    chrome.storage.sync.set({ preferences }),
  ]);
}

// ── 生词本设置 ──

const DEFAULT_VOCAB_SETTINGS: VocabSettings = {
  cardFront: ['word', 'phonetic'],
  cardBack: ['meaning', 'pos', 'examples', 'context'],
  cardLayout: 'minimal',
  dailyNewLimit: 10,
  dailyReviewLimit: 50,
  reviewReminder: true,
  goalCelebration: false,
};

export async function getVocabSettings(): Promise<VocabSettings> {
  const result = await chrome.storage.sync.get('vocabSettings');
  return { ...DEFAULT_VOCAB_SETTINGS, ...(result.vocabSettings ?? {}) as Partial<VocabSettings> };
}

export async function saveVocabSettings(settings: VocabSettings): Promise<void> {
  await chrome.storage.sync.set({ vocabSettings: settings });
}
