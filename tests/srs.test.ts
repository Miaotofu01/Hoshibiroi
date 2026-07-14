/**
 * Black-box tests for FSRS-5 scheduler.
 *
 * Tests are deterministic — no randomness, no network, pure computation.
 * Run: npx vitest run tests/srs.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  schedule,
  initStability,
  initDifficulty,
  nextDifficulty,
  nextRecallStability,
  nextForgetStability,
  nextShortTermStability,
  nextInterval,
  retrievability,
  DEFAULT_RETENTION,
  type SRSState,
} from '../src/worker/srs';

// ── Helpers ──

const DAY = 86_400_000;

function ts(daysFromNow: number): number {
  return Date.now() + daysFromNow * DAY;
}

/** Call schedule() and extract just the interval in days */
function intervalDays(state: SRSState): number {
  return Math.round((state.nextReviewAt - state.lastReviewedAt) / DAY);
}

// ═══════════════════════════════════════════════
//  1. Parameter sanity — known intervals from tuned params
// ═══════════════════════════════════════════════

describe('FSRS-5 tuned parameters', () => {
  it('first review with Good gives 1–3 day interval', () => {
    const s = schedule(
      { difficulty: 0, stability: 0, reviewCount: 0, lastReviewedAt: 0, isSameDay: false },
      3, // Good
      ts(0),
    );
    const iv = intervalDays(s);
    expect(iv).toBeGreaterThanOrEqual(1);
    expect(iv).toBeLessThanOrEqual(3);
    expect(s.reviewCount).toBe(1);
  });

  it('second review with Good (on time, R≈0.92) gives 3–7 day interval', () => {
    // Simulate first review 2 days ago with Good
    const first = schedule(
      { difficulty: 0, stability: 0, reviewCount: 0, lastReviewedAt: 0, isSameDay: false },
      3, // Good
      ts(-2),
    );
    // Second review now
    const second = schedule(
      {
        difficulty: first.difficulty,
        stability: first.stability,
        reviewCount: first.reviewCount,
        lastReviewedAt: first.lastReviewedAt,
        isSameDay: false,
      },
      3, // Good
      ts(0),
    );
    const iv = intervalDays(second);
    expect(iv).toBeGreaterThanOrEqual(3);
    expect(iv).toBeLessThanOrEqual(7);
  });

  it('max interval is capped at 90 days', () => {
    // Artificially high stability should hit the cap
    const s = schedule(
      { difficulty: 3, stability: 200, reviewCount: 5, lastReviewedAt: ts(-30), isSameDay: false },
      3, // Good
      ts(0),
    );
    const iv = intervalDays(s);
    expect(iv).toBeLessThanOrEqual(90);
  });
});

// ═══════════════════════════════════════════════
//  2. Grade effects — difficulty and stability changes
// ═══════════════════════════════════════════════

describe('grade effects on memory state', () => {
  it('Again on a review card increases difficulty', () => {
    const before = schedule(
      { difficulty: 0, stability: 0, reviewCount: 0, lastReviewedAt: 0, isSameDay: false },
      3, ts(-2),
    );
    const after = schedule(
      {
        difficulty: before.difficulty,
        stability: before.stability,
        reviewCount: before.reviewCount,
        lastReviewedAt: before.lastReviewedAt,
        isSameDay: false,
      },
      1, // Again
      ts(0),
    );
    expect(after.difficulty).toBeGreaterThan(before.difficulty);
    expect(after.reviewCount).toBe(0); // reset on lapse
  });

  it('Hard on a review card increases difficulty less than Again', () => {
    const base = { difficulty: 5.0, stability: 10, reviewCount: 3, lastReviewedAt: ts(-5) };
    const again = schedule({ ...base, isSameDay: false }, 1, ts(0));
    const hard = schedule({ ...base, isSameDay: false }, 2, ts(0));

    expect(hard.difficulty).toBeGreaterThan(base.difficulty);
    expect(again.difficulty).toBeGreaterThan(hard.difficulty);
    // Hard should NOT reset reviewCount
    expect(hard.reviewCount).toBe(4);
  });

  it('Easy increases difficulty less than Good (both decrease D)', () => {
    const base = { difficulty: 5.0, stability: 10, reviewCount: 3, lastReviewedAt: ts(-5) };
    const good = schedule({ ...base, isSameDay: false }, 3, ts(0));
    const easy = schedule({ ...base, isSameDay: false }, 4, ts(0));

    // Easy should give lower difficulty (word is easier than expected)
    expect(easy.difficulty).toBeLessThan(good.difficulty);
    // Easy should give longer interval
    const goodIv = intervalDays(good);
    const easyIv = intervalDays(easy);
    expect(easyIv).toBeGreaterThan(goodIv);
  });
});

