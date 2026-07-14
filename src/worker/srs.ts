import type { FavoriteWord } from '../shared/types';

/**
 * Ebbinghaus 遗忘曲线 SRS
 *
 * 记忆保留率模型：R(t) = e^(-t / S)
 *   t = 距上次复习的天数
 *   S = 记忆稳定性（天），表示记忆衰减到 37% 所需时间
 *
 * 调度策略：下次复习安排在 R(t) ≈ 0.9 时
 *   t_next = -ln(0.9) × S ≈ 0.105 × S
 *
 * 稳定性增长：成功回忆后 S 按指数增长；遗忘后 S 重置
 *
 * quality: 1/3/5  (不认识/模糊/认识)
 */

export interface SRSUpdate {
  reviewCount: number;
  lastReviewedAt: number;
  nextReviewAt: number;
  easeFactor: number;  // 复用为 stability (记忆稳定性，单位: 天)
}

// 初始稳定性：第一次成功复习后，记忆稳定约 1 天
const INITIAL_STABILITY = 1.0;
// 目标保留率
const TARGET_RETENTION = 0.9;
// -ln(0.9) ≈ 0.10536
const DECAY_FACTOR = -Math.log(TARGET_RETENTION);

/**
 * 根据复习质量计算稳定性增长系数
 *
 * 认识(q=5)：S 增长 2.0-2.5×，记忆巩固显著
 * 模糊(q=3)：S 增长 1.3×，记忆有一定加强
 * 不认识(q=1)：S 重置为初始值，记忆归零
 */
function stabilityGrowth(quality: number, prevStability: number): number {
  if (quality >= 5) {
    // 好回忆 → 稳定性快速增长
    // 稳定性越高，增长越谨慎（避免过度自信）
    const damp = Math.max(0.6, 1.0 - Math.log10(Math.max(1, prevStability)) * 0.15);
    return prevStability * (1.5 + damp);
  }
  if (quality >= 3) {
    // 模糊回忆 → 稳定性小幅增长
    return prevStability * 1.2;
  }
  // 不认识 → 重置
  return INITIAL_STABILITY;
}

export function sm2(word: FavoriteWord, quality: number): SRSUpdate {
  const now = Date.now();
  const q = quality; // 1, 3, or 5

  let stability: number;
  let interval: number;
  let reviewCount: number;

  if (q < 3) {
    // ── 不认识：记忆重置 ──
    stability = INITIAL_STABILITY;
    interval = 1;
    reviewCount = 0;
  } else {
    // ── 记住了：稳定性增长 ──
    const prevStability = word.easeFactor > 0 ? word.easeFactor : INITIAL_STABILITY;

    if (word.reviewCount === 0) {
      // 第一次成功复习
      stability = INITIAL_STABILITY;
    } else {
      stability = stabilityGrowth(q, prevStability);
    }

    reviewCount = word.reviewCount + 1;

    // interval = -ln(target) * stability (Ebbinghaus 核心公式)
    // 乘以 10 使间隔长度实用化（1 天稳定性 ≈ 1 天间隔）
    interval = Math.max(1, Math.round(DECAY_FACTOR * 10 * stability));

    // 限制最大间隔为 365 天
    interval = Math.min(365, interval);
  }

  return {
    reviewCount,
    lastReviewedAt: now,
    nextReviewAt: now + interval * 86400000,
    easeFactor: stability, // 复用字段存储 stability
  };
}

/**
 * 计算当前记忆保留率 R(t) = e^(-t / S)
 * t = 距离上次复习的天数
 * S = 稳定性
 */
export function retention(word: FavoriteWord): number {
  if (word.lastReviewedAt === 0 || word.easeFactor <= 0) return 0;
  const t = (Date.now() - word.lastReviewedAt) / 86400000; // days
  return Math.exp(-t / word.easeFactor);
}

/**
 * 计算历史某个时间点的记忆保留率
 */
export function retentionAt(timestamp: number, reviewTimestamp: number, stability: number): number {
  const t = (timestamp - reviewTimestamp) / 86400000;
  if (t < 0) return 1;
  return Math.exp(-t / Math.max(0.1, stability));
}
