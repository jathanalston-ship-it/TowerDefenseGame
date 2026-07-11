// Genome Rank (docs/GENOME-RANK.md) — the mastery-ladder contracts:
//   • rating is pure + monotonic in every snapshot axis (progress can never LOWER the rank);
//   • the ladder is infinite: thresholds strictly rise forever, names/numerals deterministic;
//   • breadth is enforced structurally — no single source's weight can dominate the table;
//   • the breakdown and the Advisor derive from the same weights (no second source of truth).
// Absolute pacing (which rank a 30h account holds) is pinned by the persona-sim guard in
// dev/progressionSim.test.ts — this file pins the INSTRUMENT.

import { describe, expect, it } from 'vitest';
import {
  BEYOND_STEP, GENOME_RANKS, GENOME_SOURCES, MAX_WEIGHT_SHARE, TOTAL_WEIGHT,
  genomeAdvice, genomeBreakdown, genomeRating, genomeTitleName, rankFromRating, rankName, rankThreshold, romanNumeral,
} from './genomeRank';
import type { GenomeSnapshot } from './genomeRank';
import { meta } from '../state/meta';
import type { RunResult } from '../state/meta';
import type { RunStats } from './types';
import { HERO_ORDER, TOWER_ORDER } from './config';
import { defaultLifetimeStats } from '../save/saveStore';

function snap(over: Partial<GenomeSnapshot> = {}): GenomeSnapshot {
  return {
    accountLevel: 0, campaignStage: 0, bestWave: 0, rushBestBoss: 0, dailyCompletions: 0, lifetimeLogins: 0,
    contractsHonoured: 0, idleLifetimeHours: 0, powerScore: 0, molts: 0, masteryLevels: 0, lifetimeIchor: 0, titles: 0,
    towerStarRatio: 0, strainRatio: 0, mulliganRatio: 0, nucleusRatio: 0, heroRatio: 0, gearRatio: 0,
    geneRatio: 0, achievementRatio: 0, collectionCompletion: 0, cosmeticRatio: 0, passScore: 0,
    ...over,
  };
}

const MID = snap({
  accountLevel: 30, campaignStage: 30, bestWave: 37, rushBestBoss: 6, dailyCompletions: 4,
  contractsHonoured: 6, powerScore: 50_000, molts: 3, masteryLevels: 40, lifetimeIchor: 12, titles: 3,
  towerStarRatio: 0.3, strainRatio: 0.25, mulliganRatio: 0.2, nucleusRatio: 0.2, heroRatio: 0.4, gearRatio: 0.3,
  geneRatio: 0.35, achievementRatio: 0.4, collectionCompletion: 0.3, cosmeticRatio: 0.15, passScore: 0.4,
});

describe('the rating — pure, monotonic, breadth-weighted', () => {
  it('a fresh account rates 0 and sleeps at Rank I · Dormant', () => {
    expect(genomeRating(snap())).toBe(0);
    const r = rankFromRating(0);
    expect(r.index).toBe(1);
    expect(r.name).toBe('Dormant');
    expect(r.numeral).toBe('I');
  });

  it('every snapshot axis is monotonic: progress can never lower the rating', () => {
    const base = genomeRating(MID);
    const bumps: Partial<GenomeSnapshot>[] = [
      { accountLevel: 60 }, { campaignStage: 60 }, { bestWave: 80 }, { rushBestBoss: 12 },
      { dailyCompletions: 20 }, { contractsHonoured: 30 }, { idleLifetimeHours: 120 }, { powerScore: 500_000 }, { molts: 8 }, { masteryLevels: 120 },
      { lifetimeIchor: 60 }, { titles: 8 }, { towerStarRatio: 0.8 }, { strainRatio: 0.8 },
      { mulliganRatio: 0.8 }, { heroRatio: 0.9 }, { gearRatio: 0.8 }, { geneRatio: 0.9 },
      { achievementRatio: 0.9 }, { collectionCompletion: 0.8 }, { cosmeticRatio: 0.7 }, { passScore: 1.5 },
    ];
    for (const b of bumps) {
      expect(genomeRating({ ...MID, ...b }), JSON.stringify(b)).toBeGreaterThan(base);
    }
  });

  it('no single source may dominate the weight table (breadth is the point)', () => {
    for (const src of GENOME_SOURCES) {
      expect(src.weight / TOTAL_WEIGHT, src.id).toBeLessThanOrEqual(MAX_WEIGHT_SHARE);
    }
    // …and every major-system category is represented.
    const cats = new Set(GENOME_SOURCES.map((s) => s.category));
    expect([...cats].sort()).toEqual(['arsenal', 'identity', 'journey', 'strength']);
  });

  it('completion axes clamp at their soft ceiling (a >100% ratio cannot farm rating)', () => {
    const full = genomeRating(snap({ towerStarRatio: 1 }));
    expect(genomeRating(snap({ towerStarRatio: 1.7 }))).toBe(full);
  });
});

