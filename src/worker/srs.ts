/**
 * FSRS-5 DSR (Difficulty, Stability, Retrievability) Scheduler
 *
 * Based on the Free Spaced Repetition Scheduler by Jarrett Ye (LMSherlock),
 * published at https://github.com/open-spaced-repetition/fsrs
 *
 * Three-component memory model:
 *   D (Difficulty):  inherent complexity of the item, range [1, 10]
 *   S (Stability):   days for retrievability to drop from 100% → 90%
 *   R (Retrievability): probability of recall at a given moment
 *
 * Grades (4-level, Anki-compatible):
 *   1 = Again — forgot completely
 *   2 = Hard  — remembered with significant difficulty
 *   3 = Good  — remembered normally
 *   4 = Easy  — remembered effortlessly
 */

// ═══════════════════════════════════════════════
//  FSRS-5 Default Parameters (19 weights)
//  Optimized from billions of real-world reviews.
//  Source: https://github.com/open-spaced-repetition/fsrs
// ═══════════════════════════════════════════════

const W = Object.freeze([
  0.40255,   // w0:  init stability after Again (S₀₁)
  1.18385,   // w1:  init stability after Hard  (S₀₂)
  3.173,     // w2:  init stability after Good  (S₀₃)
  15.69105,  // w3:  init stability after Easy  (S₀₄)
  7.1949,    // w4:  D₀(1) — init difficulty when first rating is Again
  0.5345,    // w5:  difficulty decay rate in initial D formula
  1.4604,    // w6:  difficulty delta magnitude
  0.0046,    // w7:  mean reversion weight for difficulty
  0.80,      // w8:  stability increase scale factor (tuned for language learning)
  0.18,      // w9:  stability increase decay exponent (stronger saturation)
  1.30,      // w10: stability increase R-dependence (spacing effect)
  1.9395,    // w11: post-lapse stability scale
  0.11,      // w12: post-lapse stability D exponent
  0.29605,   // w13: post-lapse stability S exponent
  2.2698,    // w14: post-lapse stability R exponent
  0.40,      // w15: Hard penalty multiplier (was 0.23, less harsh now)
  2.9898,    // w16: Easy bonus multiplier (grade=4)
  0.51655,   // w17: short-term stability grade scale
  0.6621,    // w18: short-term stability grade offset
] as const);

// ═══════════════════════════════════════════════
//  Forgetting Curve (FSRS-4.5 / FSRS-5)
//  R(t, S) = (1 + FACTOR × t / S)^DECAY
//  When t = S, R = 0.9 (definition of stability)
// ═══════════════════════════════════════════════

const DECAY = -0.5;
const FACTOR = 19 / 81; // ≈ 0.234568

// ═══════════════════════════════════════════════
//  Tunable Defaults
// ═══════════════════════════════════════════════

export const DEFAULT_RETENTION = 0.92;
const MAX_INTERVAL = 90;  // max interval in days — language learners don't need year-long gaps

// ═══════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════

export interface SRSState {
  difficulty: number;
  stability: number;
  reviewCount: number;
  lastReviewedAt: number;
  nextReviewAt: number;
}

// ═══════════════════════════════════════════════
//  Core Formulas
// ═══════════════════════════════════════════════

/**
 * Initial stability after the FIRST EVER review.
 * S₀(G) = w_{G-1}
 */
export function initStability(grade: number): number {
  return W[grade - 1]!;
}

/**
 * Initial difficulty after the FIRST EVER review.
 * D₀(G) = w₄ − e^{w₅ × (G−1)} + 1
 */
export function initDifficulty(grade: number): number {
  const raw = W[4]! - Math.exp(W[5]! * (grade - 1)) + 1;
  return clamp(1, 10, raw);
}

/**
 * Retrievability at time `elapsedDays` since last review.
 * R(t, S) = (1 + FACTOR × t / S)^DECAY
 */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  if (elapsedDays <= 0) return 1;
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
}

/**
 * Next interval from stability and desired retention.
 * Solves R(I, S) = r for I:
 *   I(r, S) = S / FACTOR × (r^{1/DECAY} − 1)
 */
export function nextInterval(stability: number, desiredRetention: number): number {
  const r = clamp(0.7, 0.99, desiredRetention);
  const raw = stability / FACTOR * (Math.pow(r, 1 / DECAY) - 1);
  return Math.max(1, Math.min(MAX_INTERVAL, Math.round(raw)));
}

