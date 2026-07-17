// marketCatalog — pins the foundational-inheritance contract (docs/AUCTION-HOUSE.md
// §catalog): every content registry projects into market families automatically, the
// exclusivity rules keep player-scarcity items out of baseline stock, and each launch
// category always has a live baseline lane.

import { describe, expect, it } from 'vitest';
import {
  baselineCatalog, cosmeticFamilyKey, equipmentFamilyKey, geneFamilyKey, marketCatalogProblems,
  marketFamilies, marketFamily, stockableFamilies,
} from './marketCatalog';
import { baselineEligible } from './marketAuthority';
import { CARD_POOL } from './cards';
import { ALL_ITEMS, RARITY_ORDER } from './equipment';
import { WARDROBE_ITEMS } from './wardrobe';

describe('derivation — registries project into families', () => {
  it('covers every card, every equip def × rarity, and every cosmetic', () => {
    const fams = marketFamilies();
    expect(fams.filter((f) => f.cat === 'geneCard').length).toBe(CARD_POOL.length);
    expect(fams.filter((f) => f.cat === 'equipment').length).toBe(ALL_ITEMS.length * RARITY_ORDER.length);
    expect(fams.filter((f) => f.cat === 'cosmetic').length).toBeGreaterThanOrEqual(WARDROBE_ITEMS.length);
    expect(marketFamily(geneFamilyKey(CARD_POOL[0].id))?.cat).toBe('geneCard');
    expect(marketFamily(equipmentFamilyKey(ALL_ITEMS[0].id, 'common'))?.rarity).toBe('common');
    expect(marketFamily(cosmeticFamilyKey(WARDROBE_ITEMS[0].id))?.cat).toBe('cosmetic');
    expect(marketFamily('gene.__nope__')).toBeUndefined();
  });

  it('reports no content-integrity problems', () => {
    expect(marketCatalogProblems()).toEqual([]);
  });
});

describe('exclusivity — the authority never touches player-scarcity items', () => {
  it('ultra-rare genes, exotic equipment, and earned/seasonal cosmetics are exclusive', () => {
    for (const f of marketFamilies()) {
      if (f.cat === 'geneCard' && (f.rarity === 'epic' || f.rarity === 'legendary')) expect(f.exclusive).toBe(true);
      if (f.cat === 'equipment' && f.rarity === 'exotic') expect(f.exclusive).toBe(true);
    }
    // Every battlepass/event/quest wardrobe item is exclusive — the spec's hard list.
    for (const w of WARDROBE_ITEMS) {
      if (['battlepass', 'event', 'quest', 'login-drop'].includes(w.source.kind)) {
        expect(marketFamily(cosmeticFamilyKey(w.id))?.exclusive).toBe(true);
      }
    }
  });

  it('stockableFamilies: only baseline-eligible non-exclusives; every launch category has a live lane', () => {
    const stockable = stockableFamilies();
    for (const f of stockable) {
      expect(f.exclusive).toBe(false);
      expect(baselineEligible({ familyKey: f.familyKey, cat: f.cat, rarity: f.rarity, exclusive: false })).toBe(true);
    }
    for (const cat of ['equipment', 'cosmetic', 'geneCard'] as const) {
      expect(stockable.some((f) => f.cat === cat)).toBe(true);
    }
  });

  it('baselineCatalog rows carry exactly what planBaselineRestock needs', () => {
    const rows = baselineCatalog();
    expect(rows.length).toBe(marketFamilies().length);
    for (const r of rows.slice(0, 20)) {
      expect(typeof r.familyKey).toBe('string');
      expect(['equipment', 'cosmetic', 'geneCard']).toContain(r.cat);
    }
  });
});
