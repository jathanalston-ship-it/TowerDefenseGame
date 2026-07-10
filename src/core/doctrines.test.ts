import { describe, it, expect } from 'vitest';
import {
  DOCTRINES, DOCTRINE_IDS, DOCTRINE_RANK_MAX, doctrineNextRank, doctrineRank, doctrineRankBonus,
  doctrineRegistry, resolveDoctrine,
} from './doctrines';
import { doctrineEconomy } from './difficultyDirector';
import { isDoctrineUnlocked } from '../save/derive';
import { defaultSave } from '../save/saveStore';
import { simulateBattle } from './simharness';

describe('doctrines (exclusive run-start commitments)', () => {
  it("'none' is the default and contributes no effects (golden-safe)", () => {
    expect(resolveDoctrine(undefined)).toBe(DOCTRINES.none);
    expect(resolveDoctrine('none').effects).toEqual([]);
    expect(resolveDoctrine('does-not-exist')).toBe(DOCTRINES.none);
    expect(DOCTRINE_IDS).toContain('none');
  });

  it('every doctrine validates and carries a name + blurb + icon + family + gate', () => {
    expect(doctrineRegistry.validate()).toEqual([]);
    for (const d of Object.values(DOCTRINES)) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.blurb.length).toBeGreaterThan(0);
      expect(d.icon.length).toBeGreaterThan(0);
      expect(['build', 'protocol', 'pact']).toContain(d.family);
      expect(d.unlockStage).toBeGreaterThanOrEqual(0);
    }
    expect(DOCTRINES.none.unlockStage).toBe(0); // playing free is never gated
  });

  it('family capability contracts hold: protocols warp the world, pacts pay both sides', () => {
    for (const d of Object.values(DOCTRINES)) {
      if (d.family === 'protocol') expect(d.warp, d.id).toBeTruthy();
      if (d.family === 'pact') {
        expect(d.warp, d.id).toBeTruthy();
        expect(d.effects.length, d.id).toBeGreaterThan(0);
      }
      if (d.family === 'build') expect(d.warp, d.id).toBeUndefined(); // builds never touch the world
    }
  });

  it('the roster grew to a real strategic axis (19 pickable commitments)', () => {
    expect(DOCTRINE_IDS.length).toBeGreaterThanOrEqual(20); // incl. 'none'
    for (const id of ['overclock', 'bastion', 'vanguard', 'famine', 'velocity', 'overmind', 'bloodpact', 'predator']) {
      expect(DOCTRINES[id], id).toBeTruthy();
    }
  });

  it("the 'none' doctrine run matches the default run exactly (identity)", () => {
    const base = simulateBattle({ seed: 7, maxWaves: 6 });
    const none = simulateBattle({ seed: 7, maxWaves: 6, doctrine: 'none' });
    expect(none).toEqual(base);
  });

  it('committing to a doctrine reshapes the run', () => {
    const base = simulateBattle({ seed: 7, maxWaves: 6 });
    for (const id of ['glasscannon', 'swarm', 'minimalist', 'resonance']) {
      expect(simulateBattle({ seed: 7, maxWaves: 6, doctrine: id })).not.toEqual(base);
    }
  });

  it('Resonance amplifies same-class towers + a varied board (more tower damage)', () => {
    // Default strategy fields the Kinetic Ravager + needle (Kinetic), mortar, reactor — so
    // resonance (same-class boost) and diversity (3 classes) both pay off. Summed across seeds
    // so per-run gene-card draft variance cancels and the doctrine's signal is what's measured.
    let base = 0;
    let reso = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      base += simulateBattle({ seed, maxWaves: 6 }).totalTowerDamage;
      reso += simulateBattle({ seed, maxWaves: 6, doctrine: 'resonance' }).totalTowerDamage;
    }
    expect(reso).toBeGreaterThan(base);
  });
});

