// Tower-slot PROGRESSION (docs/SLOTS.md): the 27 emplacements are a symmetric, centre-out
// lattice; the available count grows from SLOTS.initialUnlocked through permanent (Shard) and
// temporary (gene-card) unlocks, each capped, never exceeding the 27 physical slots. Pins the
// geometry (symmetry + total) and the Game's unlock arithmetic (permanent + temporary + caps).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { towerSlots, WIDTH, type TowerSlot } from './map';
import { SLOTS } from './config';
import { CARD_POOL, applyCard, defaultRunModifiers } from './cards';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const meta = (bonusSlots: number): MetaModifiers => ({ ...NO_META, bonusSlots });

/** A slot's horizontal distance from the Hive Core (board centre). */
const absDx = (s: TowerSlot): number => Math.abs(s.x - WIDTH / 2);
/** Is a slot set mirror-symmetric about the core's x? (multiset of x == multiset of 720−x). */
function xSymmetric(slots: TowerSlot[]): boolean {
  const xs = slots.map((s) => s.x).sort((a, b) => a - b);
  const mirror = slots.map((s) => WIDTH - s.x).sort((a, b) => a - b);
  return xs.length === mirror.length && xs.every((x, i) => x === mirror[i]);
}

describe('tower-slot geometry (symmetric, centre-out)', () => {
  it('emits exactly the configured 27 slots, with contiguous unlock-priority indices', () => {
    expect(towerSlots.length).toBe(27);
    expect(SLOTS.permanentMax + SLOTS.tempMax).toBe(towerSlots.length); // 21 + 6 === 27
    expect(towerSlots.map((s) => s.index)).toEqual([...Array(27).keys()]); // 0..26, in order
  });

  it('has no two slots sharing a cell', () => {
    const cells = new Set(towerSlots.map((s) => `${s.col},${s.row}`));
    expect(cells.size).toBe(towerSlots.length);
  });

  it('is mirror-symmetric about the Hive Core at every tier boundary (no side favoured)', () => {
    const initial = towerSlots.slice(0, SLOTS.initialUnlocked); // 15
    const permanent = towerSlots.slice(0, SLOTS.permanentMax); // 21
    expect(xSymmetric(initial)).toBe(true);
    expect(xSymmetric(permanent)).toBe(true);
    expect(xSymmetric(towerSlots)).toBe(true); // full 27
  });

  it('unlocks centre-out: each tier reaches no wider than the next', () => {
    const widest = (lo: number, hi: number) => Math.max(...towerSlots.slice(lo, hi).map(absDx));
    const initial = widest(0, SLOTS.initialUnlocked); // centre 5 columns
    const permRing = widest(SLOTS.initialUnlocked, SLOTS.permanentMax); // the permanent ring
    const tempRing = widest(SLOTS.permanentMax, towerSlots.length); // the outer temp ring
    expect(initial).toBeLessThan(permRing);
    expect(permRing).toBeLessThan(tempRing);
    expect(towerSlots[0].x).toBe(WIDTH / 2); // the very first slot sits on the core's column
  });
});

describe('tower-slot progression (Game.unlockedSlots)', () => {
  it('starts at SLOTS.initialUnlocked with no meta', () => {
    expect(new Game(1, NO_META).unlockedSlots).toBe(SLOTS.initialUnlocked);
  });

  it('permanent Shard unlocks raise the base, capped at SLOTS.permanentMax', () => {
    expect(new Game(1, meta(1)).unlockedSlots).toBe(SLOTS.initialUnlocked + 1);
    expect(new Game(1, meta(6)).unlockedSlots).toBe(SLOTS.permanentMax); // 15 + 6 = 21
    expect(new Game(1, meta(99)).unlockedSlots).toBe(SLOTS.permanentMax); // over-cap clamps
  });

  it('temporary (gene-card) unlocks add on top, capped at SLOTS.tempMax', () => {
    const g = new Game(1, NO_META);
    g.unlockSlots(1);
    expect(g.unlockedSlots).toBe(SLOTS.initialUnlocked + 1);
    g.unlockSlots(99); // far past the temp cap
    expect(g.unlockedSlots).toBe(SLOTS.initialUnlocked + SLOTS.tempMax); // 15 + 6 = 21
  });

  it('permanent + temporary together reach — but never exceed — all 27 slots', () => {
    const g = new Game(1, meta(SLOTS.permanentMax - SLOTS.initialUnlocked)); // permanent maxed (21)
    g.unlockSlots(SLOTS.tempMax); // + all temp (6)
    expect(g.unlockedSlots).toBe(towerSlots.length); // 27
    g.unlockSlots(10); // any further grant is absorbed by the caps
    expect(g.unlockedSlots).toBe(towerSlots.length);
  });

  it('the unlock gate is honoured by placeTower (a locked slot rejects, an unlocked one accepts)', () => {
    const g = new Game(1, NO_META);
    g.debugAddBiomass(10000);
    const locked = towerSlots[SLOTS.initialUnlocked]; // index 15 — first slot past the initial set
    expect(g.placeTower('needle', locked.x, locked.y)).toBe(false); // still locked
    g.unlockSlots(1); // one temporary slot → index 15 now available
    expect(g.placeTower('needle', locked.x, locked.y)).toBe(true);
  });
});

describe('Reclaimed Node gene card (temporary slot source)', () => {
  it('exists in the pool and adds one temporary tower slot per copy', () => {
    const card = CARD_POOL.find((c) => c.id === 'reclaimed_node');
    expect(card).toBeDefined();
    const mods = defaultRunModifiers();
    expect(mods.bonusTowerSlots).toBe(0); // neutral by default (golden-safe)
    const ctx = { mods, grantBiomass: () => {}, grantIntegrity: () => {}, healHero: () => {} };
    applyCard(card!, ctx);
    applyCard(card!, ctx);
    expect(mods.bonusTowerSlots).toBe(2); // two copies → two temporary slots
  });
});
