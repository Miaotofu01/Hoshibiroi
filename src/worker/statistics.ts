/**
 * Shared statistics computations used by multiple worker handlers.
 * Pure functions — no side effects, no storage access.
 */
import type { FavoriteWord } from '../shared/types';

// ── Date utilities ──

const DAY_MS = 86_400_000;

/** Start of today (local midnight) as epoch ms */
export function todayStart(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Format a timestamp as local "YYYY-MM-DD" string */
export function localDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Tomorrow local midnight as epoch ms */
export function tomorrowStart(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}

// ── Mastery / Learning ──

/** Mastery criteria: 3+ reviews with difficulty below 7.0 */
export function computeMastered(words: FavoriteWord[]): number {
  return words.filter(w => w.reviewCount >= 3 && (w.difficulty ?? 5.0) < 7.0).length;
}

/** Learning criteria: has been reviewed but not yet mastered */
export function computeLearning(words: FavoriteWord[]): number {
  return words.filter(w => w.reviewCount > 0 && !(w.reviewCount >= 3 && (w.difficulty ?? 5.0) < 7.0)).length;
}

// ── Streak ──

/**
 * Compute consecutive days with at least one review, counting back from todayTs.
 * Uses the same logic originally duplicated in GET_LEARN_STATS and GET_FULL_STATS.
 */
export function computeDailyStreak(words: FavoriteWord[], todayTs: number): number {
  let streak = 0;
  let checkDay = todayTs;
  while (true) {
    const dayStart = checkDay;
    const dayEnd = checkDay + DAY_MS;
    const hasReview = words.some(f =>
      f.lastReviewedAt >= dayStart && f.lastReviewedAt < dayEnd,
    );
    if (!hasReview) break;
    streak++;
    checkDay -= DAY_MS;
  }
  return streak;
}

// ── Calendar / Forecast ──

/**
 * Build day-bucketed counts for `numDays` days.
 * For calendar (past): start = todayTs - (numDays-1) * DAY_MS, field = 'lastReviewedAt'.
 * For forecast (future): start = tomorrowStart(), field = 'nextReviewAt'.
 */
export function buildDayBuckets(
  words: FavoriteWord[],
  startMs: number,
  numDays: number,
  field: 'lastReviewedAt' | 'nextReviewAt',
): Array<{ date: string; count: number }> {
  const buckets: Array<{ date: string; count: number }> = [];
  for (let i = 0; i < numDays; i++) {
    const dayStart = startMs + i * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    const count = words.filter(f => {
      const ts = f[field];
      return ts > 0 && ts >= dayStart && ts < dayEnd;
    }).length;
    buckets.push({ date: localDateStr(dayStart), count });
  }
  return buckets;
}
