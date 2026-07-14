import type { SubmitReviewRequest, GetDueWordsRequest, GetLearnStatsRequest, GetWordHistoryRequest } from '../../shared/messages';
import type { ReviewResponse, DueWordsResponse, LearnStatsResponse, WordHistoryResponse } from '../../shared/messages';
import { getFavorites, updateFavorite, getDueWords } from '../storage';
import { schedule, normalizeQuality, DEFAULT_RETENTION } from '../srs';
import { todayStart, computeDailyStreak, computeMastered } from '../statistics';

export async function handleSubmitReview(req: SubmitReviewRequest): Promise<ReviewResponse> {
  const favorites = await getFavorites();
  const word = favorites.find(f => f.id === req.wordId);
  if (!word) return { type: 'REVIEW_RESULT', word: null as any };

  const grade = normalizeQuality(req.quality);
  const now = Date.now();
  const elapsedDays = word.lastReviewedAt > 0
    ? (now - word.lastReviewedAt) / 86_400_000
    : Infinity;

  const state = schedule(
    {
      difficulty: word.difficulty ?? 5.0,
      stability: word.easeFactor > 0 ? word.easeFactor : 0,
      reviewCount: word.reviewCount,
      lastReviewedAt: word.lastReviewedAt,
      isSameDay: elapsedDays < 1,
    },
    grade,
    now,
    DEFAULT_RETENTION,
  );

  const history = word.reviewHistory ?? [];
  const intervalDays = Math.round((state.nextReviewAt - state.lastReviewedAt) / 86_400_000);
  history.push({
    timestamp: now,
    quality: grade,
    interval: intervalDays,
  });
  if (history.length > 30) history.splice(0, history.length - 30);

  const learned = word.learned || (grade >= 3 && state.reviewCount >= 1);

  const updated = await updateFavorite(req.wordId, {
    reviewCount: state.reviewCount,
    lastReviewedAt: state.lastReviewedAt,
    nextReviewAt: state.nextReviewAt,
    easeFactor: state.stability,
    difficulty: state.difficulty,
    reviewHistory: history,
    learned,
  });
  return { type: 'REVIEW_RESULT', word: updated! };
}

export async function handleGetDueWords(_req: GetDueWordsRequest): Promise<DueWordsResponse> {
  const due = await getDueWords();
  return { type: 'DUE_WORDS_RESULT', words: due };
}

export async function handleGetLearnStats(_req: GetLearnStatsRequest): Promise<LearnStatsResponse> {
  const all = await getFavorites();
  const now = Date.now();
  const todayTs = todayStart();

  const total = all.length;
  const due = all.filter(f => f.nextReviewAt === 0 || f.nextReviewAt <= now).length;
  const reviewedToday = all.filter(f => f.lastReviewedAt >= todayTs).length;
  const mastered = computeMastered(all);
  const streak = computeDailyStreak(all, todayTs);

  return { type: 'LEARN_STATS_RESULT', total, due, reviewedToday, streak, mastered };
}

export async function handleGetWordHistory(req: GetWordHistoryRequest): Promise<WordHistoryResponse> {
  const favorites = await getFavorites();
  const word = favorites.find(f => f.id === req.wordId);
  return {
    type: 'WORD_HISTORY_RESULT',
    wordId: req.wordId,
    history: word?.reviewHistory ?? [],
  };
}