describe('the ladder — ten named ranks, then forever', () => {
  it('thresholds rise strictly forever; boundaries resolve exactly', () => {
    for (let i = 1; i < 300; i++) {
      expect(rankThreshold(i + 1)).toBeGreaterThan(rankThreshold(i));
    }
    for (let i = 2; i <= 12; i++) {
      const at = rankThreshold(i);
      expect(rankFromRating(at).index).toBe(i); // exactly at the door → inside
      expect(rankFromRating(at - 1).index).toBe(i - 1);
    }
    expect(rankThreshold(11)).toBe(GENOME_RANKS[9].at + BEYOND_STEP);
  });

  it('named identities through X; deterministic procedural identities beyond', () => {
    expect(rankName(1)).toBe('Dormant');
    expect(rankName(10)).toBe('Living Catastrophe');
    expect(rankName(14)).toBe(rankName(14)); // stable
    expect(rankName(14)).not.toBe(rankName(15)); // adjacent ranks read differently
    expect(romanNumeral(14)).toBe('XIV');
    expect(romanNumeral(49)).toBe('XLIX');
    const deep = rankFromRating(10_000_000);
    expect(deep.index).toBeGreaterThan(100);
    expect(deep.numeral.length).toBeGreaterThan(0);
    expect(deep.need).toBe(BEYOND_STEP);
  });

  it('the view is exact: into < need, and adding `need - into` promotes', () => {
    const r = rankFromRating(1000);
    expect(r.into).toBeLessThan(r.need);
    expect(rankFromRating(1000 + (r.need - r.into)).index).toBe(r.index + 1);
  });
});

describe('breakdown + advisor — one weight table, two lenses', () => {
  it('breakdown shares sum to 1 and sort biggest-first', () => {
    const rows = genomeBreakdown(MID);
    expect(rows.length).toBe(GENOME_SOURCES.length);
    const share = rows.reduce((a, r) => a + r.share, 0);
    expect(share).toBeGreaterThan(0.999);
    expect(share).toBeLessThan(1.001);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].rating).toBeGreaterThanOrEqual(rows[i].rating);
  });

  it('advice surfaces the biggest realistic opportunities, never negative, capped to n', () => {
    const adv = genomeAdvice(MID, 4);
    expect(adv.length).toBe(4);
    for (const a of adv) {
      expect(a.potential).toBeGreaterThanOrEqual(0);
      expect(a.hint.length).toBeGreaterThan(0);
      expect(a.nav.length).toBeGreaterThan(0);
    }
    for (let i = 1; i < adv.length; i++) expect(adv[i - 1].potential).toBeGreaterThanOrEqual(adv[i].potential);
    // A completion axis' potential is exactly its remaining weighted points.
    const gear = genomeAdvice(snap({ gearRatio: 0.4 }), GENOME_SOURCES.length).find((a) => a.id === 'equipment');
    const w = GENOME_SOURCES.find((s) => s.id === 'equipment')!.weight;
    expect(gear?.potential).toBeCloseTo((w * (10 - 0.4 * 10)) / 10, 1);
  });

  it('a maxed completion axis stops advising (no dead hints)', () => {
    const adv = genomeAdvice(snap({ gearRatio: 1 }), GENOME_SOURCES.length);
    expect(adv.find((a) => a.id === 'equipment')?.potential).toBe(0);
  });
});

// ── The meta fold — promotions detect against the watermark and pay exactly once ──

function makeResult(over: Partial<RunResult>, stats: Partial<RunStats> = {}): RunResult {
  const zero = { kills: 0, damage: 0, activeTime: 0 };
  const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
  const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
  const s: RunStats = {
    kills: 0, wave: 0, won: false, biomassEarned: 0, damageDealt: 0, integrityLost: 0,
    killsByEnemy: defaultLifetimeStats().killsByEnemy,
    towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
    cardIds: [], heroId: HERO_ORDER[0], ...stats,
  };
  return { wave: 0, kills: 0, won: false, mastery, heroMastery, stats: s, ...over };
}

describe('meta integration — the rank derives, promotions celebrate once', () => {
  it('a fresh account sleeps at Dormant with the watermark at I', () => {
    meta.reset();
    const v = meta.genomeRank();
    expect(v.index).toBe(1);
    expect(meta.get().genomeRank.celebrated).toBe(1);
    expect(meta.drainGenomePromotions()).toEqual([]);
  });

  it('a monster settle crosses ranks; rewards land once; the drain empties', () => {
    meta.reset();
    meta.finishRun(makeResult({ wave: 120, kills: 6000 }, { wave: 120, kills: 6000 }));
    const view = meta.genomeRank();
    expect(view.index).toBeGreaterThan(1); // deep depth axes alone must promote
    // finishRun already polled: the watermark advanced WITH the rewards.
    const save = meta.get();
    expect(save.genomeRank.celebrated).toBe(view.index);
    for (let i = 2; i <= view.index; i++) expect(save.unlockedTitles).toContain(`grank_${i}`);
    // The queue holds each crossed rank exactly once, then empties.
    const promos = meta.drainGenomePromotions();
    expect(promos.map((p) => p.index)).toEqual(Array.from({ length: view.index - 1 }, (_, i) => i + 2));
    expect(promos.every((p) => p.reward.cores > 0)).toBe(true);
    expect(meta.drainGenomePromotions()).toEqual([]);
  });

  it('genome titles resolve through the shared display chain', () => {
    expect(genomeTitleName('grank_5')).toBe('Parasitic V');
    expect(genomeTitleName('acct_t10')).toBeUndefined(); // foreign ids pass through
  });

  it('the advisor and breakdown ride the live save', () => {
    meta.reset();
    const rows = meta.genomeBreakdown();
    expect(rows.length).toBe(GENOME_SOURCES.length);
    const adv = meta.genomeAdvice(3);
    expect(adv.length).toBe(3);
  });
});
