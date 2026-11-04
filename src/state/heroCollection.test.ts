// Hero Collection unlock (Ravager owned; Shepherd/Overseer claimed with Hero Shards) + the unified
// power-scaled equipment drop. Covers the meta/save layer + the pure acquisition helpers.

import { describe, it, expect } from 'vitest';
import { defaultSave, serializeExport } from '../save/saveStore';
import { parseImport } from '../save/saveStore';
import { isHeroUnlocked, heroCollection, fieldedLoadout, meta } from './meta';
import { HERO_DEFS } from '../core/config';
import { itemLevelForDepth, rollItemForDepth, RARITY_ORDER } from '../core/equipment';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe('Hero Collection unlock', () => {
  it('a fresh account owns only the starter (Ravager); Shepherd + Overseer are locked', () => {
    const s = defaultSave();
    expect(isHeroUnlocked(s, 'ravager')).toBe(true);
    expect(isHeroUnlocked(s, 'shepherd')).toBe(false);
    expect(isHeroUnlocked(s, 'overseer')).toBe(false);
  });

  it('the collection view reports unlock progress ("42 / 100") for locked heroes', () => {
    const s = { ...defaultSave(), heroShards: { ...defaultSave().heroShards, shepherd: 42 } };
    const col = heroCollection(s);
    const shep = col.find((e) => e.kind === 'shepherd')!;
    expect(shep.unlocked).toBe(false);
    expect(shep.cost).toBe(HERO_DEFS.shepherd.unlockShards);
    expect(shep.shards).toBe(42);
    expect(shep.progress).toBeCloseTo(42 / (HERO_DEFS.shepherd.unlockShards ?? 1), 5);
    expect(shep.canUnlock).toBe(false); // 42 < 60
    const rav = col.find((e) => e.kind === 'ravager')!;
    expect(rav.unlocked).toBe(true);
    expect(rav.isStarter).toBe(true);
  });

  it('unlockHero claims a locked hero once enough shards are banked (spends the cost, owned after)', () => {
    const cost = HERO_DEFS.shepherd.unlockShards ?? 0;
    meta.importText(serializeExport({ ...defaultSave(), heroShards: { ...defaultSave().heroShards, shepherd: cost + 5 } }));
    expect(meta.isHeroUnlocked('shepherd')).toBe(false);
    expect(meta.unlockHero('shepherd')).toBe(true);
    expect(meta.isHeroUnlocked('shepherd')).toBe(true);
    expect(meta.get().heroShards.shepherd).toBe(5); // cost spent, remainder carries toward stars
    expect(meta.unlockHero('shepherd')).toBe(false); // already owned → no double-claim
  });

  it('unlockHero refuses when shards are short', () => {
    meta.importText(serializeExport({ ...defaultSave(), heroShards: { ...defaultSave().heroShards, overseer: 10 } }));
    expect(meta.unlockHero('overseer')).toBe(false);
    expect(meta.isHeroUnlocked('overseer')).toBe(false);
  });

  it('a locked hero can never be fielded, even from a stale loadout entry', () => {
    const s = { ...defaultSave(), campaign: { cleared: { standard: 25 }, bestTime: {} }, heroLoadout: ['ravager', 'shepherd'] as never };
    expect(fieldedLoadout(s)).toEqual(['ravager']); // shepherd locked ⇒ filtered out
  });

  it('setHeroInSlot rejects a locked hero but accepts it once claimed', () => {
    const cost = HERO_DEFS.shepherd.unlockShards ?? 0;
    meta.importText(serializeExport({ ...defaultSave(), campaign: { cleared: { standard: 25 }, bestTime: {} }, heroShards: { ...defaultSave().heroShards, shepherd: cost } }));
    meta.setHeroInSlot(2, 'shepherd');
    expect(meta.fieldedLoadout().includes('shepherd')).toBe(false); // locked → no-op
    meta.unlockHero('shepherd');
    meta.setHeroInSlot(2, 'shepherd');
    expect(meta.fieldedLoadout().includes('shepherd')).toBe(true); // owned → fielded
  });

  it('MIGRATION: a pre-v14 save grandfathers in every hero the player already used (no access lost)', () => {
    // A legacy save with Overseer starred + used but no heroUnlocked field.
    const legacy = { ...defaultSave(), heroStars: { ...defaultSave().heroStars, overseer: 2 } } as Record<string, unknown>;
    delete legacy.heroUnlocked;
    const res = parseImport(JSON.stringify(legacy));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.heroUnlocked).toContain('ravager'); // starter
      expect(res.data.heroUnlocked).toContain('overseer'); // grandfathered (had stars)
      expect(res.data.heroUnlocked).not.toContain('shepherd'); // untouched ⇒ stays locked
    }
  });
});

describe('depth-scaled equipment acquisition (docs/EQUIPMENT.md §gear-chase)', () => {
  it('itemLevelForDepth is monotonic, floors at 1 for a fresh account, and is UNCAPPED (no wall at 30)', () => {
    expect(itemLevelForDepth(0)).toBe(1); // fresh account ⇒ i1
    expect(itemLevelForDepth(10)).toBeLessThan(itemLevelForDepth(30));
    expect(itemLevelForDepth(30)).toBeLessThan(itemLevelForDepth(100));
    expect(itemLevelForDepth(100)).toBeGreaterThanOrEqual(33); // T6 affixes reachable deep (maxTierForIlvl)
    expect(itemLevelForDepth(300)).toBeGreaterThan(40); // keeps climbing past the old cap of 30
    for (let s = 1; s <= 400; s++) expect(itemLevelForDepth(s)).toBeGreaterThanOrEqual(itemLevelForDepth(s - 1));
    // Infinite depth folds in at half weight — only when it reads deeper than the campaign.
    expect(itemLevelForDepth(10, 100)).toBe(itemLevelForDepth(50));
    expect(itemLevelForDepth(50, 20)).toBe(itemLevelForDepth(50));
  });

  it('gear rarity scales UP with account depth (early Inert → deep Rampant/Apex-capable)', () => {
    const avgRarity = (stage: number): number => {
      let sum = 0;
      for (let seed = 1; seed <= 400; seed++) sum += RARITY_ORDER.indexOf(rollItemForDepth(mulberry32(seed), stage).rarity);
      return sum / 400;
    };
    expect(avgRarity(60)).toBeGreaterThan(avgRarity(5)); // deeper accounts pull rarer gear
    expect(avgRarity(200)).toBeGreaterThan(avgRarity(60));
  });

  it('a container awards AT MOST ONE equipment item (never a flood)', () => {
    const many = Array.from({ length: 24 }, () => ({ kind: 'cache' as const, chestId: 'standard' }));
    meta.importText(serializeExport({ ...defaultSave(), pendingContainers: many }));
    let opened = 0;
    let prev = meta.get().equipment.inventory.length;
    while (meta.get().pendingContainers.length > 0) {
      const before = meta.get().equipment.inventory.length;
      meta.openContainer();
      const delta = meta.get().equipment.inventory.length - before;
      expect(delta).toBeLessThanOrEqual(1); // ≤ 1 item per crack
      opened++;
      prev = before;
    }
    expect(opened).toBe(24);
    void prev;
  });
});