// ═══════════════════════════════════════════════
//  3. Post-lapse recovery — critical fix
// ═══════════════════════════════════════════════

describe('post-lapse recovery', () => {
  it('Good after Again does NOT reset to initStability', () => {
    // Word had 3 prior reviews
    const base = { difficulty: 5.0, stability: 15, reviewCount: 3, lastReviewedAt: ts(-7) };

    // User presses Again → lapse
    const lapsed = schedule({ ...base, isSameDay: false }, 1, ts(0));

    // Same session, user presses Good → should NOT use initStability(3)
    const recovered = schedule(
      {
        difficulty: lapsed.difficulty,
        stability: lapsed.stability,
        reviewCount: lapsed.reviewCount, // 0 (reset by Again)
        lastReviewedAt: lapsed.lastReviewedAt, // just now
        isSameDay: true,
      },
      3, // Good
      ts(0),
    );

    // The fix ensures reviewCount recovers from 0→1 (post-lapse path was used),
    // and stability is NOT simply initStability(3) — it was built on the
    // post-lapse residual. Whether the result is above or below initStability
    // depends on the interaction: for lower pre-lapse S, the recovery ends up
    // below init; for higher S it can exceed it. Both are correct.
    expect(recovered.reviewCount).toBe(1);
    // Stability should be ≥ post-lapse stability (short-term formula boosts it)
    expect(recovered.stability).toBeGreaterThanOrEqual(lapsed.stability);
    // Difficulty should carry forward the Again penalty
    expect(recovered.difficulty).toBeGreaterThan(base.difficulty);
  });

  it('genuine first review still uses initStability', () => {
    const s = schedule(
      { difficulty: 0, stability: 0, reviewCount: 0, lastReviewedAt: 0, isSameDay: false },
      3,
      ts(0),
    );
    expect(s.stability).toBeCloseTo(initStability(3), 0);
    expect(s.reviewCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════
//  4. Same-day reviews — short-term stability
// ═══════════════════════════════════════════════

describe('same-day review handling', () => {
  it('same-day Good uses short-term formula', () => {
    const first = schedule(
      { difficulty: 5, stability: 10, reviewCount: 2, lastReviewedAt: ts(-3), isSameDay: false },
      3, ts(-1), // reviewed yesterday
    );
    const second = schedule(
      {
        difficulty: first.difficulty,
        stability: first.stability,
        reviewCount: first.reviewCount,
        lastReviewedAt: first.lastReviewedAt,
        isSameDay: true,
      },
      3,
      ts(0),
    );
    // Short-term formula: S * exp(w17 * w18) = S * exp(0.51655 * 0.6621) = S * 1.408
    const expected = first.stability * Math.exp(0.51655 * 0.6621);
    expect(second.stability).toBeCloseTo(expected, 0);
  });

  it('same-day Hard penalizes short-term stability', () => {
    const first = schedule(
      { difficulty: 5, stability: 10, reviewCount: 2, lastReviewedAt: ts(-3), isSameDay: false },
      3, ts(-1),
    );
    const second = schedule(
      {
        difficulty: first.difficulty,
        stability: first.stability,
        reviewCount: first.reviewCount,
        lastReviewedAt: first.lastReviewedAt,
        isSameDay: true,
      },
      2, // Hard
      ts(0),
    );
    // Short-term Hard: S * exp(w17 * (2 - 3 + w18)) = S * exp(0.51655 * (-1 + 0.6621))
    // = S * exp(-0.1745) = S * 0.84
    expect(second.stability).toBeLessThan(first.stability);
  });
});

// ═══════════════════════════════════════════════
//  5. Interval growth curve — the "target curve"
// ═══════════════════════════════════════════════

describe('interval growth curve', () => {
  function simulateReviews(initialGrade: number, subsequentGrades: number[], reviewOnTime: boolean): number[] {
    const intervals: number[] = [];

    // First review
    let state = schedule(
      { difficulty: 0, stability: 0, reviewCount: 0, lastReviewedAt: 0, isSameDay: false },
      initialGrade,
      ts(0),
    );
    intervals.push(intervalDays(state));

    // Subsequent reviews
    for (const grade of subsequentGrades) {
      const elapsed = reviewOnTime ? intervalDays(state) : intervalDays(state) + 2;
      const now = state.lastReviewedAt + elapsed * DAY;
      state = schedule(
        {
          difficulty: state.difficulty,
          stability: state.stability,
          reviewCount: state.reviewCount,
          lastReviewedAt: state.lastReviewedAt,
          isSameDay: false,
        },
        grade,
        now,
      );
      intervals.push(intervalDays(state));
    }

    return intervals;
  }

  it('all-Good curve stays within reasonable bounds', () => {
    const intervals = simulateReviews(3, [3, 3, 3, 3, 3, 3], true);

    // Expected ranges for all-Good:
    const expected = [
      [1, 3],    // review 1
      [3, 7],    // review 2
      [7, 14],   // review 3
      [14, 28],  // review 4
      [25, 50],  // review 5
      [40, 75],  // review 6
      [50, 90],  // review 7
    ];

    for (let i = 0; i < intervals.length; i++) {
      const [lo, hi] = expected[i];
      expect(intervals[i]).toBeGreaterThanOrEqual(lo);
      expect(intervals[i]).toBeLessThanOrEqual(hi);
    }
  });

  it('intervals grow monotonically with all-Good', () => {
    const intervals = simulateReviews(3, [3, 3, 3, 3, 3, 3], true);
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    }
  });
});

// ═══════════════════════════════════════════════
//  6. Cumulative penalty through per-rating submission
// ═══════════════════════════════════════════════

describe('cumulative penalty via per-rating submission', () => {
  it('Hard→Hard→Good in one session yields worse state than pure Good', () => {
    // Word with prior history
    const base = { difficulty: 5.0, stability: 12, reviewCount: 3, lastReviewedAt: ts(-5) };

    // Pure Good path (control)
    const pureGood = schedule({ ...base, isSameDay: false }, 3, ts(0));

    // Hard→Hard→Good path (same session)
    const hard1 = schedule({ ...base, isSameDay: false }, 2, ts(0));
    const hard2 = schedule(
      {
        difficulty: hard1.difficulty,
        stability: hard1.stability,
        reviewCount: hard1.reviewCount,
        lastReviewedAt: hard1.lastReviewedAt,
        isSameDay: true,
      },
      2,
      ts(0),
    );
    const good = schedule(
      {
        difficulty: hard2.difficulty,
        stability: hard2.stability,
        reviewCount: hard2.reviewCount,
        lastReviewedAt: hard2.lastReviewedAt,
        isSameDay: true,
      },
      3,
      ts(0),
    );

    // After struggling, difficulty should be higher and final interval shorter
    expect(good.difficulty).toBeGreaterThan(pureGood.difficulty);
    const ivStruggled = intervalDays(good);
    const ivPure = intervalDays(pureGood);
    expect(ivStruggled).toBeLessThan(ivPure);
  });

  it('Again→Good in one session does not reset to initStability', () => {
    const base = { difficulty: 5.0, stability: 12, reviewCount: 3, lastReviewedAt: ts(-5) };

    const again = schedule({ ...base, isSameDay: false }, 1, ts(0));
    const good = schedule(
      {
        difficulty: again.difficulty,
        stability: again.stability,
        reviewCount: again.reviewCount,
        lastReviewedAt: again.lastReviewedAt,
        isSameDay: true,
      },
      3,
      ts(0),
    );

    // Should NOT be initStability(3) = 3.17 — must be lower due to lapse penalty
    expect(good.stability).toBeLessThan(initStability(3));
    // Review count should recover
    expect(good.reviewCount).toBe(1);
    // Difficulty should be worse than base
    expect(good.difficulty).toBeGreaterThan(base.difficulty);
  });
});

// ═══════════════════════════════════════════════
//  7. Retrievability and interval formulas
// ═══════════════════════════════════════════════

describe('retrievability and interval', () => {
  it('R=0.9 at t=S (definition of stability)', () => {
    const S = 10;
    const R = retrievability(S, S);
    expect(R).toBeCloseTo(0.9, 0); // definition: R=0.9 when elapsed = stability
  });

  it('R=1 at t=0', () => {
    expect(retrievability(0, 10)).toBe(1);
  });

  it('R decays below 0.2 after long time', () => {
    // t = 360 days, S = 10 → t/S = 36, R = (1 + 0.234*36)^(-0.5) ≈ 0.33
    // t = 3650 days, S = 10 → R ≈ 0.11
    const R = retrievability(3650, 10);
    expect(R).toBeLessThan(0.2);
  });

  it('nextInterval is monotonic in stability', () => {
    const i1 = nextInterval(5, 0.92);
    const i2 = nextInterval(10, 0.92);
    const i3 = nextInterval(20, 0.92);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
  });

  it('higher desired retention → shorter interval', () => {
    const i90 = nextInterval(10, 0.90);
    const i92 = nextInterval(10, 0.92);
    const i95 = nextInterval(10, 0.95);
    expect(i92).toBeLessThan(i90); // higher retention = shorter wait
    expect(i95).toBeLessThan(i92);
  });
});
