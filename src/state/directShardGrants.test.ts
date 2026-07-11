// Direct-lane shard grants BANK since Prime Strains (docs/PRIME-STRAINS.md §economy). The old
// maxed→Essence "leak-closing" conversion (settleDirectShardGrants) is RETIRED: a max-Star
// unit's shards are spendable again on its Prime ladder, so every non-container lane —
// account level-ups, quest/season/pass claims, milestones, premium packs — keeps its grant.
// Only CONTAINER opens still convert maxed duplicates (the deliberate hold-vs-crack tension;
// pinned by the lootbox suite). This file pins the BANKING side of that contract.

import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import { defaultSave } from '../save/saveStore';
import { STAR, TOWER_ORDER } from '../core/config';
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
