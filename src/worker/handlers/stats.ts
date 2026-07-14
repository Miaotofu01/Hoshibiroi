import type { GetForecastRequest, GetFullStatsRequest, ForecastResponse, FullStatsResponse } from '../../shared/messages';
import { getFavorites } from '../storage';
import {
  todayStart, tomorrowStart, localDateStr,
  computeMastered, computeLearning, computeDailyStreak,
  buildDayBuckets,
} from '../statistics';

export async function handleGetForecast(req: GetForecastRequest): Promise<ForecastResponse> {
  const favorites = await getFavorites();
  const baseStart = tomorrowStart();
  const days = buildDayBuckets(favorites, baseStart, req.days, 'nextReviewAt');
  return { type: 'FORECAST_RESULT', days };
}

export async function handleGetFullStats(_req: GetFullStatsRequest): Promise<FullStatsResponse> {
  const all = await getFavorites();
  const todayTs = todayStart();
  const dayMs = 86_400_000;

  const total = all.length;
  const learning = computeLearning(all);
  const mastered = computeMastered(all);
  const reviewedToday = all.filter(f => f.lastReviewedAt >= todayTs).length;
  const streak = computeDailyStreak(all, todayTs);

  // Calendar: last 371 days (53 weeks ≈ 1 year)
  const calendarStart = todayTs - 370 * dayMs;
  const calendar = buildDayBuckets(all, calendarStart, 371, 'lastReviewedAt');

  // Forecast: next 7 calendar days
  const forecastStart = tomorrowStart();
  const forecast = buildDayBuckets(all, forecastStart, 7, 'nextReviewAt');

  const goalData = await chrome.storage.sync.get(['dailyGoal']);
  const dailyGoal: number = (goalData as any)?.dailyGoal || 10;

  return {
    type: 'FULL_STATS_RESULT',
    total, learning, mastered, streak, reviewedToday, dailyGoal,
    calendar, forecast,
  };
}
