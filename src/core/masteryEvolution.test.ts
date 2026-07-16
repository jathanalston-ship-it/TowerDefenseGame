// MASTERY EVOLUTION TRACKS (docs/MASTERY.md §evolution track) — the generator's design
// contract, swept across EVERY unit and several prestige loops so future content (a new
// tower/hero, a profile tweak) that breaks the contract fails the build, not the player.

import { describe, expect, it } from 'vitest';
import {
  MASTERY_EVOLUTION, canPrestige, masteryEvolutionProblems, masteryEvolutionTrack,
  p1ShardBudget, trackLevelOf,
} from './masteryEvolution';
import { HERO_ORDER, STAR, TOWER_ORDER } from './config';

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

describe('the prestige loop math (mastery level NEVER decreases)', () => {
  it('trackLevelOf windows each loop; canPrestige opens exactly at the loop top', () => {
    expect(trackLevelOf(0, 0)).toBe(0);
    expect(trackLevelOf(37, 0)).toBe(37);
    expect(trackLevelOf(100, 0)).toBe(100);
    expect(canPrestige(99, 0)).toBe(false);
    expect(canPrestige(100, 0)).toBe(true);
    // After prestiging at 100, the SAME mastery level re-enters loop 1 at track level 0.
    expect(trackLevelOf(100, 1)).toBe(0);
    expect(trackLevelOf(153, 1)).toBe(53);
    // A veteran at mastery 537 can chain: loop 5 sees track level 37.
    expect(trackLevelOf(537, 5)).toBe(37);
    expect(canPrestige(537, 4)).toBe(true); // loops 0..4 are all complete at 537
    expect(trackLevelOf(9999, 5)).toBe(100); // deep levels clamp to the loop top
  });
});
