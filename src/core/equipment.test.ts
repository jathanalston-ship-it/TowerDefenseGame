import { describe, it, expect } from 'vitest';
import { Rng } from './rng';
import {
  ALL_ITEMS,
  RARITY_AFFIXES,
  WEAPONS,
  itemDef,
  itemEffects,
  loadoutEffects,
  rerollAffixes,
  rollItem,
  transmute,
} from './equipment';

const mk = (seed: number): (() => number) => {
  const r = new Rng(seed);
  return () => r.next();
};

describe('equipment', () => {
  it('catalog has unique ids and ~20 weapons', () => {
    const ids = ALL_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(WEAPONS.length).toBeGreaterThanOrEqual(18);
  });

  it('rollItem rolls the affix count for the rarity', () => {
    const it = rollItem(mk(1), WEAPONS[0], 'epic');
    expect(it.affixes.length).toBe(RARITY_AFFIXES.epic);
  });

  it('exotic definitions force exotic rarity', () => {
    const exo = WEAPONS.find((w) => w.exotic)!;
    expect(rollItem(mk(2), exo, 'common').rarity).toBe('exotic');
  });

  it('itemEffects carries the base behavior (behavior-first)', () => {
    const it = rollItem(mk(3), itemDef('w_quill')!, 'common');
    const eff = itemEffects(it);
    expect(eff.some((e) => (e.op === 'add' || e.op === 'mul') && e.field === 'needleExtraProjectiles')).toBe(true);
  });

  it('an empty loadout contributes no effects (gear-less run stays identity)', () => {
    expect(loadoutEffects([], { weapon: null, armor: null, relic: null })).toEqual([]);
  });

  it('a 2-piece set adds its bonus on top of the items', () => {
    const r = mk(4);
    const a = rollItem(r, itemDef('w_quill')!, 'common'); // set 'apex'
    const b = rollItem(r, itemDef('a_chitin')!, 'common'); // set 'apex'
    const eff = loadoutEffects([a, b], { weapon: a.uid, armor: b.uid, relic: null });
    // apex 2-piece grants +1 fracture stack
    expect(eff.some((e) => e.op === 'add' && e.field === 'fractureBonusStacks')).toBe(true);
  });

  it('reroll keeps the affix count; transmute raises rarity + adds an affix', () => {
    const r = mk(5);
    const it = rollItem(r, WEAPONS[1], 'rare');
    expect(rerollAffixes(r, it).affixes.length).toBe(RARITY_AFFIXES.rare);
    const t = transmute(r, it)!;
    expect(t.rarity).toBe('epic');
    expect(t.affixes.length).toBe(RARITY_AFFIXES.epic);
  });
});
