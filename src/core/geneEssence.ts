// Gene Essence economy (docs/GENE-EVOLUTION.md §Economy). Gene Essence is the permanent Gene Card
// upgrade currency. Two sources, both here (pure — no save/DOM):
//   • DUPLICATE CONVERSION (Task 2) — shards for a MAX-Star tower/hero can't buy more stars, so each
//     excess shard auto-converts to Essence, scaled by the container's rarity. The PRIMARY source.
//   • CONTAINER DROPS (Task 3) — a small, rare bonus roll on opening a Bio-Container.
// Anti-exploit: conversion is driven by shards that were actually GRANTED at open time (diffed in
// meta.openContainer), so it can't be farmed by re-opening or editing star counts — a maxed unit just
// redirects the same one-time grant. Resets don't mint Essence (no shards are granted on reset).

import type { LootRarity } from './loot';

/** Gene Essence granted PER excess (max-Star) shard, by the container's rarity. Common trickles;
 *  legendary pays out big — so pushing rarity stays rewarding even after a unit is maxed. Balancing
 *  formula + long-horizon simulation live in docs/GENE-EVOLUTION.md §Economy. */
export const ESSENCE_PER_SHARD: Record<LootRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 6,
  legendary: 9,
  mythic: 15,
};

/** Essence yield of one excess shard at a rarity (falls back to the common rate for unknown ids). */
export function essencePerShard(rarity: string): number {
  return ESSENCE_PER_SHARD[rarity as LootRarity] ?? ESSENCE_PER_SHARD.common;
}

/** Convert `shards` excess (max-Star duplicate) shards into Gene Essence at a container rarity. */
export function essenceForDuplicates(rarity: string, shards: number): number {
  return Math.max(0, Math.floor(shards)) * essencePerShard(rarity);
}
