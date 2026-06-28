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
