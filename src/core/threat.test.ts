// THE THREAT LADDER (docs/THREAT.md): a valid ≥10-rung ladder of real handicaps on existing warp
// levers, composed through the difficulty director (Threat 0 = referential passthrough ⇒ golden-
// safe), a modest reward multiplier routed through the economy director's named factor, the
// per-mode benchmarks, and the pure settle (record only grows; milestone titles derive from it).

import { describe, it, expect } from 'vitest';
import {
  THREAT_BENCHMARK, THREAT_LEVELS, THREAT_MAX, THREAT_TITLES,
  clampThreat, settleThreat, threatBenchmarkMet, threatMaxSelectable, threatProblems,
  threatRewardMult, threatRungs, threatTitleName, threatWarp,
} from './threat';
import { createDirector, threatEconomy } from './difficultyDirector';
import { coreShardIncome, explainIncome, lootPointIncome } from './economyDirector';
import { resolveDifficulty } from './difficulty';
import { resolveDoctrine } from './doctrines';
import { Game } from './game';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('the ladder — data rows', () => {
  it('validates: ≥10 contiguous rungs, each a modest handicap on an existing warp lever', () => {
    expect(threatProblems()).toEqual([]);
    expect(THREAT_MAX).toBeGreaterThanOrEqual(10);
    expect(new Set(THREAT_LEVELS.map((r) => r.name)).size).toBe(THREAT_MAX); // every rung is NAMED distinctly
  });

  it('Threat 0 is identity: no warp, ×1 reward', () => {
    expect(threatWarp(0)).toBeUndefined();
    expect(threatRewardMult(0)).toBe(1);
    expect(threatEconomy(0).rewardMult).toBe(1);
    expect(threatRungs(0)).toEqual([]);
  });

  it('rungs STACK: level L composes rungs 1..L (mult axes multiply, elite chance adds)', () => {
    const w3 = threatWarp(3)!;
    expect(w3.hpMult).toBeCloseTo(1.1, 12);
    expect(w3.speedMult).toBeCloseTo(1.06, 12);
    expect(w3.countMult).toBeCloseTo(1.12, 12);
    const w10 = threatWarp(10)!;
    expect(w10.hpMult).toBeCloseTo(1.1 * 1.12 * 1.1, 12);
    expect(w10.eliteChance).toBeCloseTo(0.05 + 0.08, 12);
    expect(w10.bountyMult).toBeCloseTo(0.88, 12);
    // Monotone harder + monotone richer up the ladder.
    for (let l = 1; l <= THREAT_MAX; l++) expect(threatRewardMult(l)).toBeGreaterThan(threatRewardMult(l - 1));
    expect(threatRewardMult(THREAT_MAX)).toBeLessThan(2); // "modest"
  });

  it('clamps out-of-range requests (stale prefs / tampered results)', () => {
    expect(clampThreat(99, 4)).toBe(4);
    expect(clampThreat(-3, 4)).toBe(0);
    expect(clampThreat(Number.NaN, 4)).toBe(0);
    expect(threatMaxSelectable(0, false)).toBe(0); // baseline not met ⇒ ladder sealed
    expect(threatMaxSelectable(0, true)).toBe(1);
    expect(threatMaxSelectable(7, true)).toBe(8);
    expect(threatMaxSelectable(THREAT_MAX, true)).toBe(THREAT_MAX);
  });
});

