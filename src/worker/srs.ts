import type { FavoriteWord } from '../shared/types';

/**
 * SM-2 间隔复习算法（SuperMemo 2）
 * 纯函数：输入词和用户自评 quality，返回需要更新的 SRS 字段
 *
 * quality: 0-5
 *   0 = 完全忘记
 *   1 = 有印象但想不起
 *   2 = 想了很久才想起
 *   3 = 想了会儿想起来
 *   4 = 稍有犹豫想起来
 *   5 = 秒记
 */
export interface SRSUpdate {
  reviewCount: number;
  lastReviewedAt: number;
  nextReviewAt: number;
  easeFactor: number;
}

export function sm2(word: FavoriteWord, quality: number): SRSUpdate {
  const now = Date.now();
  let { reviewCount, easeFactor } = word;

  // clamp quality
  const q = Math.max(0, Math.min(5, Math.round(quality)));

  let interval: number; // days

  if (q < 3) {
    // 没记住 → 归零重来
    interval = 1;
    reviewCount = 0;
  } else {
    // 记住了 → 按 SM-2 计算间隔
    if (reviewCount === 0) {
      interval = 1;
    } else if (reviewCount === 1) {
      interval = 6;
    } else {
      // 获取上次的间隔天数
      const prevInterval = word.lastReviewedAt > 0
        ? Math.max(1, Math.round((word.nextReviewAt - word.lastReviewedAt) / 86400000))
        : 1;
      interval = Math.round(prevInterval * easeFactor);
    }

    // 更新 ease factor
    easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    reviewCount++;
  }

  return {
    reviewCount,
    lastReviewedAt: now,
    nextReviewAt: now + interval * 86400000,
    easeFactor,
  };
}
