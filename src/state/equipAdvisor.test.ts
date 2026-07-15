// Equip advisor (docs/POWER-SCORE.md §atlas) — exact free-gear upgrades: deltas match the real
// scorer, worn items are never suggested, downgrades are filtered, best-gain ranks first.

import { describe, expect, it } from 'vitest';
import { equipAllPlan, equipUpgrades } from './equipAdvisor';
import { powerBreakdown } from './profile';
import { defaultSave } from '../save/saveStore';
import { fieldedLoadout } from './meta';
import type { OwnedItem } from '../core/equipment';

const item = (uid: string, defId: string, rarity: OwnedItem['rarity']): OwnedItem =>
  ({ uid, defId, rarity, affixes: [] });

describe('equipUpgrades', () => {
  it('empty slot: the strongest free candidate is picked with the EXACT scorer delta', () => {
    const s = defaultSave();
    s.equipment.inventory = [item('u1', 'w_quill', 'common'), item('u2', 'w_marrow', 'legendary')];
    const picks = equipUpgrades(s);
    expect(picks.length).toBeGreaterThan(0);
    const p = picks[0];
    expect(p.uid).toBe('u2'); // the legendary out-prefilters the common
    expect(p.slot).toBe('weapon');
    expect(p.replaces).toBeNull();
    const hero = p.hero;
    const base = powerBreakdown(s).score;
    const after = powerBreakdown({
      ...s,
      equipment: { ...s.equipment, loadouts: { ...s.equipment.loadouts, [hero]: { weapon: 'u2', armor: null, relic: null } } },
    }).score;
    expect(p.powerDelta).toBe(Math.max(0, Math.round(after - base)));
  });

  it('worn items are never candidates; strict downgrades are filtered out', () => {
    const s = defaultSave();
    const hero = fieldedLoadout(s)[0];
    s.equipment.inventory = [item('worn', 'w_marrow', 'legendary'), item('weak', 'w_quill', 'common')];
    s.equipment.loadouts[hero] = { weapon: 'worn', armor: null, relic: null };
    const weaponPicks = equipUpgrades(s).filter((p) => p.slot === 'weapon');
    // The only free weapon is strictly worse than the worn legendary — no weapon pick at all.
    expect(weaponPicks).toEqual([]);
  });

  it('a replacement names what it replaces and ranks by exact gain (empty save ⇒ [])', () => {
    const s = defaultSave();
    const hero = fieldedLoadout(s)[0];
    s.equipment.inventory = [
      item('worn', 'w_quill', 'common'),
      item('up', 'w_marrow', 'legendary'),
      item('vest', 'a_chitin', 'rare'),
    ];
    s.equipment.loadouts[hero] = { weapon: 'worn', armor: null, relic: null };
    const picks = equipUpgrades(s);
    const weapon = picks.find((p) => p.slot === 'weapon')!;
    expect(weapon.uid).toBe('up');
    expect(weapon.replaces).toBe('Quill Launcher');
    const armor = picks.find((p) => p.slot === 'armor')!;
    expect(armor.uid).toBe('vest');
    // Sorted best-gain first.
    for (let i = 1; i < picks.length; i++) expect(picks[i - 1].powerDelta).toBeGreaterThanOrEqual(picks[i].powerDelta);
    expect(equipUpgrades(defaultSave())).toEqual([]);
  });
});

describe('equipAllPlan — the one-tap sweep', () => {
  it('applies every free upgrade iteratively and never claims one item twice', () => {
    const s = defaultSave();
    s.equipment.inventory = [
      item('w1', 'w_marrow', 'legendary'), item('w2', 'w_quill', 'rare'),
      item('a1', 'a_husk', 'epic'), item('r1', 'r_heart', 'rare'),
    ];
    const steps = equipAllPlan(s);
    expect(steps.length).toBeGreaterThan(0);
    const uids = steps.map((p) => p.uid);
    expect(new Set(uids).size).toBe(uids.length); // a single physical item lands on ONE seat
    const seats = steps.map((p) => `${p.hero}:${p.slot}`);
    expect(new Set(seats).size).toBe(seats.length); // and every seat is filled at most once
  });

  it('a save with no positive swaps plans nothing', () => {
    const s = defaultSave();
    expect(equipAllPlan(s)).toEqual([]);
  });
});
