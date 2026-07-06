// Infinite depth-camping taper (docs/MODE-IDENTITY.md §anti-grind, docs/ENDLESS-SCALING.md §taper).
// Pins the pure curve: identity through startWave, smooth decay after, an exact closed-form sum,
// and the anti-grind properties (deep waves bank visibly less per wave; a deep run's total falls
// below a linear extrapolation of a shallow one). ENDLESS-only — no other mode touches these.

import { describe, it, expect } from 'vitest';
import { ENDLESS_TAPER, endlessTaper, endlessTaperedWaveSum, endlessLootTaper } from './config';
import { LOOT_EARN } from './loot';

describe('endless depth-camping taper (pure curve)', () => {
  it('is identity (×1) at or below startWave, in every mode', () => {
    for (let w = 0; w <= ENDLESS_TAPER.startWave; w++) {
      expect(endlessTaper(w)).toBe(1);
      expect(endlessLootTaper(w)).toBe(1);
      expect(endlessTaperedWaveSum(w)).toBe(Math.max(0, w));
    }
  });

  it('decays smoothly toward the floor past startWave (never below it)', () => {
    let prev = 1;
    for (let w = ENDLESS_TAPER.startWave + 1; w <= 120; w++) {
      const t = endlessTaper(w);
      expect(t).toBeLessThan(prev); // strictly decreasing
      expect(t).toBeGreaterThan(ENDLESS_TAPER.floor); // asymptotes to the floor, never crosses it
      prev = t;
    }
    // one half-life past the start = floor + half the above-floor span
    const halfway = endlessTaper(ENDLESS_TAPER.startWave + ENDLESS_TAPER.halfLife);
    expect(halfway).toBeCloseTo(ENDLESS_TAPER.floor + (1 - ENDLESS_TAPER.floor) * 0.5, 6);
  });

  it('closed-form wave-sum equals the brute-force Σ endlessTaper(w)', () => {
    for (let w = 1; w <= 100; w++) {
      let brute = 0;
      for (let k = 1; k <= w; k++) brute += endlessTaper(k);
      expect(endlessTaperedWaveSum(w)).toBeCloseTo(brute, 6);
    }
  });

  it('the wave-sum is strictly increasing ⇒ a monotonic effective-wave count', () => {
    for (let w = 1; w <= 120; w++) expect(endlessTaperedWaveSum(w + 1)).toBeGreaterThan(endlessTaperedWaveSum(w));
  });

  it('deep waves bank visibly LESS per wave than early ones (marginal taper falls)', () => {
    // Per-wave banked increment ∝ endlessTaper(wave) (marginal). A deep wave banks a fraction of an
    // early one; quantify against the curve so a re-tune must move this deliberately.
    expect(endlessTaper(50)).toBeLessThan(0.6); // wave 50 earns < 60% of an early wave …
    expect(endlessTaper(70)).toBeLessThan(endlessTaper(50)); // … and it keeps shrinking with depth
  });

  it('a deep run banks BELOW a linear extrapolation of a shallow run (anti-grind)', () => {
    // Endless loot/xp scale the flat base by endlessLootTaper (avg per-wave taper). With a fixed
    // per-wave kill rate, a wave-50 run's income must fall below the wave-20 run's rate × 50.
    const pop = 40; // kills per wave (deep population is capped ~60; 40 is a conservative mid)
    const metered = (w: number): number => (w * LOOT_EARN.pointsPerWave + w * pop * LOOT_EARN.pointsPerKill) * endlessLootTaper(w);
    const linearFrom20 = (metered(20) / 20) * 50;
    expect(metered(50)).toBeLessThan(linearFrom20);
    expect(metered(50) / linearFrom20).toBeLessThan(0.95); // a real, quantified gap
  });
});
