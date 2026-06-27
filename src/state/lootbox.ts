// Loot-box rolling — the run-end reward chest (PROGRESSION.md / LOOTBOX.md). A chest
// is a number of independent rolls; each yields tower shards, or (small chance) hero
// shards. Pure given its rng, so it's unit-testable and seedable; the meta layer
// applies the result to the save. This is META, not the deterministic sim, so a
// plain `() => number` rng (defaulting to Math.random) is fine here.

import { HERO_IDS, TOWER_ORDER } from '../core/config';
import type { ChestDef } from '../core/config';
import type { LootRewardTable, RarityDef } from '../core/loot';
import type { TowerKind } from '../core/types';

/** One revealed reward (the animated opening plays these in order). */
export type RewardItem =
  | { type: 'tower'; kind: TowerKind; amount: number }
  | { type: 'hero'; id: string; amount: number };

export interface ChestResult {
  chestId: string;
  items: RewardItem[]; // ordered reveal sequence
  towerShards: Record<TowerKind, number>; // aggregated totals (for applying to the save)
  heroShards: Record<string, number>;
}

function randInt(rng: () => number, [lo, hi]: [number, number]): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Core roller: turn a reward table into an ordered reveal list + aggregated shard totals.
 * Shared by chests (config) and loot-queue boxes (rarity framework) so both reveal alike. */
function rollTable(id: string, t: LootRewardTable, rng: () => number): ChestResult {
  const items: RewardItem[] = [];
  const towerShards = {} as Record<TowerKind, number>;
  for (const k of TOWER_ORDER) towerShards[k] = 0;
  const heroShards: Record<string, number> = {};

  for (let i = 0; i < t.rolls; i++) {
    if (rng() < t.heroShardChance) {
      const heroId = pick(rng, HERO_IDS);
      const amount = randInt(rng, t.heroShardRange);
      heroShards[heroId] = (heroShards[heroId] ?? 0) + amount;
      items.push({ type: 'hero', id: heroId, amount });
    } else {
      const kind = pick(rng, TOWER_ORDER);
      const amount = randInt(rng, t.towerShardRange);
      towerShards[kind] += amount;
      items.push({ type: 'tower', kind, amount });
    }
  }
  return { chestId: id, items, towerShards, heroShards };
}

/** Roll a chest into an ordered reveal list + aggregated shard totals. */
export function rollChest(def: ChestDef, rng: () => number = Math.random): ChestResult {
  return rollTable(def.id, def, rng);
}

/** Roll a loot-queue box's per-rarity reward table into the same reveal structure
 * (the rarity id rides along as chestId so the reveal can style by rarity). */
export function rollLoot(rarity: RarityDef, rng: () => number = Math.random): ChestResult {
  return rollTable(rarity.id, rarity.reward, rng);
}
