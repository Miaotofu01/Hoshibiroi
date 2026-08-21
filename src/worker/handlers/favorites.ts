import type { ToggleFavoriteRequest, RemoveFavoriteRequest, ToggleFavoriteResponse } from '../../shared/messages';
import { findFavoriteByKey, removeFavorite, addFavorite, updateFavorite, getFavorites, favoriteKey, mergeFormPatch } from '../storage';
import type { FavoriteWord } from '../../shared/types';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/**
 * 收藏切换（词形归并版）：
 * - 词头/已有词形完全一致（忽略大小写）→ 取消收藏（原行为）
 * - lemma 相同但词形不同（run ↔ running）→ 并入已有词条，保留 SRS 进度
 * - 全新词 → 新建（有 lemma 时词头用原形，所选词形记入 forms）
 */
export async function handleToggleFavorite(req: ToggleFavoriteRequest): Promise<ToggleFavoriteResponse> {
  const key = favoriteKey(req.word, req.lemma);
  const form = req.word.trim();
  const existing = await findFavoriteByKey(key);

  if (existing) {
    // 取消：点的是词头本身，或已记录过的词形
    const recorded = favoriteKey(existing.word, existing.lemma) === form.toLowerCase()
      || (existing.forms ?? []).some(f => f.toLowerCase() === form.toLowerCase());
    if (recorded) {
      await removeFavorite(existing.id);
      return { type: 'FAVORITE_RESULT', added: false, word: null };
    }
    // 并入
    const updated = await updateFavorite(existing.id, mergeFormPatch(existing, form, req.context, req.sourceUrl));
    return { type: 'FAVORITE_RESULT', added: true, word: updated, merged: true };
  }

  // 新建
  const lemma = req.lemma?.trim().toLowerCase();
  const word: FavoriteWord = {
    id: generateId(),
    word: lemma && lemma !== form.toLowerCase() ? lemma : form,
    lemma,
    forms: lemma && lemma !== form.toLowerCase() ? [form] : [],
    translation: req.translation,
    context: req.context,
    sourceUrl: req.sourceUrl,
    createdAt: Date.now(),
    reviewCount: 0,
    lastReviewedAt: 0,
    nextReviewAt: 0,
    easeFactor: 0,
    difficulty: 5.0,
    reviewHistory: [],
    learned: false,
    starred: false,
    note: '',
  };
  await addFavorite(word);
  return { type: 'FAVORITE_RESULT', added: true, word, merged: false };
}

export async function handleRemoveFavorite(req: RemoveFavoriteRequest): Promise<ToggleFavoriteResponse> {
  await removeFavorite(req.id);
  return { type: 'FAVORITE_RESULT', added: false, word: null };
}

export async function handleGetFavorites(): Promise<{ type: 'FAVORITES_RESULT'; words: import('../../shared/types').FavoriteWord[] }> {
  const words = await getFavorites();
  return { type: 'FAVORITES_RESULT', words };
}
