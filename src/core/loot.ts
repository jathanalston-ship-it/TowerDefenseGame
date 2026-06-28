// Configurable loot-rarity framework (LOOTBOX.md). The single source of truth for
// "what rarities exist, how often they drop, and what each one gives." Everything is
// DATA on a registry — there are no hardcoded probabilities anywhere: a roll sums the
// registered `weight`s and normalizes at roll time, so re-tuning a tier (or adding a
// new one, including an event-exclusive tier) is a data edit with zero logic changes.
//
//   • Tiers      — Common … Mythic today; open-ended via `rarityRegistry.register`.
//   • Weights    — relative integers; the only thing that decides drop odds.
//   • Reward     — a per-rarity reward table (rarer = more / better rolls).
//   • Event-only — `eventOnly` tiers sit out of the normal pool until an event opts them in.
//   • Pity       — per-tier ceilings + a pure pity-state reducer, so a future pity system
//                  is a config flip, not a rewrite.
//
// Pure: depends only on the generic Registry (no DOM, no sim, no content imports).

import { Registry } from './registry';

/** Built-in rarity ids (ascending value). The registry is open — mods/events add more. */
export type LootRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

/**
 * What a box of a given rarity grants, expressed as content-agnostic numbers (no tower/
 * hero ids) so the framework stays decoupled from content — the state layer resolves
 * these into concrete shards (see `rollLoot` in state/lootbox.ts). Mirrors the existing
 * chest reward shape so the same roller serves both.
 */
export interface LootRewardTable {
  rolls: number; // independent reward slots opened
  towerShardRange: [number, number]; // shards to a random tower per roll
  heroShardChance: number; // chance a roll yields hero shards instead
  heroShardRange: [number, number];
}

export interface RarityDef {
  id: LootRarity | string; // stable id (registry key)
  name: string; // display label
  color: string; // CSS color / custom property for UI framing
  weight: number; // RELATIVE drop weight; normalized at roll time (never a probability)
  cost: number; // loot points required to fill a box of this rarity (queue pacing)
  reward: LootRewardTable; // per-rarity reward table
  eventOnly?: boolean; // excluded from the normal pool; only rolled when an event enables it
  /** Pity ceiling: after this many opens WITHOUT this tier-or-better, the next box is
   * guaranteed to be at least this tier. 0 / undefined = no pity. */
  pity?: number;
}

export const rarityRegistry = new Registry<RarityDef>('rarity', {
  idOf: (d) => d.id,
  validate: (d) => {
    const out: string[] = [];
    if (d.weight < 0) out.push('weight must be ≥ 0');
    if (d.cost <= 0) out.push('cost must be > 0');
    if (d.reward.rolls <= 0) out.push('reward.rolls must be > 0');
    if (d.reward.heroShardChance < 0 || d.reward.heroShardChance > 1) out.push('heroShardChance must be in [0,1]');
    return out;
  },
});

// ── Core rarity table (DATA — the only place odds/rewards live) ────────────────
// Weights are RELATIVE: a roll normalizes the sum, so these are not probabilities.
// (For reference the default pool normalizes to ≈ common 50% / uncommon 27% / rare
// 14% / epic 5.5% / legendary 2% / mythic 0.4% — but nothing reads those numbers.)
// Pity ceilings are generous so they only catch genuine bad-luck streaks.
export const RARITIES: RarityDef[] = [
  {
    id: 'common',
    name: 'Common',
    color: 'var(--r-common)',
    weight: 1000,
    cost: 100,
    reward: { rolls: 3, towerShardRange: [2, 5], heroShardChance: 0.1, heroShardRange: [1, 1] },
  },
  {
    id: 'uncommon',
    name: 'Uncommon',
    color: 'var(--r-uncommon)',
    weight: 540,
    cost: 140,
    reward: { rolls: 3, towerShardRange: [3, 6], heroShardChance: 0.14, heroShardRange: [1, 1] },
  },
  {
    id: 'rare',
    name: 'Rare',
    color: 'var(--r-rare)',
    weight: 280,
    cost: 200,
    reward: { rolls: 4, towerShardRange: [4, 8], heroShardChance: 0.2, heroShardRange: [1, 2] },
  },
  {
    id: 'epic',
    name: 'Epic',
    color: 'var(--r-epic)',
    weight: 110,
    cost: 300,
    reward: { rolls: 5, towerShardRange: [6, 11], heroShardChance: 0.28, heroShardRange: [1, 2] },
    pity: 40,
  },
  {
    id: 'legendary',
    name: 'Legendary',
    color: 'var(--r-legendary)',
    weight: 40,
    cost: 460,
    reward: { rolls: 6, towerShardRange: [9, 15], heroShardChance: 0.4, heroShardRange: [1, 3] },
    pity: 90,
  },
  {
    id: 'mythic',
    name: 'Mythic',
    color: 'var(--r-mythic)',
    weight: 8,
    cost: 700,
    reward: { rolls: 7, towerShardRange: [13, 20], heroShardChance: 0.55, heroShardRange: [2, 3] },
    pity: 200,
  },
];

