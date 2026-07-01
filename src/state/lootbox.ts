// Loot-box rolling. TWO data-driven roll paths share ONE result shape (ChestResult)
// so a single reveal pipeline serves both:
//   • rollChest — run-end caches: N pulls from a chest's weighted POOLS (config.ts),
//     each pull landing in tower/hero shards, crafting materials, equipment, or a
//     future seam (cosmetic/relic/event); produces one RewardItem per pull.
//   • rollLoot  — loot-queue boxes: a per-RARITY reward table (core/loot.ts), shards
//     only, with the box's rarity id riding along as chestId so the reveal styles it.
// Both aggregate into per-system totals the meta layer applies to the save. Pure given
// its rng (defaulting to Math.random) — META, not the deterministic sim.

import { HERO_IDS, TOWER_ORDER } from '../core/config';
import type { ChestDef, LootRarity, MaterialKind, WeightedPool } from '../core/config';
import type { LootRewardTable, RarityDef } from '../core/loot';
import type { TowerKind } from '../core/types';
import { RARITY_ORDER, rollItemDrop } from '../core/equipment';
import type { OwnedItem } from '../core/equipment';

/** One revealed reward (the animated opening plays these in order). Every reward
 * system is a variant here; future seams (cosmetic/relic/event) are real shapes,
 * produced only once a chest weights their pool. */
export type RewardItem =
  | { type: 'tower'; rarity: LootRarity; kind: TowerKind; amount: number }
  | { type: 'hero'; rarity: LootRarity; id: string; amount: number }
  | { type: 'material'; rarity: LootRarity; mat: MaterialKind; amount: number }
  | { type: 'equipment'; rarity: LootRarity; item: OwnedItem }
  | { type: 'cosmetic'; rarity: LootRarity; id: string }
  | { type: 'relic'; rarity: LootRarity; id: string }
  | { type: 'event'; rarity: LootRarity; currency: string; amount: number; note?: string };

/** A banked, UNOPENED container in the Genetic Vault. Either a loot-queue box (a rarity
 *  rolled via rollLoot on crack) or the run-end results cache (a chest def rolled via
 *  rollChest on crack). Both bank from a run; the player cracks each open manually. */
export type PendingContainer =
  | { kind: 'loot'; rarity: string }
  | { kind: 'cache'; chestId: string };

export interface ChestResult {
  chestId: string;
  topRarity: LootRarity; // the best pull — drives how big the reveal ceremony gets
  items: RewardItem[]; // ordered reveal sequence (duplicates kept; UI merges them)
  // ── aggregated per-system totals (what the meta layer applies to the save) ──
  towerShards: Record<TowerKind, number>;
  heroShards: Record<string, number>;
  materials: Record<MaterialKind, number>;
  equipment: OwnedItem[];
}

type Rng = () => number;

function randInt(rng: Rng, [lo, hi]: [number, number]): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}
function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function weightedPool(rng: Rng, pools: WeightedPool[]): WeightedPool {
  const total = pools.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (const p of pools) if ((r -= p.weight) < 0) return p;
  return pools[pools.length - 1];
}
function higher(a: LootRarity, b: LootRarity): LootRarity {
  return RARITY_ORDER.indexOf(a) >= RARITY_ORDER.indexOf(b) ? a : b;
}

/** A fresh result with zeroed per-system accumulators (shared by both roll paths). */
function emptyResult(chestId: string): ChestResult {
  const towerShards = {} as Record<TowerKind, number>;
  for (const k of TOWER_ORDER) towerShards[k] = 0;
  return {
    chestId,
    topRarity: 'common',
    items: [],
    towerShards,
    heroShards: {},
    materials: { mutagen: 0, scrap: 0, catalyst: 0 },
    equipment: [],
  };
}

/** Fold a reward item into a result's aggregated per-system totals + reveal list. */
function accrue(res: ChestResult, item: RewardItem): void {
  res.items.push(item);
  res.topRarity = higher(res.topRarity, item.rarity);
  switch (item.type) {
    case 'tower':
      res.towerShards[item.kind] += item.amount;
      break;
    case 'hero':
      res.heroShards[item.id] = (res.heroShards[item.id] ?? 0) + item.amount;
      break;
    case 'material':
      res.materials[item.mat] += item.amount;
      break;
    case 'equipment':
      res.equipment.push(item.item);
      break;
    // cosmetic / relic / event: future seams — no save bucket yet, reveal-only.
  }
}

/** Roll one pull from a weighted pool into a RewardItem. `heroPool` biases which hero a hero-shard
 *  pull lands on (the meta layer passes still-LOCKED heroes so shards visibly fund the next unlock;
 *  defaults to every hero). */
function rollOne(rng: Rng, wp: WeightedPool, heroPool: readonly string[] = HERO_IDS): RewardItem {
  const r = wp.rarity ?? 'common';
  const s = wp.spec;
  switch (s.pool) {
    case 'tower':
      return { type: 'tower', rarity: r, kind: pick(rng, TOWER_ORDER), amount: randInt(rng, s.range) };
    case 'hero':
      return { type: 'hero', rarity: r, id: pick(rng, heroPool.length ? heroPool : HERO_IDS), amount: randInt(rng, s.range) };
    case 'material':
      return { type: 'material', rarity: r, mat: pick(rng, s.mats), amount: randInt(rng, s.range) };
    case 'equipment': {
      const item = rollItemDrop(rng, s.wave);
      return { type: 'equipment', rarity: item.rarity, item }; // equipment carries its own rarity
    }
    case 'cosmetic':
      return { type: 'cosmetic', rarity: r, id: pick(rng, s.ids) };
    case 'relic':
      return { type: 'relic', rarity: r, id: pick(rng, s.ids) };
    case 'event':
      return { type: 'event', rarity: r, currency: s.currency, amount: randInt(rng, s.range) };
  }
}

/** Roll a chest into an ordered reveal list + aggregated per-system totals (pools model). `heroPool`
 *  (optional) biases hero-shard pulls toward still-locked heroes; defaults to every hero. */
export function rollChest(def: ChestDef, rng: Rng = Math.random, heroPool?: readonly string[]): ChestResult {
  const res = emptyResult(def.id);
  for (let i = 0; i < def.rolls; i++) accrue(res, rollOne(rng, weightedPool(rng, def.pools), heroPool));
  return res;
}

/** Roll a loot-queue box's per-rarity reward table (shards only) into the shared shape.
 * Items carry a neutral 'common' item-rarity — the BOX rarity (chestId, the rarity id)
 * supplies the reveal's emphasis (see LootReveal), keeping the item-rarity and box-rarity
 * scales cleanly separate. */
export function rollLoot(rarity: RarityDef, rng: Rng = Math.random, heroPool?: readonly string[]): ChestResult {
  const t: LootRewardTable = rarity.reward;
  const pool = heroPool && heroPool.length ? heroPool : HERO_IDS;
  const res = emptyResult(rarity.id);
  for (let i = 0; i < t.rolls; i++) {
    if (rng() < t.heroShardChance) {
      const id = pick(rng, pool);
      accrue(res, { type: 'hero', rarity: 'common', id, amount: randInt(rng, t.heroShardRange) });
    } else {
      const kind = pick(rng, TOWER_ORDER);
      accrue(res, { type: 'tower', rarity: 'common', kind, amount: randInt(rng, t.towerShardRange) });
    }
  }
  return res;
}
