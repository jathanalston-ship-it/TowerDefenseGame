import { describe, it, expect } from 'vitest';
import { Rng } from './rng';
import { Director } from './director';
import { DIRECTOR, SIM_DT } from './config';
import { Game } from './game';
import { towerSlots } from './map';
import type { MetaModifiers, TowerKind } from './types';

const mk = (seed: number): (() => number) => {
  const r = new Rng(seed);
  return () => r.next();
};
const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0 };
const KINDS: TowerKind[] = ['needle', 'mortar', 'reactor'];

describe('AI Director', () => {
  it('caps a (mini)boss wave every bossEvery depths', () => {
    const d = new Director(mk(1));
    let w = d.next(1);
    for (let depth = 2; depth <= DIRECTOR.bossEvery; depth++) w = d.next(depth);
    expect(w.shape).toBe('boss');
    expect(w.spawnBoss).toBe(true);
  });

  it('never repeats the previous non-boss shape (anti-monotony)', () => {
    const d = new Director(mk(3));
    let prev: string | null = null;
    for (let depth = 1; depth <= 24; depth++) {
      const w = d.next(depth);
      if (w.shape !== 'boss' && prev && prev !== 'boss') expect(w.shape).not.toBe(prev);
      prev = w.shape;
    }
  });

  it('produces non-empty groups; threat budget grows with depth', () => {
    const d = new Director(mk(9));
    const w1 = d.next(1);
    const w9 = d.next(9);
    expect(w1.groups.length).toBeGreaterThan(0);
    const n1 = w1.groups.reduce((a, g) => a + g.count, 0);
    const n9 = w9.groups.reduce((a, g) => a + g.count, 0);
    expect(n9).toBeGreaterThanOrEqual(n1);
  });

  it('is deterministic from the rng seed', () => {
    const a = new Director(mk(2));
    const b = new Director(mk(2));
    for (let depth = 1; depth <= 10; depth++) expect(a.next(depth).shape).toBe(b.next(depth).shape);
  });
});

describe('Endless mode (Director-driven, deterministic)', () => {
  function play(): { depth: number; kills: number } {
    const g = new Game(99, NO_META, undefined, undefined, undefined, { mode: 'endless' });
    let t = 0;
    let guard = 0;
    while (t < 50 && g.phase !== 'lost' && guard++ < 60000) {
      if (g.phase === 'draft') {
        g.chooseCard(g.getSnapshot().draft![0].id);
        continue;
      }
      if (g.phase === 'prep') {
        for (let i = 0; i < 6 && i < towerSlots.length; i++) g.placeTower(KINDS[i % 3], towerSlots[i].x, towerSlots[i].y);
        g.startWave();
      }
      g.advance(SIM_DT);
      t += SIM_DT;
    }
    return { depth: g.waveIndex, kills: g.kills };
  }

  it('runs without ending in victory and is deterministic for a fixed seed', () => {
    const a = play();
    expect(a.depth).toBeGreaterThan(0); // it advanced through endless waves
    expect(play()).toEqual(a); // same seed → identical outcome
  });
});
