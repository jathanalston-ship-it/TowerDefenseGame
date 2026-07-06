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
  it('protects an item from salvage while locked OR favorited; flags persist', () => {
    meta.reset();
    meta.grantItem(item('x1', 'w_coil', 'rare'));
    meta.toggleLock('x1');
    expect(meta.get().equipment.inventory[0].locked).toBe(true);
    expect(meta.salvageItem('x1')).toBe(false); // locked → refused

    meta.toggleLock('x1'); // unlock
    meta.toggleFavorite('x1');
    expect(meta.get().equipment.inventory[0].favorite).toBe(true);
    expect(meta.salvageItem('x1')).toBe(false); // favorites are ALSO protected (destruction safeguards)

    meta.toggleFavorite('x1'); // unfavorite → now unprotected
    expect(meta.salvageItem('x1')).toBe(true);
  });
});

describe('quick-salvage (batch) — guard predicate, batch execute, one-deep undo', () => {
  it('canSalvage guards missing / locked / favorite / equipped items', () => {
    meta.reset();
    meta.grantItem(item('s1', 'w_coil', 'rare'));
    expect(meta.canSalvage('s1')).toBe(true);
    expect(meta.canSalvage('nope')).toBe(false); // missing
    meta.toggleLock('s1'); expect(meta.canSalvage('s1')).toBe(false); meta.toggleLock('s1');
    meta.toggleFavorite('s1'); expect(meta.canSalvage('s1')).toBe(false); meta.toggleFavorite('s1');
    meta.equip('ravager', 'weapon', 's1'); expect(meta.canSalvage('s1')).toBe(false); // equipped
    meta.equip('ravager', 'weapon', null);
    expect(meta.canSalvage('s1')).toBe(true);
  });

  it('salvagePreview aggregates only SELECTABLE items (protected excluded)', () => {
    meta.reset();
    meta.grantItem(item('a', 'w_coil', 'rare'));
    meta.grantItem(item('b', 'w_coil', 'epic'));
    meta.grantItem(item('c', 'w_coil', 'rare'));
    meta.toggleLock('c'); // protected → excluded from the preview
    const p = meta.salvagePreview(['a', 'b', 'c']);
    expect(p.count).toBe(2);
    expect(p.refund.scrap).toBe((meta.salvageValueOf('a')?.scrap ?? 0) + (meta.salvageValueOf('b')?.scrap ?? 0));
  });

  it('salvageItems dismantles the batch in one write; the one-deep undo restores the LAST item', () => {
    meta.reset();
    meta.grantItem(item('a', 'w_coil', 'rare'));
    meta.grantItem(item('b', 'w_coil', 'epic'));
    meta.grantItem(item('c', 'w_coil', 'rare'));
    meta.toggleFavorite('c'); // protected — must SURVIVE the batch
    const scrap0 = meta.get().mats.scrap;
    const preview = meta.salvagePreview(['a', 'b', 'c']);
    const res = meta.salvageItems(['a', 'b', 'c']);
    expect(res.count).toBe(2);
    const inv = () => meta.get().equipment.inventory;
    expect(inv().find((i) => i.uid === 'a')).toBeUndefined();
    expect(inv().find((i) => i.uid === 'b')).toBeUndefined();
    expect(inv().find((i) => i.uid === 'c')).toBeDefined(); // favorite untouched
    expect(meta.get().mats.scrap).toBe(scrap0 + preview.refund.scrap); // aggregate scrap banked
    expect(meta.get().lastSalvage?.item.uid).toBe('b'); // one-deep undo → the batch's last item
    expect(meta.undoSalvage()).toBe(true);
    expect(inv().find((i) => i.uid === 'b')).toBeDefined(); // restored
    expect(meta.get().lastSalvage).toBeNull();
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
