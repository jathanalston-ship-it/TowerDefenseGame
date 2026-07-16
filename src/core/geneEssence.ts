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
 *  legendary pays out big — so pushing rarity stays rewarding even after a unit is maxed. Keyed by
 *  the UNION of both rarity ladders (loot boxes: …uncommon…mythic · reward caches: …exotic), so a
 *  container of either kind pays its true tier. Balancing formula + long-horizon simulation live in
 *  docs/GENE-EVOLUTION.md §Economy. */
export const ESSENCE_PER_SHARD: Record<LootRarity | 'exotic', number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 6,
  legendary: 9,
  exotic: 12, // cache ladder's top pull sits between legendary and mythic
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

/** Unified rarity → tier index across BOTH container ladders (loot boxes and reward caches), for
 *  scaling the container drop. Unknown ids read as tier 0. */
const RARITY_TIER: Record<string, number> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, exotic: 5, mythic: 5,
};
export function essenceRarityTier(rarity: string): number {
  return RARITY_TIER[rarity] ?? 0;
}

// ── Container drop (Task 3) — the SECONDARY source ─────────────────────────────────────────────
// A small bonus roll on opening any Bio-Container: very low base chance, tiny quantities, scaled by
// the container's rarity and only SLIGHTLY by Campaign progress + Power Score. Purely additive — it
// never replaces a guaranteed reward — and deliberately tuned below duplicate conversion so
// duplicates stay the dominant source (verified by the simulation in docs/GENE-EVOLUTION.md).
export const ESSENCE_DROP = {
  baseChance: 0.08, // very low (tuned so a fresh account funds its FIRST upgrade in a few hours)
  chancePerRarity: 0.02, // + per rarity tier (mythic/exotic ⇒ +0.10)
  chanceCampaignDiv: 500, // + stage/500 (slight: +0.06 at C30)
  chancePowerDiv: 60000, // + power/60000 (slight: +0.05 at 3k power)
  chanceCap: 0.22,
  amountRange: [1, 2] as [number, number], // small quantities
  amountPerRarity: 0.6, // + rarity tier × this (rounded)
  amountCampaignDiv: 60, // + stage/60 (slight)
  amountPowerDiv: 8000, // + power/8000 (slight)
  amountCap: 9,
} as const;

export interface EssenceDropParams {
  containerRarity: string; // either ladder — unified via essenceRarityTier
  power: number; // account Power Score
  campaignStage: number; // furthest campaign progress
  rng: () => number;
}

/** Roll one container's bonus Essence drop. Returns the amount (0 = no drop). Deterministic from
 *  `rng`; stateless (no pity — it should surprise, not be counted on). */
export function rollEssenceDrop(p: EssenceDropParams): number {
  const D = ESSENCE_DROP;
  const tier = essenceRarityTier(p.containerRarity);
  const chance = Math.min(
    D.chanceCap,
    D.baseChance + tier * D.chancePerRarity + p.campaignStage / D.chanceCampaignDiv + p.power / D.chancePowerDiv,
  );
  if (p.rng() >= chance) return 0;
  const [lo, hi] = D.amountRange;
  const base = lo + Math.floor(p.rng() * (hi - lo + 1));
  const amount = base + Math.round(tier * D.amountPerRarity + p.campaignStage / D.amountCampaignDiv + p.power / D.amountPowerDiv);
  return Math.max(1, Math.min(D.amountCap, amount));
}

// ── Upgrade costs (the SINK; consumed by the Archive UI + Task 4 content) ──────────────────────
// One canonical curve so income (above) and spend stay tuned against each other. Cost scales with
// the CARD's rarity (its base cost) and grows STEEPLY per level: L1s are cheap quick wins a fresh
// account can fund from drops alone, while top levels are long-horizon chases sized against the
// endgame duplicate-conversion income (~1k Essence/hr — see the simulation in GENE-EVOLUTION.md,
// which sizes the full-library sink at roughly the 400-hour income mark). All tunables in one place.
export const ESSENCE_COST = {
  baseByCardRarity: { common: 25, uncommon: 34, rare: 45, epic: 80, legendary: 130 } as Record<string, number>,
  levelGrowth: 5, // cost(level) = base × growth^(level-1) — L4 legendary ≈ 16k (a real chase)
  // TRANSCENDENCE (docs/GENE-EVOLUTION.md §Transcendence) — the late-game sink on top of a maxed
  // card: cost = rarity base × this. Re-choosing an option pays the FULL price again (that is the
  // sink). A second tier would add its own multiplier here (documented future hook, not built).
  transcendMult: 120, // common 3k · rare 5.4k · epic 9.6k · legendary 15.6k
} as const;

/** Essence cost to buy `level` (1-based) on a card of `cardRarity`. */
export function essenceUpgradeCost(cardRarity: string, level: number): number {
  const base = ESSENCE_COST.baseByCardRarity[cardRarity] ?? ESSENCE_COST.baseByCardRarity.common;
  return Math.round(base * Math.pow(ESSENCE_COST.levelGrowth, Math.max(0, level - 1)));
}

/** Essence cost to TRANSCEND a maxed card of `cardRarity` (and to re-choose — full price). */
export function essenceTranscendCost(cardRarity: string): number {
  const base = ESSENCE_COST.baseByCardRarity[cardRarity] ?? ESSENCE_COST.baseByCardRarity.common;
  return Math.round(base * ESSENCE_COST.transcendMult);
}
