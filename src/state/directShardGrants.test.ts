// Direct-lane duplicate conversion (docs/GENE-EVOLUTION.md §Economy): every shard lane that is
// NOT a container open — account level-ups, quest/season/pass claims, wardrobe milestones,
// premium packs — routes through settleDirectShardGrants, so a max-Star unit's grant converts
// to Gene Essence (flat common rate) instead of accumulating dead. Pins the helper's semantics
// (maxed converts · un-maxed keeps · locked heroes keep toward unlock · in-place mutation) and
// one full public path (meta.interpretGrants receipts the conversion honestly).

import { describe, it, expect } from 'vitest';
import { meta, settleDirectShardGrants } from './meta';
import { defaultSave } from '../save/saveStore';
import { STAR, TOWER_ORDER, HERO_ORDER, HERO_DEFS } from '../core/config';
import { ESSENCE_PER_SHARD } from '../core/geneEssence';
import type { PremiumOfferDef } from '../core/premium';
import type { HeroKind } from '../core/types';

const starter = (): HeroKind => HERO_ORDER.find((k) => !(HERO_DEFS[k].unlockShards && HERO_DEFS[k].unlockShards! > 0))!;
const locked = (): HeroKind | undefined => HERO_ORDER.find((k) => (HERO_DEFS[k].unlockShards ?? 0) > 0);

describe('settleDirectShardGrants — the leak-closing seam', () => {
  it('a fresh account converts nothing (the common path is a no-op)', () => {
    const save = defaultSave();
    const towerShards = { ...save.towerShards, needle: (save.towerShards.needle ?? 0) + 25 };
    expect(settleDirectShardGrants(save, { towerShards })).toBe(0);
    expect(towerShards.needle).toBe((save.towerShards.needle ?? 0) + 25); // grant kept
  });

  it('a MAX-Star tower converts its grant at the flat common rate and keeps none of it', () => {
    const save = defaultSave();
    save.towerStars.needle = STAR.maxTowerStars;
    const towerShards = { ...save.towerShards, needle: (save.towerShards.needle ?? 0) + 25 };
    const essence = settleDirectShardGrants(save, { towerShards });
    expect(essence).toBe(25 * ESSENCE_PER_SHARD.common);
    expect(towerShards.needle).toBe(save.towerShards.needle ?? 0); // reverted in place — never accumulates
  });

  it('an unlocked MAX-Star hero converts; a LOCKED hero keeps shards toward its unlock', () => {
    const save = defaultSave();
    const hero = starter();
    save.heroStars[hero] = STAR.maxStars;
    const heroShards: Record<string, number> = { ...save.heroShards, [hero]: (save.heroShards[hero] ?? 0) + 10 };
    const lockedHero = locked();
    if (lockedHero) heroShards[lockedHero] = (save.heroShards[lockedHero] ?? 0) + 10;
    const essence = settleDirectShardGrants(save, { heroShards });
    expect(essence).toBe(10 * ESSENCE_PER_SHARD.common); // only the maxed unlocked hero converted
    expect(heroShards[hero]).toBe(save.heroShards[hero] ?? 0);
    if (lockedHero) expect(heroShards[lockedHero]).toBe((save.heroShards[lockedHero] ?? 0) + 10); // kept
  });

  it('mixed grants convert only the maxed lanes', () => {
    const save = defaultSave();
    save.towerStars.needle = STAR.maxTowerStars; // one maxed, the rest open
    const towerShards = { ...save.towerShards };
    for (const k of TOWER_ORDER) towerShards[k] = (towerShards[k] ?? 0) + 4;
    const essence = settleDirectShardGrants(save, { towerShards });
    expect(essence).toBe(4 * ESSENCE_PER_SHARD.common);
    expect(towerShards.needle).toBe(save.towerShards.needle ?? 0);
    expect(towerShards.mortar).toBe((save.towerShards.mortar ?? 0) + 4); // un-maxed lanes untouched
  });
});

describe('the public lanes route through the seam', () => {
  const offer = (grants: PremiumOfferDef['grants']): PremiumOfferDef => ({
    id: '__test_pack__', kind: 'pack' as PremiumOfferDef['kind'], name: 'Test Pack', tagline: '',
    priceUsd: 1, grants, accent: '#fff', art: '◈',
  });

  it('interpretGrants converts a maxed roster’s pack shards and receipts it honestly', () => {
    const save = defaultSave();
    for (const k of TOWER_ORDER) save.towerStars[k] = STAR.maxTowerStars; // whole roster maxed
    const { next, lines } = meta.interpretGrants(save, offer([{ grant: 'towerShardsAll', qtyEach: 5 }] as PremiumOfferDef['grants']));
    for (const k of TOWER_ORDER) expect(next.towerShards[k] ?? 0).toBe(save.towerShards[k] ?? 0); // nothing accumulates
    expect(next.geneEssence).toBeGreaterThan(save.geneEssence); // …it became Essence
    expect(lines.some((l) => /duplicates converted/.test(l.label))).toBe(true); // reveals match grants
  });

  it('interpretGrants leaves an un-maxed roster’s shards alone (identity — no conversion line)', () => {
    const save = defaultSave();
    const { next, lines } = meta.interpretGrants(save, offer([{ grant: 'towerShardsAll', qtyEach: 5 }] as PremiumOfferDef['grants']));
    expect(next.geneEssence).toBe(save.geneEssence);
    expect(lines.some((l) => /duplicates converted/.test(l.label))).toBe(false);
    expect((next.towerShards.needle ?? 0)).toBe((save.towerShards.needle ?? 0) + 5);
  });
});