describe('protocol doctrines (enemy-world warps)', () => {
  it('every protocol declares a warp and the identity stays clean', () => {
    for (const id of ['adaptive', 'swarmprotocol', 'titan', 'frenzy', 'mutation', 'corrupted']) {
      expect(DOCTRINES[id].warp, id).toBeTruthy();
    }
    expect(DOCTRINES.none.warp).toBeUndefined(); // the golden run never touches the warp path
  });

  it('Swarm Protocol floods the field; Titan Protocol thins it (same seed)', () => {
    const base = simulateBattle({ seed: 11, maxWaves: 5 });
    const swarm = simulateBattle({ seed: 11, maxWaves: 5, doctrine: 'swarmprotocol' });
    const titan = simulateBattle({ seed: 11, maxWaves: 5, doctrine: 'titan' });
    expect(swarm.enemiesSpawned).toBeGreaterThan(base.enemiesSpawned * 1.3); // ×1.8 target, RNG-thinned tolerance
    expect(titan.enemiesSpawned).toBeLessThan(base.enemiesSpawned * 0.75); // ×0.45 target
  });

  it('warped runs are deterministic (same seed + doctrine ⇒ identical report)', () => {
    const a = simulateBattle({ seed: 23, maxWaves: 4, doctrine: 'corrupted' });
    const b = simulateBattle({ seed: 23, maxWaves: 4, doctrine: 'corrupted' });
    expect(a).toEqual(b);
  });

  it('the NEW protocols reshape the run and stay deterministic', () => {
    const base = simulateBattle({ seed: 31, maxWaves: 5 });
    const velocity = simulateBattle({ seed: 31, maxWaves: 5, doctrine: 'velocity' });
    expect(velocity.enemiesSpawned).toBeLessThan(base.enemiesSpawned); // ×0.8 thins the queue
    expect(simulateBattle({ seed: 31, maxWaves: 5, doctrine: 'velocity' })).toEqual(velocity);
    const famine = simulateBattle({ seed: 31, maxWaves: 5, doctrine: 'famine' });
    expect(famine).not.toEqual(base); // the bounty drought changes the run's economy
    expect(simulateBattle({ seed: 31, maxWaves: 5, doctrine: 'famine' })).toEqual(famine);
    const pact = simulateBattle({ seed: 31, maxWaves: 5, doctrine: 'bloodpact' });
    expect(pact).not.toEqual(base); // both sides of the pact land (effects + warp)
    expect(simulateBattle({ seed: 31, maxWaves: 5, doctrine: 'bloodpact' })).toEqual(pact);
  });
});

describe('doctrine gates (docs/DOCTRINES.md §gates — anticipation, not absence)', () => {
  it('a fresh account gets the day-one doctrines; deep campaign unseals everything', () => {
    const fresh = defaultSave();
    expect(isDoctrineUnlocked(fresh, DOCTRINES.none)).toBe(true);
    expect(isDoctrineUnlocked(fresh, DOCTRINES.glasscannon)).toBe(true);
    expect(isDoctrineUnlocked(fresh, DOCTRINES.titan)).toBe(false);
    expect(isDoctrineUnlocked(fresh, DOCTRINES.overmind)).toBe(false);
    const deep = defaultSave();
    deep.campaign.cleared.standard = 30;
    for (const id of DOCTRINE_IDS) expect(isDoctrineUnlocked(deep, DOCTRINES[id]), id).toBe(true);
  });

  it('accounts that already RAN a doctrine are grandfathered past its gate', () => {
    const s = defaultSave();
    s.stats.doctrineRuns.titan = 3; // used before the gate existed
    expect(isDoctrineUnlocked(s, DOCTRINES.titan)).toBe(true);
  });

  it('every gate sits inside the campaign progression band (reachable, staged)', () => {
    for (const d of Object.values(DOCTRINES)) {
      expect(d.unlockStage).toBeLessThanOrEqual(30); // nothing gated past the graduate exam
    }
    // The drip is real: some day-one, some early, some deep.
    const stages = Object.values(DOCTRINES).map((d) => d.unlockStage);
    expect(stages.filter((s) => s === 0).length).toBeGreaterThanOrEqual(2);
    expect(stages.filter((s) => s >= 20).length).toBeGreaterThanOrEqual(3);
  });
});

describe('doctrine mastery ranks (commitment pays)', () => {
  it('ranks derive from wins OR depth — whichever signal is further', () => {
    expect(doctrineRank('titan', 0, 0)).toBe(0);
    expect(doctrineRank('titan', 1, 0)).toBe(1); // first win
    expect(doctrineRank('titan', 0, 12)).toBe(1); // …or wave 12
    expect(doctrineRank('titan', 3, 0)).toBe(2);
    expect(doctrineRank('titan', 0, 50)).toBe(4);
    expect(doctrineRank('titan', 99, 999)).toBe(DOCTRINE_RANK_MAX);
    expect(doctrineRank('none', 99, 999)).toBe(0); // no commitment, no rank
  });

  it('rank pays a small run-end premium on the doctrine lane (identity at rank 0)', () => {
    expect(doctrineRankBonus(0)).toBe(1);
    expect(doctrineRankBonus(4)).toBeCloseTo(1.16, 10);
    expect(doctrineEconomy('corrupted').rewardMult).toBe(1.5); // rank omitted ⇒ unchanged policy
    expect(doctrineEconomy('corrupted', 2).rewardMult).toBeCloseTo(1.5 * 1.08, 10);
    expect(doctrineEconomy('corrupted', 2).essenceFor(20)).toBe(60); // essence is rank-free
  });

  it('next-rank hints exist until max rank', () => {
    expect(doctrineNextRank(0)).toEqual({ wins: 1, wave: 12 });
    expect(doctrineNextRank(DOCTRINE_RANK_MAX)).toBeNull();
  });
});
