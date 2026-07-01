// Details-screen data plumbing: a reforge op stamps a mod-history entry and PRESERVES the item's
// source (so the Details screen's "Source" + "Mod history" facts stay truthful across upgrades).

import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import { defaultSave, serializeExport } from '../save/saveStore';
import { Rng } from '../core/rng';
import { rollItem, WEAPONS } from '../core/equipment';

const rng = () => { const r = new Rng(7); return () => r.next(); };

describe('equipment Details: source + mod history', () => {
  it('reforgeOp appends to history and keeps the source through the upgrade', () => {
    const item = rollItem(rng(), WEAPONS[0], 'rare', 20, 'Genetic Vault'); // ilvl 20 ⇒ tier headroom to enhance
    meta.importText(serializeExport({
      ...defaultSave(),
      equipment: { inventory: [item], loadouts: {} },
      mats: { mutagen: 99, scrap: 99, catalyst: 99 }, // afford any op
    }));
    expect(meta.reforgeOp(item.uid, 'enhance')).toBe(true);
    const after = meta.get().equipment.inventory.find((i) => i.uid === item.uid)!;
    expect(after.history).toEqual(['Enhanced']); // one mod logged
    expect(after.source).toBe('Genetic Vault'); // provenance survives the reforge (spread-preserved)
  });
});

describe('equipment destruction safeguards + Undo Salvage', () => {
  const seed = (over: Partial<import('../save/saveStore').SaveData> = {}) => {
    const item = rollItem(rng(), WEAPONS[0], 'epic', 15, 'Genetic Vault');
    meta.importText(serializeExport({ ...defaultSave(), equipment: { inventory: [item], loadouts: {} }, mats: { mutagen: 5, scrap: 5, catalyst: 5 }, ...over }));
    return item;
  };

  it('refuses to salvage a FAVORITE or an EQUIPPED item; a free item salvages + fills the Undo buffer', () => {
    const fav = seed();
    meta.toggleFavorite(fav.uid);
    expect(meta.salvageItem(fav.uid)).toBe(false); // favorite protected
    meta.toggleFavorite(fav.uid); // unfavorite
    meta.equip('ravager', 'weapon', fav.uid);
    expect(meta.salvageItem(fav.uid)).toBe(false); // equipped ⇒ must unequip first
    meta.equip('ravager', 'weapon', null); // unequip
    const beforeScrap = meta.get().mats.scrap;
    expect(meta.salvageItem(fav.uid)).toBe(true);
    expect(meta.get().equipment.inventory).toHaveLength(0); // gone
    expect(meta.get().mats.scrap).toBeGreaterThan(beforeScrap); // materials reclaimed
    expect(meta.get().lastSalvage?.item.uid).toBe(fav.uid); // Undo buffer armed
  });

  it('undoSalvage restores the item and reclaims the refunded materials, then clears the buffer', () => {
    const item = seed();
    const scrapBefore = meta.get().mats.scrap;
    meta.salvageItem(item.uid);
    const scrapAfter = meta.get().mats.scrap;
    expect(scrapAfter).toBeGreaterThan(scrapBefore);
    expect(meta.undoSalvage()).toBe(true);
    expect(meta.get().equipment.inventory.map((i) => i.uid)).toContain(item.uid); // item back
    expect(meta.get().mats.scrap).toBe(scrapBefore); // refund taken back
    expect(meta.get().lastSalvage).toBeNull(); // one-deep buffer cleared
    expect(meta.undoSalvage()).toBe(false); // nothing left to undo
  });

  it('markItemSeen clears the NEW state (idempotent)', () => {
    const item = seed();
    expect(meta.get().equipment.inventory[0].seen).toBeFalsy(); // fresh drop = NEW
    meta.markItemSeen(item.uid);
    expect(meta.get().equipment.inventory[0].seen).toBe(true);
  });
});
