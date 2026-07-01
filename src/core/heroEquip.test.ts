// Per-hero equipment application in the deterministic core (HEROES.md hero slots).
// Proves a hero's gear folds into THAT hero only — never another fielded hero's stats —
// and that a gear-less roster is byte-identical to omitting heroEquip (golden-safe).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { HERO_DEFS, HERO_ORDER } from './config';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = {
  towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0,
};

describe('per-hero equipment application', () => {
  const [h1, h2] = HERO_ORDER;

  it('folds a hero’s survivability gear into that hero’s max HP', () => {
    const baseline = new Game(1, NO_META, undefined, h1);
    const geared = new Game(1, NO_META, undefined, h1, undefined, {
      heroEquip: { [h1]: [{ op: 'mul', field: 'heroMaxHpMult', value: 2 }] },
    });
    expect(geared.heroes[0].maxHp).toBeCloseTo(baseline.heroes[0].maxHp * 2);
  });

  it('never overwrites another fielded hero’s stats — gear is strictly per-hero', () => {
    const g = new Game(1, NO_META, undefined, h1, undefined, {
      heroRoster: [h1, h2],
      heroEquip: { [h1]: [{ op: 'mul', field: 'heroMaxHpMult', value: 2 }] }, // only h1 geared
    });
    expect(g.heroes[0].maxHp).toBeCloseTo(HERO_DEFS[h1].maxHp * 2); // h1: its own gear applied
    expect(g.heroes[1].maxHp).toBeCloseTo(HERO_DEFS[h2].maxHp * 1); // h2: untouched by h1's gear
  });

  it('an empty/omitted heroEquip leaves every hero at baseline (golden-safe)', () => {
    const omitted = new Game(1, NO_META, undefined, h1, undefined, { heroRoster: [h1, h2] });
    const empty = new Game(1, NO_META, undefined, h1, undefined, { heroRoster: [h1, h2], heroEquip: {} });
    for (let i = 0; i < 2; i++) {
      expect(omitted.heroes[i].maxHp).toBe(HERO_DEFS[HERO_ORDER[i]].maxHp);
      expect(empty.heroes[i].maxHp).toBe(HERO_DEFS[HERO_ORDER[i]].maxHp);
    }
  });
});