describe('composition — through the directors, never inline', () => {
  it('the difficulty director composes the threat warp LAST; Threat 0 passes the doctrine warp through by reference', () => {
    const doctrineWarp = resolveDoctrine('none').warp;
    const d0 = createDirector({ difficulty: resolveDifficulty('standard'), warp: doctrineWarp });
    const d0t = createDirector({ difficulty: resolveDifficulty('standard'), warp: doctrineWarp, threat: 0 });
    expect(d0t.warp).toEqual(d0.warp);
    expect(d0t.difficulty).toBe(d0.difficulty); // no damage fold at Threat 0 ⇒ the SAME object
    const d4 = createDirector({ difficulty: resolveDifficulty('standard'), threat: 4 });
    expect(d4.queueWarp().hpMult).toBeCloseTo(1.1, 12);
    expect(d4.difficulty.enemyDamageMult).toBeCloseTo(resolveDifficulty('standard').enemyDamageMult * 1.2, 12); // rung 4 folds contact damage once
  });

  it('the reward rides the economy director’s named `threat.reward` factor (identity at Threat 0)', () => {
    const base = { wave: 20, kills: 300, prestigeShardGainMult: 1, prestigeCoreGainMult: 1, stageRewardMult: 1, endlessRewardMult: 1, modeCoreMult: 1, doctrineRewardMult: 1 };
    const plain = coreShardIncome(base);
    const t0 = coreShardIncome({ ...base, threatRewardMult: threatEconomy(0).rewardMult });
    const t5 = coreShardIncome({ ...base, threatRewardMult: threatEconomy(5).rewardMult });
    expect(t0.total()).toBe(plain.total());
    expect(t5.factors.find((f) => f.id === 'threat.reward')!.value).toBe(threatRewardMult(5));
    expect(t5.total() / plain.total()).toBeCloseTo(threatRewardMult(5), 10);
    expect(explainIncome(t5)).toContain('threat.reward');
    const loot = lootPointIncome({ wave: 20, kills: 300, prestigeLootGainMult: 1, stageRewardMult: 1, modeLootMult: 1, containerRateMult: 1, bossLootMult: 1, threatRewardMult: threatEconomy(3).rewardMult });
    expect(loot.factors.some((f) => f.id === 'threat.reward' && f.value === threatRewardMult(3))).toBe(true);
  });

  it('the Game: Threat 0 runs exactly like no threat; Threat N reshapes the wave queue', () => {
    const run = (threat?: number): string => {
      const g = new Game(42, NO_META, undefined, 'ravager', undefined, { mode: 'endless', ...(threat === undefined ? {} : { threat }) });
      g.startWave();
      return JSON.stringify((g as unknown as { spawnQueue: unknown[] }).spawnQueue);
    };
    expect(run(0)).toBe(run(undefined));
    expect(run(3)).not.toBe(run(0)); // Brood Surge inflates the count; hides thicken
    const g = new Game(42, NO_META, undefined, 'ravager', undefined, { mode: 'endless', threat: 3 });
    expect(g.threat).toBe(3);
    expect(g.getSnapshot().threat).toBe(3);
  });
});

describe('benchmarks + the pure settle', () => {
  it('Campaign: WIN a replay near the frontier; Infinite / Boss Rush: REACH the depth', () => {
    const near = THREAT_BENCHMARK.campaign.nearFrontier;
    expect(threatBenchmarkMet('campaign', { won: true, wave: 10, stage: 20, frontier: 20 })).toBe(true);
    expect(threatBenchmarkMet('campaign', { won: true, wave: 10, stage: 20 - near + 1, frontier: 20 })).toBe(true);
    expect(threatBenchmarkMet('campaign', { won: true, wave: 10, stage: 20 - near, frontier: 20 })).toBe(false); // too far back
    expect(threatBenchmarkMet('campaign', { won: false, wave: 10, stage: 20, frontier: 20 })).toBe(false);
    expect(threatBenchmarkMet('endless', { won: false, wave: THREAT_BENCHMARK.endless.wave })).toBe(true);
    expect(threatBenchmarkMet('endless', { won: false, wave: THREAT_BENCHMARK.endless.wave - 1 })).toBe(false);
    expect(threatBenchmarkMet('bossRush', { won: false, wave: THREAT_BENCHMARK.bossRush.wave })).toBe(true);
  });

  it('settle: a cleared NEW level raises the record, opens the next rung and awards milestone titles once', () => {
    const rec = { campaign: 2, endless: 0, bossRush: 0 };
    const a = settleThreat(rec, 'campaign', 3, { won: true, wave: 12, stage: 9, frontier: 9 }, [], 1.15);
    expect(a.record.campaign).toBe(3);
    expect(a.outcome).toMatchObject({ level: 3, cleared: true, newRecord: true, nextUnlocked: 4, rewardMult: 1.15 });
    expect(a.outcome.titles).toEqual(['threat_t3']);
    expect(rec.campaign).toBe(2); // pure — the input record is untouched
    // Re-clearing (or owning the title already) grants nothing new; a miss never lowers the record.
    const b = settleThreat(a.record, 'campaign', 3, { won: true, wave: 12, stage: 9, frontier: 9 }, ['threat_t3'], 1.15);
    expect(b.outcome).toMatchObject({ cleared: true, newRecord: false, nextUnlocked: null, titles: [] });
    const c = settleThreat(a.record, 'campaign', 4, { won: false, wave: 3, stage: 9, frontier: 9 }, ['threat_t3'], 1.21);
    expect(c.record.campaign).toBe(3);
    expect(c.outcome.cleared).toBe(false);
    // The top rung opens nothing further.
    const top = settleThreat({ campaign: 0, endless: 9, bossRush: 0 }, 'endless', 10, { won: false, wave: 30 }, [], threatRewardMult(10));
    expect(top.outcome).toMatchObject({ newRecord: true, nextUnlocked: null });
    expect(top.outcome.titles).toEqual(THREAT_TITLES.map((t) => t.id)); // every milestone ≤ 10
  });

  it('milestone titles resolve by id (the profile title chain)', () => {
    for (const t of THREAT_TITLES) expect(threatTitleName(t.id)).toBe(t.name);
    expect(threatTitleName('nope')).toBeNull();
  });
});
