import { describe, it, expect } from 'vitest';
import { itemPowerScore, compareItemPower } from './itemPower';
import { defaultSave } from '../save/saveStore';
import { rollItem, itemsForSlot, emptyLoadout } from '../core/equipment';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe('equipment Power Score comparison', () => {
  const weaponDef = itemsForSlot('weapon').find((d) => !d.exotic)!;
  const rng = mulberry32(7);
  const weak = rollItem(rng, weaponDef, 'common');
  const strong = rollItem(rng, weaponDef, 'legendary');

  it('a legendary reads as more Power than a common of the same slot', () => {
    expect(itemPowerScore(strong)).toBeGreaterThan(itemPowerScore(weak));
  });

  it('▼ worse: a weaker candidate vs the equipped slot', () => {
    const base = defaultSave();
    const save = { ...base, equipment: { inventory: [weak, strong], loadouts: { ...base.equipment.loadouts, ravager: { ...emptyLoadout(), weapon: strong.uid } } } };
    const c = compareItemPower(save, weak, 'ravager');
    expect(c.verdict).toBe('worse');
    expect(c.delta).toBeLessThan(0);
    expect(c.equippedName).toBeTruthy();
  });

  it('= same: an equal-power candidate vs the equipped slot', () => {
    const clone = { ...strong, uid: 'clone-strong' }; // identical def/rarity/affixes ⇒ identical power
    const base = defaultSave();
    const save = { ...base, equipment: { inventory: [strong, clone], loadouts: { ...base.equipment.loadouts, ravager: { ...emptyLoadout(), weapon: strong.uid } } } };
    const c = compareItemPower(save, clone, 'ravager');
    expect(c.verdict).toBe('same');
    expect(c.delta).toBe(0);
  });

  it('▲ better: any item vs an empty slot compares against nothing', () => {
    const base = defaultSave();
    const save = { ...base, equipment: { inventory: [strong], loadouts: { ...base.equipment.loadouts, ravager: emptyLoadout() } } };
    const c = compareItemPower(save, strong, 'ravager');
    expect(c.equippedName).toBeNull();
    expect(c.equipped).toBe(0);
    expect(c.delta).toBe(itemPowerScore(strong));
    expect(c.verdict).toBe(itemPowerScore(strong) > 0 ? 'better' : 'same');
  });
});
