// Boss Rush meta rewards (docs/BOSS-RUSH.md): the per-boss payout lanes, the mode's OWN records
// (never the Infinite ones), the rush-short qualify gate, prediction calibration, achievements.

import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import type { RunResult } from './meta';
import { defaultLifetimeStats } from '../save/saveStore';
import { HERO_ORDER, RUSH, TOWER_ORDER } from '../core/config';
import type { RunStats } from '../core/types';

function makeResult(over: Partial<RunResult>, bossKills = 0): RunResult {
  const zero = { kills: 0, damage: 0, activeTime: 0 };
  const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
  const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
  const stats: RunStats = {
    kills: 0, wave: 0, won: false, biomassEarned: 0, damageDealt: 0,
    killsByEnemy: defaultLifetimeStats().killsByEnemy,
    towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
    cardIds: [], heroId: HERO_ORDER[0], bossKills,
  };
  return { wave: 0, kills: 0, won: false, mastery, heroMastery, stats, ...over };
}

function freshMeta(): void {
  meta.reset();
  meta.abandonRun();
}

const hasCache = (banked: { kind: string }[]): boolean => banked.some((c) => c.kind === 'cache');

describe('Boss Rush meta rewards (docs/BOSS-RUSH.md)', () => {
  it('pays RUSH.corePerBoss per boss defeated on top of the wave/kill lane', () => {
    freshMeta();
    const base = meta.finishRun(makeResult({ wave: 5, kills: 40, bossRush: true }, 0)).reward.shardsEarned;
    freshMeta();
    const paid = meta.finishRun(makeResult({ wave: 5, kills: 40, bossRush: true }, 15)).reward.shardsEarned;
    expect(paid - base).toBe(RUSH.corePerBoss * 15); // identity mults on a fresh standard save
  });

  it('keeps its OWN records and never touches the Infinite ledger', () => {
    freshMeta();
    meta.finishRun(makeResult({ wave: 6, kills: 50, bossRush: true }, 21));
    expect(meta.get().rushBestWave).toBe(6);
    expect(meta.get().rushBestBoss).toBe(21);
    expect(meta.get().bestWave).toBe(0); // rush depth is NOT an Infinite depth
    expect(meta.get().stats.rushRuns).toBe(1);
    expect(meta.get().stats.rushBossKills).toBe(21);
    // A shallower second run: records hold, the lifetime kill ledger still accumulates.
    meta.finishRun(makeResult({ wave: 4, kills: 30, bossRush: true }, 10));
    expect(meta.get().rushBestWave).toBe(6);
    expect(meta.get().rushBestBoss).toBe(21);
    expect(meta.get().stats.rushBossKills).toBe(31);
  });

  it('gates containers behind ≥ 50% of the rush record (rush-short)', () => {
    freshMeta();
    meta.finishRun(makeResult({ wave: 10, kills: 90, bossRush: true }, 55)); // record → 10
    const short = meta.finishRun(makeResult({ wave: 3, kills: 10, bossRush: true }, 6)); // 3 < 5
    expect(short.rewardBlocked).toEqual({ reason: 'rush-short', qualifyWave: 5 });
    expect(hasCache(short.loot.banked)).toBe(false);
    const ok = meta.finishRun(makeResult({ wave: 5, kills: 40, bossRush: true }, 15)); // 5 ≥ 5
    expect(ok.rewardBlocked).toBeUndefined();
    expect(hasCache(ok.loot.banked)).toBe(true);
  });

  it('non-rush runs leave every rush ledger untouched', () => {
    freshMeta();
    meta.finishRun(makeResult({ wave: 30, kills: 300, endless: true }, 4)); // endless boss kills ≠ rush kills
    expect(meta.get().stats.rushRuns).toBe(0);
    expect(meta.get().stats.rushBossKills).toBe(0);
    expect(meta.get().rushBestWave).toBe(0);
    expect(meta.get().bestWave).toBe(30);
  });

  it('predicts + self-calibrates on its own channel', () => {
    freshMeta();
    const p = meta.predict('bossRush');
    expect(p.p.estimate).toBeGreaterThanOrEqual(1);
    meta.notePredictionBaseline('bossRush');
    meta.finishRun(makeResult({ wave: 4, kills: 30, bossRush: true }, 10));
    expect(meta.get().prediction.bossRush.samples).toBe(1);
    expect(meta.get().prediction.campaign.samples).toBe(0); // the other channels never move
    expect(meta.get().prediction.infinite.samples).toBe(0);
  });

  it('unlocks the gauntlet achievements from the run + ledgers', () => {
    freshMeta();
    const out = meta.finishRun(makeResult({ wave: 5, kills: 60, bossRush: true }, 15));
    const ids = out.achievements.map((a) => a.id);
    expect(ids).toContain('rush_first');
    expect(ids).toContain('rush_wave5');
    expect(ids).toContain('rush_boss15');
  });
});
