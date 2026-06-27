// Loot-box rolling — a chest is N independent pulls from a DATA-DRIVEN weighted
// reward table (ChestDef.pools, config.ts). Each pull lands in a pool (tower/hero
// shards, crafting materials, equipment, or a future seam) and produces one
// RewardItem; results aggregate into per-system totals the meta layer applies.
// Pure given its rng → unit-testable + seedable. META, not the deterministic sim,
// so a plain `() => number` rng (defaulting to Math.random) is fine.

import { HERO_IDS, TOWER_ORDER } from '../core/config';
import type { ChestDef, LootRarity, MaterialKind, WeightedPool } from '../core/config';
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
  | { type: 'event'; rarity: LootRarity; currency: string; amount: number };

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

/** Roll one pull from a pool into a RewardItem. */
function rollOne(rng: Rng, wp: WeightedPool): RewardItem {
  const r = wp.rarity ?? 'common';
  const s = wp.spec;
  switch (s.pool) {
    case 'tower':
      return { type: 'tower', rarity: r, kind: pick(rng, TOWER_ORDER), amount: randInt(rng, s.range) };
    case 'hero':
      return { type: 'hero', rarity: r, id: pick(rng, HERO_IDS), amount: randInt(rng, s.range) };
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

/** Roll a chest into an ordered reveal list + aggregated per-system totals. */
export function rollChest(def: ChestDef, rng: Rng = Math.random): ChestResult {
  const items: RewardItem[] = [];
  const towerShards = {} as Record<TowerKind, number>;
  for (const k of TOWER_ORDER) towerShards[k] = 0;
  const heroShards: Record<string, number> = {};
  const materials: Record<MaterialKind, number> = { mutagen: 0, scrap: 0, catalyst: 0 };
  const equipment: OwnedItem[] = [];
  let topRarity: LootRarity = 'common';

  for (let i = 0; i < def.rolls; i++) {
    const item = rollOne(rng, weightedPool(rng, def.pools));
    items.push(item);
    topRarity = higher(topRarity, item.rarity);
    switch (item.type) {
      case 'tower':
        towerShards[item.kind] += item.amount;
        break;
      case 'hero':
        heroShards[item.id] = (heroShards[item.id] ?? 0) + item.amount;
        break;
      case 'material':
        materials[item.mat] += item.amount;
        break;
      case 'equipment':
        equipment.push(item.item);
        break;
      // cosmetic / relic / event: future seams — no save bucket yet, reveal-only.
    }
  }
  return { chestId: def.id, topRarity, items, towerShards, heroShards, materials, equipment };
}
