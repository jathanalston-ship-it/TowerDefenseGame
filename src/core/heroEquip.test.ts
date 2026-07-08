// Per-hero equipment application in the deterministic core (HEROES.md hero slots).
// Proves a hero's gear folds into THAT hero only — never another fielded hero's stats —
// and that a gear-less roster is byte-identical to omitting heroEquip (golden-safe).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { HERO_DEFS, HERO_ORDER } from './config';
import { teamSetEffects, rollItem, itemDef } from './equipment';
import { Rng } from './rng';
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

// The battlefield half of equipment: item bases AND SET BONUSES that are tower/economy-scoped must
// reach the shared run mods the towers/economy read — a hero's gear is NOT purely self-buffing. This
// is what makes SET bonuses work at all (every SETS bonus is a tower/economy field), and it must hold
// with a full multi-hero roster (each geared hero contributes; the sim matches the Power product).
describe('equipment scope — global gear + set bonuses reach the board (multi-hero)', () => {
  const [h1, h2] = HERO_ORDER;

  it('a hero’s GLOBAL-scoped gear folds into the shared mods the towers/economy read', () => {
    const g = new Game(1, NO_META, undefined, h1, undefined, {
      heroEquip: { [h1]: [
        { op: 'add', field: 'needleExtraProjectiles', value: 2 }, // tower field (towers read this.mods)
        { op: 'mul', field: 'reactorBiomassMult', value: 1.5 },   // economy field
      ] },
    });
    expect(g.mods.needleExtraProjectiles).toBe(2); // reaches the battlefield — no longer dead
    expect(g.mods.reactorBiomassMult).toBeCloseTo(1.5);
  });

  it('a SET bonus (2× Apex → +fractureBonusStacks) reaches the board via the team setEffects channel', () => {
    const rng = (() => { const r = new Rng(7); return () => r.next(); })();
    const weapon = rollItem(rng, itemDef('w_quill')!, 'common'); // set 'apex'
    const armor = rollItem(rng, itemDef('a_chitin')!, 'common'); // set 'apex' → 2 pooled pieces = bonus2
    // Set bonuses no longer ride per-hero loadoutEffects — they pool team-wide and fold once via setEffects.
    const setEffects = teamSetEffects([weapon, armor], [{ weapon: weapon.uid, armor: armor.uid, relic: null }]);
    const base = new Game(1, NO_META, undefined, h1);
    const geared = new Game(1, NO_META, undefined, h1, undefined, { setEffects });
    // the apex 2-piece bonus (+1 fractureBonusStacks, a global field) lands on the shared board
    expect(geared.mods.fractureBonusStacks).toBe(base.mods.fractureBonusStacks + 1);
  });

  it('global gear STACKS across the fielded roster (each geared hero contributes to the board)', () => {
    const g = new Game(1, NO_META, undefined, h1, undefined, {
      heroRoster: [h1, h2],
      heroEquip: {
        [h1]: [{ op: 'add', field: 'needleExtraProjectiles', value: 1 }],
        [h2]: [{ op: 'add', field: 'needleExtraProjectiles', value: 1 }],
      },
    });
    expect(g.mods.needleExtraProjectiles).toBe(2); // both heroes' tower gear stacks (matches the Power product)
  });

  it('HERO-scoped gear stays private — applied to that hero, never the shared board', () => {
    const g = new Game(1, NO_META, undefined, h1, undefined, {
      heroRoster: [h1, h2],
      heroEquip: { [h1]: [{ op: 'mul', field: 'heroMaxHpMult', value: 2 }] },
    });
    expect(g.heroes[0].maxHp).toBeCloseTo(HERO_DEFS[h1].maxHp * 2); // h1 gets it
    expect(g.heroes[1].maxHp).toBeCloseTo(HERO_DEFS[h2].maxHp);     // h2 untouched
    expect(g.mods.heroMaxHpMult).toBe(1); // …and it never leaks into the shared/global bucket
  });
});
