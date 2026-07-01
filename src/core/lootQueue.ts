// Loot queue (LOOTBOX.md §8.4, "anticipation"). The player is ALWAYS filling a meter
// toward a box whose rarity is already decided, and can see the box queued AFTER it —
// "the next loot box is determined before the current meter completes." Filling the meter
// awards the front box, slides the pre-rolled next box forward, and rolls a fresh tail,
// so the queue is never empty and the anticipation never resets to "unknown".
//
// Pure mechanics over the rarity framework (loot.ts): no DOM, no persistence, no content.
// The state layer banks run progress into `addProgress` and applies the awarded boxes'
// reward tables; this module only decides WHICH boxes and WHEN.

import { LOOT_QUEUE_DEPTH, costOf, emptyPity, isLootRarity, rollRarity, updatePity } from './loot';
import type { PityState } from './loot';

export interface LootQueueState {
  /** Loot points banked toward the FRONT box (queue[0]). */
  progress: number;
  /** Pre-determined boxes, front-first: queue[0] fills now, queue[1] is the visible "next". */
  queue: string[];
  /** Pity counters, carried across awards and consulted on every refill roll. */
  pity: PityState;
}

// Deterministic PRNG so a fresh/loaded queue is reproducible (defaultSave must be stable
// for save round-trip tests; loading the same blob must yield the same padding).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULT_SEED = 0x10c7;

/** Roll boxes until the queue holds `LOOT_QUEUE_DEPTH`, honoring pity on each roll. */
function fill(queue: string[], pity: PityState, rng: () => number, bias?: Record<string, number>): string[] {
  const out = queue.slice();
  while (out.length < LOOT_QUEUE_DEPTH) out.push(rollRarity(rng, { pity, bias }));
  return out;
}

/** A fresh queue with its boxes pre-determined. Deterministic (seeded) so identical saves
 * start identical; real progression re-rolls with Math.random via `addProgress`. */
export function defaultLootQueue(): LootQueueState {
  const pity = emptyPity();
  return { progress: 0, queue: fill([], pity, mulberry32(DEFAULT_SEED)), pity };
}

/** Coerce a loaded (possibly stale / partial / hostile) value into a valid queue:
 * drop unknown rarities, clamp progress, rebuild pity, and re-pad to depth. Deterministic. */
export function sanitizeLootQueue(raw: unknown): LootQueueState {
  if (typeof raw !== 'object' || raw === null) return defaultLootQueue();
  const o = raw as Partial<LootQueueState>;
  const progress = typeof o.progress === 'number' && isFinite(o.progress) && o.progress >= 0 ? o.progress : 0;
  const queue = Array.isArray(o.queue) ? o.queue.filter((id): id is string => typeof id === 'string' && isLootRarity(id)) : [];
  // Rebuild pity onto the canonical set of tracked tiers, keeping any valid counters.
  const pity = emptyPity();
  if (o.pity && typeof o.pity === 'object') {
    for (const k of Object.keys(pity)) {
      const v = (o.pity as PityState)[k];
      if (typeof v === 'number' && isFinite(v) && v >= 0) pity[k] = Math.floor(v);
    }
  }
  return { progress, queue: fill(queue, pity, mulberry32(DEFAULT_SEED)), pity };
}

export interface AddProgressResult {
  state: LootQueueState;
  /** Rarities completed by this progress, in award order (usually 0–1; more on a big bank). */
  awarded: string[];
}

/**
 * Bank loot points into the queue. Each time progress covers the front box's cost it is
 * awarded: pity folds the open in, the box pops, the pre-rolled next slides forward, and a
 * fresh tail is rolled (pity-aware) — so the queue stays full and the next box stays known.
 * `rng` is META (defaults to Math.random); inject for deterministic tests.
 */
export function addProgress(
  state: LootQueueState,
  points: number,
  rng: () => number = Math.random,
  bias?: Record<string, number>, // progression-aware catch-up weights (see core/progressionLoot.ts)
): AddProgressResult {
  let progress = state.progress + (isFinite(points) && points > 0 ? points : 0);
  let pity = state.pity;
  let queue = fill(state.queue.slice(), pity, rng, bias); // guarantee depth before awarding
  const awarded: string[] = [];

  // Award as many boxes as the banked points cover. Guard bounds a pathological bank.
  let guard = 0;
  while (queue.length > 0 && progress >= costOf(queue[0]) && guard++ < 10000) {
    const done = queue[0];
    progress -= costOf(done);
    awarded.push(done);
    pity = updatePity(pity, done); // opening this box advances pity
    queue = fill(queue.slice(1), pity, rng, bias); // slide next forward, roll a fresh (biased) tail
  }

  return { state: { progress, queue, pity }, awarded };
}
