// MASTERY EVOLUTION TRACKS (docs/MASTERY.md §evolution track) — the generator's design
// contract, swept across EVERY unit and several prestige loops so future content (a new
// tower/hero, a profile tweak) that breaks the contract fails the build, not the player.

import { describe, expect, it } from 'vitest';
import {
  BASE_LOOP_XP, MASTERY_EVOLUTION, canPrestigeFromXp, loopXpRequirement,
  masteryEvolutionProblems, masteryEvolutionTrack, p1ShardBudget, trackLevelFromXp,
} from './masteryEvolution';
import { HERO_ORDER, MASTERY, STAR, TOWER_ORDER } from './config';

const UNITS: { subject: 'tower' | 'hero'; unit: string }[] = [
  ...TOWER_ORDER.map((k) => ({ subject: 'tower' as const, unit: k as string })),
  ...HERO_ORDER.map((k) => ({ subject: 'hero' as const, unit: k as string })),
];

describe('every unit × prestige 1..4 honors the whole contract', () => {
  it('spacing 2–5, majors on the 10s, no empty nodes, P1 budget held, P2+ shard-free', () => {
    for (const { subject, unit } of UNITS) {
      for (let p = 0; p < 4; p++) {
        const t = masteryEvolutionTrack(subject, unit, p);
        expect(masteryEvolutionProblems(t), `${subject}:${unit} p${p}`).toEqual([]);
      }
    }
  });

  it('is deterministic: the same (unit, prestige) always generates the same track', () => {
    const a = JSON.stringify(masteryEvolutionTrack('tower', 'needle', 0));
    const b = JSON.stringify(masteryEvolutionTrack('tower', 'needle', 0));
    expect(a).toBe(b);
    // …and different prestiges / units genuinely differ (no accidental shared stream).
    expect(JSON.stringify(masteryEvolutionTrack('tower', 'needle', 1))).not.toBe(a);
    expect(JSON.stringify(masteryEvolutionTrack('tower', 'mortar', 0))).not.toBe(a);
  });
});

describe('the shard economy contract (docs/MASTERY.md §evolution track)', () => {
  it('P1 totals sit at 3.5–5 star-upgrades worth on the REAL ladder, banded by scarcity', () => {
    const cum = (base: number, mult: number, n: number): number => {
      let total = 0;
      let left = n;
      for (let s = 0; left > 0; s++, left--) total += Math.round(base * Math.pow(mult, s)) * Math.min(1, left);
      return total;
    };
    for (const { subject, unit } of UNITS) {
      const budget = p1ShardBudget(subject, unit);
      const base = subject === 'tower' ? STAR.towerBaseCost : STAR.heroBaseCost;
      const mult = subject === 'tower' ? STAR.towerCostMult : STAR.heroCostMult;
      const lo = cum(base, mult, MASTERY_EVOLUTION.starsWorthMin);
      const hi = cum(base, mult, MASTERY_EVOLUTION.starsWorthMax);
      expect(budget, `${subject}:${unit}`).toBeGreaterThanOrEqual(Math.floor(lo));
      expect(budget, `${subject}:${unit}`).toBeLessThanOrEqual(Math.ceil(hi));
    }
  });

  it('deep prestiges keep paying MORE than their debut loop (evolution, never a flat reset)', () => {
    const total = (p: number): number => {
      let n = 0;
      for (const node of masteryEvolutionTrack('tower', 'needle', p).nodes) {
        for (const g of node.grants) if ('amount' in g && g.kind !== 'ichor') n += g.amount;
      }
      return n;
    };
    expect(total(5)).toBeGreaterThan(total(1));
  });

  it('Ichor stays rare and small: never in P1, single digits per deep loop', () => {
    for (const { subject, unit } of UNITS.slice(0, 8)) {
      const p1 = masteryEvolutionTrack(subject, unit, 0);
      expect(p1.nodes.some((n) => n.grants.some((g) => g.kind === 'ichor'))).toBe(false);
      for (let p = 1; p < 4; p++) {
        let ichor = 0;
        for (const n of masteryEvolutionTrack(subject, unit, p).nodes) {
          for (const g of n.grants) if (g.kind === 'ichor') ichor += g.amount;
        }
        expect(ichor).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe('the prestige loop math — XP-metered loops (docs/MASTERY.md §pacing)', () => {
  it('the debut loop mirrors the real mastery ladder exactly, capped at the crown', () => {
    // Walk the REAL requirement curve (state/meta.masteryReq's formula) — trackLevelFromXp on
    // prestige 0 must reproduce it level for level: the helix and the mastery bar agree.
    let xp = 0;
    for (let level = 0; level < 100; level++) {
      expect(trackLevelFromXp(xp, 0), `at exactly level ${level}`).toBe(level);
      expect(trackLevelFromXp(xp + 1, 0), `one XP into level ${level}`).toBe(level);
      xp += Math.round(MASTERY.baseReq * Math.pow(MASTERY.reqGrowth, level));
    }
    expect(xp).toBe(BASE_LOOP_XP); // the loop's total IS the first 100 levels' total
    expect(trackLevelFromXp(BASE_LOOP_XP, 0)).toBe(100);
    expect(trackLevelFromXp(BASE_LOOP_XP * 50, 0)).toBe(100); // overshoot clamps to the crown
    expect(canPrestigeFromXp(BASE_LOOP_XP - 1, 0)).toBe(false);
    expect(canPrestigeFromXp(BASE_LOOP_XP, 0)).toBe(true);
  });

  it('each loop past the first costs +25% — chainable forever, never the ×83,522 wall', () => {
    expect(loopXpRequirement(0)).toBe(BASE_LOOP_XP);
    expect(loopXpRequirement(1) / loopXpRequirement(0)).toBeCloseTo(MASTERY_EVOLUTION.loopEffortGrowth, 5);
    expect(loopXpRequirement(2) / loopXpRequirement(1)).toBeCloseTo(MASTERY_EVOLUTION.loopEffortGrowth, 5);
    // Loop 6 costs ~×3.8 the debut loop — a marathon, not a myth. (Level-windowed loops on the
    // ×1.12 mastery curve would have cost ×83,522 PER LOOP — the design this replaced.)
    expect(loopXpRequirement(5)).toBeLessThan(BASE_LOOP_XP * 4);
    expect(loopXpRequirement(5)).toBeGreaterThan(BASE_LOOP_XP * 3);
    // A fresh loop always re-arms at 0 regardless of depth.
    expect(trackLevelFromXp(0, 3)).toBe(0);
    expect(canPrestigeFromXp(loopXpRequirement(3), 3)).toBe(true);
    expect(canPrestigeFromXp(loopXpRequirement(3) - BASE_LOOP_XP, 3)).toBe(false);
  });
});
