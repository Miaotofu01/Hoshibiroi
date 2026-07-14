import type { ToggleFavoriteRequest, RemoveFavoriteRequest, ToggleFavoriteResponse } from '../../shared/messages';
import { isFavorite, removeFavorite, addFavorite, getFavorites } from '../storage';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export async function handleToggleFavorite(req: ToggleFavoriteRequest): Promise<ToggleFavoriteResponse> {
  const existing = await isFavorite(req.word);
  if (existing) {
    await removeFavorite(existing.id);
    return { type: 'FAVORITE_RESULT', added: false, word: null };
  }

  const word = {
    id: generateId(),
    word: req.word,
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
  };
  await addFavorite(word);
  return { type: 'FAVORITE_RESULT', added: true, word };
}

export async function handleRemoveFavorite(req: RemoveFavoriteRequest): Promise<ToggleFavoriteResponse> {
  await removeFavorite(req.id);
  return { type: 'FAVORITE_RESULT', added: false, word: null };
}

export async function handleGetFavorites(): Promise<{ type: 'FAVORITES_RESULT'; words: import('../../shared/types').FavoriteWord[] }> {
  const words = await getFavorites();
  return { type: 'FAVORITES_RESULT', words };
}
