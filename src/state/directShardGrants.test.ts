// Direct-lane shard grants BANK since Prime Strains (docs/PRIME-STRAINS.md §economy). The old
// maxed→Essence "leak-closing" conversion (settleDirectShardGrants) is RETIRED: a max-Star
// unit's shards are spendable again on its Prime ladder, so every non-container lane —
// account level-ups, quest/season/pass claims, milestones, premium packs — keeps its grant.
// Only CONTAINER opens still convert maxed duplicates (the deliberate hold-vs-crack tension;
// pinned by the lootbox suite). This file pins the BANKING side of that contract.

import { describe, it, expect, vi } from 'vitest';
import { meta, towerShardNeed } from './meta';
import { defaultSave, serializeExport } from '../save/saveStore';
import { STAR, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { Rng } from '../core/rng';
import type { PremiumOfferDef } from '../core/premium';

describe('direct shard lanes bank for Prime (no auto-conversion)', () => {
  const offer = (grants: PremiumOfferDef['grants']): PremiumOfferDef => ({
    id: '__test_pack__', kind: 'pack' as PremiumOfferDef['kind'], name: 'Test Pack', tagline: '',
    priceUsd: 1, grants, accent: '#fff', art: '◈',
  });

  it('a maxed roster BANKS its pack shards — Prime fuel, not Essence', () => {
    const save = defaultSave();
    for (const k of TOWER_ORDER) save.towerStars[k] = STAR.maxTowerStars; // whole roster maxed
    const { next, lines } = meta.interpretGrants(save, offer([{ grant: 'towerShardsAll', qtyEach: 5 }] as PremiumOfferDef['grants']));
    for (const k of TOWER_ORDER) {
      // Gated towers may be excluded from the grant pool; every granted lane must KEEP its shards.
      const granted = (next.towerShards[k] ?? 0) - (save.towerShards[k] ?? 0);
      expect(granted === 0 || granted === 5).toBe(true);
    }
    expect(next.towerShards.needle ?? 0).toBe((save.towerShards.needle ?? 0) + 5); // starter lane banked
    expect(next.geneEssence).toBe(save.geneEssence); // nothing silently converted
    expect(lines.some((l) => /duplicates converted/.test(l.label))).toBe(false); // no conversion receipt
  });

  it('an un-maxed roster banks identically (the common path is unchanged)', () => {
    const save = defaultSave();
    const { next, lines } = meta.interpretGrants(save, offer([{ grant: 'towerShardsAll', qtyEach: 5 }] as PremiumOfferDef['grants']));
    expect(next.geneEssence).toBe(save.geneEssence);
    expect(lines.some((l) => /duplicates converted/.test(l.label))).toBe(false);
    expect(next.towerShards.needle ?? 0).toBe((save.towerShards.needle ?? 0) + 5);
  });

  it('banked shards on a maxed tower are immediately spendable on its Prime ladder', () => {
    meta.reset();
    meta.debugSetCampaignStage(300); // lift the Evolution Cap out of the way
    meta.debugAddTowerShards(999999);
    for (let i = 0; i < STAR.maxTowerStars; i++) expect(meta.buyStar('needle')).toBe(true); // the REAL seam to ★max
    expect(meta.buyTowerPrime('needle')).toBe(true); // …and the banked lane feeds the new sink
    expect(meta.get().towerPrime.needle).toBe(1);
    meta.reset();
  });
});

// CONTAINER opens convert the campaign-capped SURPLUS (BALANCE_ARCHITECTURE.md §9, 2026-11): a tower
// whose bank already funds its unlock + every remaining ★ can never spend another shard (★ tiers past
// the Evolution Cap wait on stages 120–300), so its container shards convert to Essence like a maxed
// tower's. Shards that still fund a future ★ keep banking.
describe('container opens: surplus past the remaining ★ ladder converts to Essence', () => {
  it('towerShardNeed = unlock price (if locked) + every remaining ★; 0 at ★max', () => {
    const save = defaultSave();
    expect(towerShardNeed(save, 'needle')).toBe(10230); // a starter at ★0: the whole ladder
    save.towerStars.needle = 7;
    expect(towerShardNeed(save, 'needle')).toBe(1280 + 2560 + 5120);
    save.towerStars.needle = STAR.maxTowerStars;
    expect(towerShardNeed(save, 'needle')).toBe(0); // ★max — the original maxed rule
    expect(towerShardNeed(save, 'maw')).toBe((TOWER_DEFS.maw.unlockShards ?? 0) + 10230); // locked: unlock first
  });

  function openAll(bankAtNeed: boolean): { save: ReturnType<typeof meta.get>; before: ReturnType<typeof meta.get>; towerDupeNotes: number } {
    const rng = new Rng(0x5ea1);
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => rng.next());
    try {
      const base = defaultSave();
      base.campaign = { ...base.campaign, cleared: { standard: 60 } }; // Evolution Cap ★5 — towers capped below ★max
      for (const k of TOWER_ORDER) {
        base.towerStars[k] = 5;
        base.towerShards[k] = bankAtNeed ? towerShardNeed(base, k) : 0;
      }
      meta.importText(serializeExport(base));
      meta.debugAddLootPoints(6000);
      const before = meta.get();
      let towerDupeNotes = 0;
      for (let c = meta.openContainer(); c; c = meta.openContainer()) {
        towerDupeNotes += c.chest.items.filter((i) => i.type === 'event' && /Duplicate .* Tower/.test(i.note ?? '')).length;
      }
      return { save: meta.get(), before, towerDupeNotes };
    } finally {
      spy.mockRestore();
    }
  }

  it('a bank that funds the whole ladder converts every granted shard; an empty bank keeps them', () => {
    const full = openAll(true);
    for (const k of TOWER_ORDER) expect(full.save.towerShards[k], k).toBe(full.before.towerShards[k]); // nothing piles up dead
    expect(full.towerDupeNotes).toBeGreaterThan(0); // …it surfaces as Duplicate → Essence on the reveal
    const empty = openAll(false);
    const banked = TOWER_ORDER.reduce((n, k) => n + (empty.save.towerShards[k] ?? 0) - (empty.before.towerShards[k] ?? 0), 0);
    expect(banked).toBeGreaterThan(0); // shards that still fund a future ★ bank as before
    expect(empty.towerDupeNotes).toBe(0);
    meta.reset();
  });
});
