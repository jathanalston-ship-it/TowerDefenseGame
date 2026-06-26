import { describe, expect, it } from 'vitest';
import { accumulateStats, favoriteTower } from './stats';
import { defaultLifetimeStats, defaultSave, parseImport } from '../save/saveStore';
import type { RunStats } from '../core/types';

function run(over: Partial<RunStats> = {}): RunStats {
  return {
    kills: 10,
    wave: 5,
    won: true,
    biomassEarned: 100,
    damageDealt: 2000,
    killsByEnemy: { runner: 6, brute: 2, tyrant: 0, rusher: 1, tank: 0, flyer: 1, burrower: 0 },
    towerBuilds: { needle: 3, mortar: 1, reactor: 0 },
    cardIds: ['twin_fang', 'twin_fang', 'venom_sacs'],
    heroId: 'ravager',
    ...over,
  };
}

describe('lifetime statistics', () => {
  it('folds one run into lifetime totals (with dedup + per-kind breakdown)', () => {
    const s = accumulateStats(defaultLifetimeStats(), run());
    expect(s.lifetimeKills).toBe(10);
    expect(s.highestWave).toBe(5);
    expect(s.totalBiomass).toBe(100);
    expect(s.totalDamage).toBe(2000);
    expect(s.runsCompleted).toBe(1);
    expect(s.runsFailed).toBe(0);
    expect(s.killsByEnemy.runner).toBe(6);
    expect(s.towerUsage.needle).toBe(3);
    expect(s.cardsDrafted).toBe(3); // total drafted (incl. duplicate)
    expect([...s.uniqueCards].sort()).toEqual(['twin_fang', 'venom_sacs']); // collection deduped
    expect(s.heroUsage.ravager).toBe(1);
  });

  it('keeps the max wave, tallies losses, and resolves the favorite tower', () => {
    let s = accumulateStats(defaultLifetimeStats(), run({ wave: 8, won: true }));
    s = accumulateStats(s, run({ wave: 3, won: false }));
    expect(s.highestWave).toBe(8);
    expect(s.runsCompleted).toBe(1);
    expect(s.runsFailed).toBe(1);
    expect(s.lifetimeKills).toBe(20);
    expect(favoriteTower(s)).toBe('needle'); // 3 + 3 needles, the most-built
  });

  it('migrates a pre-stats (v2) save by filling a zeroed stats block', () => {
    const v2 = { ...defaultSave() } as Record<string, unknown>;
    delete v2.stats; // simulate an old save that predates v3
    v2.shards = 250;
    const r = parseImport(JSON.stringify(v2));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.shards).toBe(250); // existing progress preserved
      expect(r.data.stats).toBeDefined(); // gained the new block
      expect(r.data.stats.lifetimeKills).toBe(0);
      expect(r.data.stats.killsByEnemy.runner).toBe(0);
    }
  });
});