rarityRegistry.registerAll(RARITIES);

/** Loot-point earn rate — banked at run end (deeper + more kills = faster boxes). The
 * HUD meter mirrors this live from the run snapshot, so display and award stay in sync. */
export const LOOT_EARN = { pointsPerWave: 14, pointsPerKill: 1 };

/** How many boxes the queue keeps determined at once: the front (filling now) + the visible
 * "next". The run banks loot LIVE (meta.syncRunLoot), so the queue rolls a fresh box each time
 * the front completes — it never needs to pre-roll a whole run's worth up front. */
export const LOOT_QUEUE_DEPTH = 2;

// ── Lookups ───────────────────────────────────────────────────────────────────

export function isLootRarity(id: string): boolean {
  return rarityRegistry.has(id);
}

/** A rarity's rank (0 = lowest). Registration order is ascending value. */
export function rarityRank(id: string): number {
  return rarityRegistry.ids().indexOf(rarityRegistry.resolve(id) ?? id);
}

/** Loot points needed to fill a box of this rarity (safe for unknown ids). */
export function costOf(id: string): number {
  return rarityRegistry.get(id)?.cost ?? RARITIES[0].cost;
}

/** The rarities eligible for a normal roll: registered, non-deprecated, positive weight,
 * and not event-locked unless `events` opts the id in. */
export function lootPool(events: readonly string[] = []): RarityDef[] {
  return rarityRegistry.active().filter((d) => d.weight > 0 && (!d.eventOnly || events.includes(d.id)));
}

// ── Pity ────────────────────────────────────────────────────────────────────

/** Consecutive opens since each pity-tracked tier was last hit (or bettered). Persisted
 * with the queue and fed back into every roll. Only tiers with a `pity` ceiling appear. */
export type PityState = Record<string, number>;

export function emptyPity(): PityState {
  const p: PityState = {};
  for (const d of rarityRegistry.all()) if (d.pity && d.pity > 0) p[d.id] = 0;
  return p;
}

/** Fold an opened box into pity counters: hitting `result` satisfies every tier at or
 * below its rank (you got that-or-better); higher tiers tick one closer to their ceiling. */
export function updatePity(pity: PityState, result: string): PityState {
  const next: PityState = {};
  const resultRank = rarityRank(result);
  for (const d of rarityRegistry.all()) {
    if (!d.pity || d.pity <= 0) continue;
    next[d.id] = rarityRank(d.id) <= resultRank ? 0 : (pity[d.id] ?? 0) + 1;
  }
  return next;
}

/** Opens remaining before `id` becomes guaranteed (for a "guaranteed in N" UI). Infinity
 * if the tier has no pity ceiling. */
export function pityRemaining(pity: PityState, id: string): number {
  const def = rarityRegistry.get(id);
  if (!def?.pity || def.pity <= 0) return Infinity;
  return Math.max(0, def.pity - (pity[id] ?? 0));
}

/** The highest-rank tier whose pity ceiling is currently met (due to be forced), or null. */
function dueTier(pity: PityState, pool: RarityDef[]): RarityDef | null {
  let due: RarityDef | null = null;
  for (const d of pool) {
    if (d.pity && d.pity > 0 && (pity[d.id] ?? 0) >= d.pity) {
      if (!due || rarityRank(d.id) > rarityRank(due.id)) due = d;
    }
  }
  return due;
}

// ── Rolling ───────────────────────────────────────────────────────────────────

export interface RollOpts {
  /** Pity state to honor (a met ceiling forces that tier). Omit to ignore pity. */
  pity?: PityState;
  /** Event ids that opt their event-exclusive tiers into the pool. */
  events?: readonly string[];
}

/**
 * Roll one rarity. Selection is purely weight-driven (sum the pool's weights, walk a
 * uniform draw) — there are NO probabilities in code. If a pity ceiling is met, the due
 * tier is returned instead. `rng` is META (defaults to Math.random); inject for tests.
 */
export function rollRarity(rng: () => number = Math.random, opts: RollOpts = {}): string {
  const pool = lootPool(opts.events);
  if (pool.length === 0) return RARITIES[0].id; // degenerate config guard
  if (opts.pity) {
    const due = dueTier(opts.pity, pool);
    if (due) return due.id;
  }
  const total = pool.reduce((s, d) => s + d.weight, 0);
  let r = rng() * total;
  for (const d of pool) {
    r -= d.weight;
    if (r < 0) return d.id;
  }
  return pool[pool.length - 1].id; // fp safety net
}
