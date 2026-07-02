import { describe, it, expect } from 'vitest';
import { DOCTRINES, DOCTRINE_IDS, doctrineRegistry, resolveDoctrine } from './doctrines';
import { simulateBattle } from './simharness';

describe('doctrines (exclusive run-start commitments)', () => {
  it("'none' is the default and contributes no effects (golden-safe)", () => {
    expect(resolveDoctrine(undefined)).toBe(DOCTRINES.none);
    expect(resolveDoctrine('none').effects).toEqual([]);
    expect(resolveDoctrine('does-not-exist')).toBe(DOCTRINES.none);
    expect(DOCTRINE_IDS).toContain('none');
  });

  it('every doctrine validates and carries a name + blurb', () => {
    expect(doctrineRegistry.validate()).toEqual([]);
    for (const d of Object.values(DOCTRINES)) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.blurb.length).toBeGreaterThan(0);
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
});
