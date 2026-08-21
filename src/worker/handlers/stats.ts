import type { GetForecastRequest, ForecastResponse } from '../../shared/messages';
import { getFavorites } from '../storage';
import {
  tomorrowStart,
  buildDayBuckets,
} from '../statistics';

// 注：GET_FULL_STATS 刻意保留在 worker/index.ts 内联实现——
// 其热力图为 119 天（17 周），与 vocab 统计面板的渲染宽度匹配；
// 本文件只提供基于共享统计模块的 forecast 实现。
export async function handleGetForecast(req: GetForecastRequest): Promise<ForecastResponse> {
  const favorites = await getFavorites();
  const baseStart = tomorrowStart();
  const days = buildDayBuckets(favorites, baseStart, req.days, 'nextReviewAt');
  return { type: 'FORECAST_RESULT', days };
}
