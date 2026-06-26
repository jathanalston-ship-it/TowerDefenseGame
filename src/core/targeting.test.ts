import { describe, it, expect } from 'vitest';
import { sortByProfile } from './targeting';
import type { TargetingCtx } from './targeting';
import type { Enemy } from './types';

function E(p: Partial<Enemy>): Enemy {
  return {
    id: 0, kind: 'runner', x: 0, y: 0, hp: 100, maxHp: 100, baseArmor: 0, speed: 50, bounty: 0, damage: 0,
    fracture: 0, corrosion: 0, infection: 0, disrupt: 0, shredFlash: 0, hitFlash: 0, dmgAccum: 0, dmgTimer: 0,
    alive: true, lastHitKind: null, boss: null, elite: false, ...p,
  } as Enemy;
}

// goalDistance proxy: deeper-down (higher y) = closer to the base ⇒ smaller goal distance.
const ctx: TargetingCtx = { tx: 0, ty: 0, goalDistance: (_x, y) => 1000 - y, rng: () => 0.5 };
const ids = (l: Enemy[]): number[] => l.map((e) => e.id);

describe('targeting profiles', () => {
  it("default 'closestToBase' orders by goal distance (historical behavior)", () => {
    const list = [E({ id: 1, y: 30 }), E({ id: 2, y: 10 }), E({ id: 3, y: 20 })];
    sortByProfile(list, 'closestToBase', ctx);
    expect(ids(list)).toEqual([1, 3, 2]); // y 30 (deepest) first
  });

  it('nearest / farthest order by distance to the tower', () => {
    const list = [E({ id: 1, x: 30 }), E({ id: 2, x: 10 }), E({ id: 3, x: 20 })];
    sortByProfile(list, 'nearest', ctx);
    expect(ids(list)).toEqual([2, 3, 1]);
    sortByProfile(list, 'farthest', ctx);
    expect(ids(list)).toEqual([1, 3, 2]);
  });

  it('highest / lowest health', () => {
    const list = [E({ id: 1, hp: 50 }), E({ id: 2, hp: 200 }), E({ id: 3, hp: 100 })];
    sortByProfile(list, 'highestHealth', ctx);
    expect(ids(list)).toEqual([2, 3, 1]);
    sortByProfile(list, 'lowestHealth', ctx);
    expect(ids(list)).toEqual([1, 3, 2]);
  });

  it('boss / elite priority float to the front', () => {
    const list = [E({ id: 1, y: 99 }), E({ id: 2, boss: { defId: 'x' } as Enemy['boss'] }), E({ id: 3, elite: true })];
    sortByProfile(list, 'bossPriority', ctx);
    expect(list[0].id).toBe(2);
    sortByProfile(list, 'elitePriority', ctx);
    expect(list[0].id).toBe(3);
  });

  it('fastest + mostCorrupted', () => {
    const a = E({ id: 1, speed: 30, corrosion: 1 });
    const b = E({ id: 2, speed: 90, infection: 3, disrupt: 2 });
    sortByProfile([a, b], 'fastest', ctx);
    const f = [a, b];
    sortByProfile(f, 'fastest', ctx);
    expect(f[0].id).toBe(2);
    const c = [a, b];
    sortByProfile(c, 'mostCorrupted', ctx);
    expect(c[0].id).toBe(2);
  });

  it("'random' is deterministic for a fixed rng sequence", () => {
    const seq = [0.9, 0.1, 0.5];
    let i = 0;
    const rng = (): number => seq[i++ % seq.length];
    const list = [E({ id: 1 }), E({ id: 2 }), E({ id: 3 })];
    sortByProfile(list, 'random', { ...ctx, rng });
    expect(ids(list)).toEqual([2, 3, 1]); // keys 0.9,0.1,0.5 → ascending → id2(0.1),id3(0.5),id1(0.9)
  });
});
