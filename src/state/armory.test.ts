import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import { heroDetail } from './heroView';
import { activeSets, itemScore, loadoutScore } from '../core/equipment';
import type { OwnedItem, RolledAffix } from '../core/equipment';

function item(uid: string, defId: string, rarity: OwnedItem['rarity'], affixes: RolledAffix[] = []): OwnedItem {
  return { uid, defId, rarity, affixes };
}

describe('equipment scoring', () => {
  it('scores higher rarity / affix tiers above lower', () => {
    const lo = item('a', 'w_quill', 'common');
    const hi = item('b', 'w_quill', 'legendary', [{ affixId: 'keen', tier: 6 }]);
    expect(itemScore(hi)).toBeGreaterThan(itemScore(lo));
  });
});

describe('set bonuses + loadout score', () => {
  it('activates a 2-piece set and folds its bonus into the score', () => {
    meta.reset();
    meta.grantItem(item('w1', 'w_quill', 'epic')); // apex weapon
    meta.grantItem(item('a1', 'a_chitin', 'epic')); // apex armor
    meta.equip('ravager', 'weapon', 'w1');
    meta.equip('ravager', 'armor', 'a1');
    const save = meta.get();
    const lo = meta.loadoutOf('ravager');
    const apex = activeSets(save.equipment.inventory, lo).find((s) => s.id === 'apex');
    expect(apex?.count).toBe(2);
    expect(apex?.bonus2).toBe(true);
    // Score = both items + the 2-piece set bonus, so it exceeds the bare item sum.
    const itemsSum = itemScore(save.equipment.inventory[0]) + itemScore(save.equipment.inventory[1]);
    expect(loadoutScore(save.equipment.inventory, lo)).toBeGreaterThan(itemsSum);
  });
});

describe('favorite / lock', () => {
  it('locks an item against salvage; flags persist', () => {
    meta.reset();
    meta.grantItem(item('x1', 'w_coil', 'rare'));
    meta.toggleLock('x1');
    expect(meta.get().equipment.inventory[0].locked).toBe(true);
    expect(meta.salvageItem('x1')).toBe(false); // locked → refused

    meta.toggleLock('x1'); // unlock
    meta.toggleFavorite('x1');
    expect(meta.get().equipment.inventory[0].favorite).toBe(true);
    expect(meta.salvageItem('x1')).toBe(true); // now salvages
  });
});

describe('heroDetail — equipment score + power rating', () => {
  it('rises when gear is equipped', () => {
    meta.reset();
    const base = heroDetail(meta.get(), 'ravager');
    expect(base.equipScore).toBe(0);

    meta.grantItem(item('g1', 'w_hunger', 'exotic', [{ affixId: 'keen', tier: 5 }]));
    meta.equip('ravager', 'weapon', 'g1');
    const geared = heroDetail(meta.get(), 'ravager');
    expect(geared.equipScore).toBeGreaterThan(0);
    expect(geared.powerRating).toBeGreaterThan(base.powerRating);
  });
});