/**
 * Update difficulty after a review.
 *
 * Step 1: ΔD(G) = −w₆ × (G − 3)
 *   Again(G=1): +2×w₆  (large increase)
 *   Hard(G=2):  +w₆     (small increase)
 *   Good(G=3):  0       (no change)
 *   Easy(G=4):  −w₆    (decrease)
 *
 * Step 2: Linear damping — as D → 10, updates get smaller
 *   D′ = D + ΔD × (10 − D) / 9
 *
 * Step 3: Mean reversion toward D₀(Easy) to prevent "ease hell"
 *   D″ = w₇ × D₀(4) + (1 − w₇) × D′
 */
export function nextDifficulty(D: number, grade: number): number {
  const deltaD = -W[6]! * (grade - 3);
  // Linear damping
  const dPrime = D + deltaD * (10 - D) / 9;
  // Mean reversion toward D₀(Easy)
  const d0Easy = initDifficulty(4);
  const dNew = W[7]! * d0Easy + (1 - W[7]!) * dPrime;
  return clamp(1, 10, dNew);
}

/**
 * New stability after a SUCCESSFUL recall (grade ≥ 2).
 *
 * SInc = 1 + e^{w₈} × (11 − D) × S^{−w₉} × (e^{w₁₀×(1−R)} − 1)
 *          × hardPenalty(if G=2) × easyBonus(if G=4)
 *
 * Key properties:
 *   - Larger D → smaller SInc (harder material stabilizes slower)
 *   - Larger S → smaller SInc (diminishing returns, stability saturates)
 *   - Lower R → larger SInc (spacing effect — reviewing when almost forgotten
 *     gives a bigger stability boost, but converges to an upper limit)
 *   - SInc ≥ 1 always (stability never decreases on success)
 */
export function nextRecallStability(
  D: number,
  S: number,
  R: number,
  grade: number,
): number {
  const hardPenalty = grade === 2 ? W[15]! : 1;
  const easyBonus = grade === 4 ? W[16]! : 1;

  const SInc =
    1 +
    Math.exp(W[8]!) *
      (11 - D) *
      Math.pow(S, -W[9]!) *
      (Math.exp(W[10]! * (1 - R)) - 1) *
      hardPenalty *
      easyBonus;

  return S * Math.max(1, SInc);
}

/**
 * New stability after FORGETTING (grade = 1).
 *
 * S′ = min(w₁₁ × D^{−w₁₂} × ((S+1)^{w₁₃} − 1) × e^{w₁₄×(1−R)},  S)
 *
 * The min(…, S) ensures post-lapse stability can never exceed
 * pre-lapse stability. A word you've known well (high S) will keep
 * more residual stability than a word you barely learned.
 */
export function nextForgetStability(D: number, S: number, R: number): number {
  const sNew =
    W[11]! *
    Math.pow(D, -W[12]!) *
    (Math.pow(S + 1, W[13]!) - 1) *
    Math.exp(W[14]! * (1 - R));

  return Math.min(sNew, S);
}

/**
 * Short-term stability update for same-day reviews.
 * S′ = S × e^{w₁₇ × (G − 3 + w₁₈)}
 *
 * For Good(G=3):  S′ = S × e^{w₁₇ × w₁₈}
 * For Easy(G=4):  S′ = S × e^{w₁₇ × (1 + w₁₈)}
 * For Hard(G=2):  S′ = S × e^{w₁₇ × (w₁₈ − 1)}
 */
export function nextShortTermStability(S: number, grade: number): number {
  return S * Math.exp(W[17]! * (grade - 3 + W[18]!));
}

// ═══════════════════════════════════════════════
//  Main Scheduler
// ═══════════════════════════════════════════════

interface ScheduleInput {
  /** Current difficulty, or 0 if this is the first review */
  difficulty: number;
  /** Current stability (stored in easeFactor), or 0 if first review */
  stability: number;
  /** Current review count */
  reviewCount: number;
  /** Timestamp of last review, or 0 if never reviewed */
  lastReviewedAt: number;
  /** Whether this review is on the same calendar day as the last one */
  isSameDay: boolean;
}

/**
 * Compute the next SRS state for a word after a review.
 *
 * This is the main entry point. It handles:
 *   - First-ever review (initial D and S)
 *   - Successful recall (D update + stability growth)
 *   - Forgetting (D update + stability reset with residual)
 *   - Same-day reviews (short-term stability formula)
 */
