// GENE DISCOVERY meta pipeline (docs/CARDS.md §discovery): the v46 migration seeds veterans,
// containers permanently expand the Archive through the real open pipeline, echoes pay
// essence, and the draft pool honors the discovered set.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import { defaultSave, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import { STARTER_GENES } from '../core/geneDiscovery';
import { CARD_POOL, draftCards } from '../core/cards';
import { Rng } from '../core/rng';

function seed(over: Partial<SaveData> = {}): void {
  const base = defaultSave();
  const imported = meta.importText(serializeExport({ ...base, ...over } as SaveData));
  expect(imported.ok).toBe(true);
}

describe('save v46 (starters + veteran migration)', () => {
  it('a fresh account owns exactly the starter archive', () => {
    seed();
    const ids = new Set(meta.get().genesDiscovered);
    expect(ids.size).toBe(STARTER_GENES.length);
    for (const id of STARTER_GENES) expect(ids.has(id), id).toBe(true);
  });

  it('a pre-v46 save seeds starters ∪ every card the account touched', () => {
    const base = defaultSave();
    const touchedDraft = 'concussive_rounds'; // in uniqueCards (drafted once)
    const touchedLevel = 'heavy_caliber'; // leveled in the Archive
    const legacy = {
      ...base,
      stats: { ...base.stats, uniqueCards: [touchedDraft] },
      genes: { [touchedLevel]: { level: 2 } },
    } as unknown as Record<string, unknown>;
    delete legacy.genesDiscovered; // the v45 shape — the field does not exist yet
    seed(legacy as unknown as Partial<SaveData>);
    const ids = new Set(meta.get().genesDiscovered);
    expect(ids.has(touchedDraft)).toBe(true);
    expect(ids.has(touchedLevel)).toBe(true);
    for (const id of STARTER_GENES) expect(ids.has(id), id).toBe(true);
  });
});

describe('containers expand the Archive (the real open pipeline)', () => {
  it('a legendary stockpile discovers new strands; every find is valid and unique', () => {
    seed({
      pendingContainers: Array.from({ length: 40 }, () => ({ kind: 'loot' as const, rarity: 'legendary' })),
      // Deep campaign so every rarity pool is open — the sweep can find anything.
      campaign: { ...defaultSave().campaign, cleared: { ...defaultSave().campaign.cleared, normal: 99 } },
    });
    const before = new Set(meta.get().genesDiscovered);
    const opened = meta.openContainers(40);
    expect(opened.length).toBe(40);
    const after = meta.get().genesDiscovered;
    // P(zero discoveries in 40 legendary opens) ≈ (1−0.58)^40 < 1e-14 — statistically certain.
    expect(after.length).toBeGreaterThan(before.size);
    const known = new Set(CARD_POOL.map((c) => c.id));
    expect(after.every((id) => known.has(id))).toBe(true);
    expect(new Set(after).size).toBe(after.length); // never a duplicate entry
    // The reveal carried the discovery items (gene pulls exist across the batch).
    const geneItems = opened.flatMap((o) => o.chest.items).filter((i) => i.type === 'gene');
    expect(geneItems.length).toBeGreaterThan(0);
    for (const g of geneItems) {
      if (g.type !== 'gene') continue;
      if (!g.isNew) expect(g.echoEssence ?? 0).toBeGreaterThan(0); // echoes always pay
    }
  });
});

describe('the draft pool honors discovery', () => {
  it('with a draftPool, every draft is a discovered strand (legacy path untouched without one)', () => {
    const pool = new Set(STARTER_GENES);
    const rng = new Rng(42);
    for (let i = 0; i < 30; i++) {
      const picks = draftCards(rng, 3, i, undefined, undefined, pool);
      for (const p of picks) expect(pool.has(p.id), p.id).toBe(true);
    }
    // Legacy call (no pool): ungated cards outside the starter set still appear — the
    // golden path's pool is unchanged by the overhaul.
    const legacy = new Set<string>();
    const rng2 = new Rng(7);
    for (let i = 0; i < 60; i++) for (const p of draftCards(rng2, 3, i)) legacy.add(p.id);
    expect([...legacy].some((id) => !pool.has(id))).toBe(true);
  });
});
