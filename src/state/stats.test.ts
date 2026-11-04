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
    integrityLost: 0,
    killsByEnemy: { ...defaultLifetimeStats().killsByEnemy, runner: 6, brute: 2, rusher: 1, flyer: 1 },
    towerBuilds: { needle: 3, mortar: 1, reactor: 0, parasite: 0, obelisk: 0, maw: 0, chrysalis: 0, effigy: 0, coil: 0, siphon: 0, sower: 0, spire: 0, polyp: 0, spitfang: 0, rift: 0, glaive: 0, roost: 0, lung: 0, bell: 0, lancet: 0, basilisk: 0, ossuary: 0 },
    cardIds: ['twin_fang', 'twin_fang', 'venom_sacs'],
    heroId: 'ravager',
    ...over,
  };
}

describe('lifetime statistics', () => {
  it('books only REAL Brood Tyrants in the bestiary — boss kills ride the tyrant render proxy', () => {
    const base = defaultLifetimeStats();
    // A run that slew two framework bosses (booked as 'tyrant') and one real Brood Tyrant.
    const s = accumulateStats(base, run({ killsByEnemy: { ...base.killsByEnemy, tyrant: 3 }, bossKills: 2 }));
    expect(s.killsByEnemy.tyrant).toBe(1);
    // Never negative, even if a run's proxy count and boss count disagree.
    expect(accumulateStats(base, run({ killsByEnemy: { ...base.killsByEnemy, tyrant: 0 }, bossKills: 2 })).killsByEnemy.tyrant).toBe(0);
  });
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

  it('folds the strain ledgers: deepest-ever, lifetime evolutions, per-kind bests', () => {
    let s = accumulateStats(defaultLifetimeStats(), run({ maxStrain: 3, strains: 2, strainByKind: { needle: 3, mortar: 2 } }));
    expect(s.bestStrain).toBe(3);
    expect(s.strainsEvolved).toBe(2);
    expect(s.towerBestStrain.needle).toBe(3);
    expect(s.towerBestStrain.mortar).toBe(2);
    expect(s.towerBestStrain.reactor).toBe(0); // never past I → untouched
    // a shallower later run never regresses the bests, but evolutions keep counting
    s = accumulateStats(s, run({ maxStrain: 2, strains: 1, strainByKind: { needle: 2 } }));
    expect(s.bestStrain).toBe(3);
    expect(s.strainsEvolved).toBe(3);
    expect(s.towerBestStrain.needle).toBe(3);
    // a strain-free run (old fixture shape — fields absent) is a no-op on the ledgers
    s = accumulateStats(s, run());
    expect(s.bestStrain).toBe(3);
    expect(s.strainsEvolved).toBe(3);
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

  it('deepens the per-tower ledger from the run mastery accrual (schema v20)', () => {
    const combat = {
      needle: { kills: 6, damage: 1500.7, activeTime: 40 },
      mortar: { kills: 4, damage: 480.2, activeTime: 22 },
      reactor: { kills: 0, damage: 0, activeTime: 0 },
      parasite: { kills: 0, damage: 0, activeTime: 0 },
      obelisk: { kills: 0, damage: 0, activeTime: 0 },
      maw: { kills: 0, damage: 0, activeTime: 0 },
      chrysalis: { kills: 0, damage: 0, activeTime: 0 },
      effigy: { kills: 0, damage: 0, activeTime: 0 },
      coil: { kills: 0, damage: 0, activeTime: 0 },
      siphon: { kills: 0, damage: 0, activeTime: 0 },
      sower: { kills: 0, damage: 0, activeTime: 0 },
      spire: { kills: 0, damage: 0, activeTime: 0 },
      polyp: { kills: 0, damage: 0, activeTime: 0 },
      spitfang: { kills: 0, damage: 0, activeTime: 0 },
      rift: { kills: 0, damage: 0, activeTime: 0 },
      glaive: { kills: 0, damage: 0, activeTime: 0 },
      roost: { kills: 0, damage: 0, activeTime: 0 },
      lung: { kills: 0, damage: 0, activeTime: 0 },
      bell: { kills: 0, damage: 0, activeTime: 0 },
      lancet: { kills: 0, damage: 0, activeTime: 0 },
      basilisk: { kills: 0, damage: 0, activeTime: 0 },
      ossuary: { kills: 0, damage: 0, activeTime: 0 },
    };
    let s = accumulateStats(defaultLifetimeStats(), run({ wave: 9 }), combat);
    expect(s.towerDamage.needle).toBe(1501); // rounded
    expect(s.towerDamage.mortar).toBe(480);
    expect(s.towerBestWave.needle).toBe(9); // deployed → the run wave counts
    expect(s.towerBestWave.reactor).toBe(0); // never fielded → untouched
    s = accumulateStats(s, run({ wave: 4 }), combat);
    expect(s.towerDamage.needle).toBe(3002);
    expect(s.towerBestWave.needle).toBe(9); // a shallower run never lowers the best
  });

  it('migrates a pre-v20 stats block by zero-filling the per-tower ledgers', () => {
    const old = defaultLifetimeStats() as unknown as Record<string, unknown>;
    delete old.towerDamage;
    delete old.towerBestWave;
    const blob = { ...defaultSave(), stats: old as unknown as ReturnType<typeof defaultLifetimeStats> };
    const r = parseImport(JSON.stringify(blob));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.stats.towerDamage.needle).toBe(0);
      expect(r.data.stats.towerBestWave.mortar).toBe(0);
    }
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

  it('folds the doctrine MASTERY ledgers: runs, wins, deepest wave (docs/DOCTRINES.md)', () => {
    let s = accumulateStats(defaultLifetimeStats(), run({ wave: 9, won: true }), undefined, { doctrine: 'titan' });
    expect(s.doctrineRuns.titan).toBe(1);
    expect(s.doctrineWins.titan).toBe(1);
    expect(s.doctrineBestWave.titan).toBe(9);
    s = accumulateStats(s, run({ wave: 22, won: false }), undefined, { doctrine: 'titan' });
    expect(s.doctrineRuns.titan).toBe(2);
    expect(s.doctrineWins.titan).toBe(1); // losses never advance wins
    expect(s.doctrineBestWave.titan).toBe(22); // …but depth still counts
    s = accumulateStats(s, run({ wave: 50, won: true }), undefined, { doctrine: 'none' });
    expect(s.doctrineRuns.none).toBeUndefined(); // 'none' is not a commitment — never ledgered
    expect(s.doctrineWins.none).toBeUndefined();
  });
});