export function schedule(
  input: ScheduleInput,
  grade: number,
  now: number,
  desiredRetention: number = DEFAULT_RETENTION,
): SRSState {
  const prevD = input.difficulty > 0 ? input.difficulty : 5.0;
  const elapsedDays =
    input.lastReviewedAt > 0
      ? (now - input.lastReviewedAt) / 86_400_000
      : 0;
  const R =
    input.lastReviewedAt > 0
      ? retrievability(elapsedDays, input.stability)
      : 1;

  let newD: number;
  let newS: number;
  let newCount: number;

  if (grade === 1) {
    // ── Forgot (Again) ──
    newD = nextDifficulty(prevD, 1);

    if (input.reviewCount === 0) {
      // First review was a fail — use Again initial stability
      newS = initStability(1);
    } else {
      // Post-lapse stability: residual from prior mastery
      newS = nextForgetStability(prevD, input.stability, R);
    }

    newCount = 0; // reset review count on lapse
  } else {
    // ── Success (Hard / Good / Easy) ──
    newD = nextDifficulty(prevD, grade);

    if (input.reviewCount === 0 && input.lastReviewedAt > 0) {
      // Post-lapse recovery: reviewCount was reset by a prior Again,
      // but this card has history. Build on the penalized stability
      // instead of treating it as a first-ever review.
      if (input.isSameDay) {
        newS = nextShortTermStability(input.stability, grade);
      } else {
        newS = nextRecallStability(newD, input.stability, R, grade);
      }
    } else if (input.reviewCount === 0) {
      // Genuine first-ever success — no prior reviews
      newS = initStability(grade);
    } else if (input.isSameDay && input.lastReviewedAt > 0) {
      // Same-day review: short-term formula
      newS = nextShortTermStability(input.stability, grade);
    } else {
      // Normal review: full stability growth formula
      newS = nextRecallStability(newD, input.stability, R, grade);
    }

    newCount = input.reviewCount + 1;
  }

  const interval = nextInterval(newS, desiredRetention);

  return {
    difficulty: newD,
    stability: newS,
    reviewCount: newCount,
    lastReviewedAt: now,
    nextReviewAt: now + interval * 86_400_000,
  };
}

// ═══════════════════════════════════════════════
//  Legacy compatibility
// ═══════════════════════════════════════════════

/**
 * Normalize old quality values to the new 4-grade system.
 *
 * Old system:  1 = 不认识, 3 = 模糊, 5 = 认识
 * New system:  1 = Again, 2 = Hard, 3 = Good, 4 = Easy
 *
 * Old → New mapping:
 *   5 (认识) → 3 (Good)
 *   3 (模糊) → 2 (Hard)
 *   1 (不认识) → 1 (Again)
 */
export function normalizeQuality(oldQuality: number): number {
  if (oldQuality === 5) return 3;  // old "known" → Good
  if (oldQuality === 3) return 2;  // old "fuzzy" → Hard
  if (oldQuality >= 1 && oldQuality <= 4) return oldQuality; // already new
  return 1; // fallback
}

/**
 * Legacy SM-2 compatibility wrapper around FSRS-5 schedule().
 *
 * Called by worker/index.ts to compute the next review state for a word.
 * Accepts a FavoriteWord-like object and a quality score (old 1/3/5 or new 1-4),
 * normalizes it, then delegates to schedule().
 *
 * Returns a patch object suitable for spreading into updateFavorite().
 */
export function sm2(
  word: { easeFactor: number; reviewCount: number; lastReviewedAt: number },
  quality: number,
): {
  easeFactor: number;
  reviewCount: number;
  lastReviewedAt: number;
  nextReviewAt: number;
} {
  const grade = normalizeQuality(quality);
  const now = Date.now();
  const isSameDay =
    word.lastReviewedAt > 0 &&
    new Date(word.lastReviewedAt).toDateString() === new Date(now).toDateString();

  const state = schedule(
    {
      difficulty: 0, // not persisted on FavoriteWord; schedule() defaults to 5.0
      stability: word.easeFactor || 0,
      reviewCount: word.reviewCount,
      lastReviewedAt: word.lastReviewedAt,
      isSameDay,
    },
    grade,
    now,
  );

  return {
    easeFactor: state.stability,
    reviewCount: state.reviewCount,
    lastReviewedAt: state.lastReviewedAt,
    nextReviewAt: state.nextReviewAt,
  };
}

// ═══════════════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════════════

function clamp(lo: number, hi: number, v: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Compute memory retention at a specific past timestamp.
 * Used by the stats panel for retention curves.
 */
export function retentionAt(
  timestamp: number,
  reviewTimestamp: number,
  stability: number,
): number {
  const t = (timestamp - reviewTimestamp) / 86_400_000;
  if (t < 0) return 1;
  return retrievability(t, Math.max(0.01, stability));
}
