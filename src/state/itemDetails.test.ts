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
