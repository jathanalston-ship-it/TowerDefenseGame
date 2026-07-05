// BIO-ROULETTE (docs/BOSS-RUSH.md §roulette) — the Boss Rush-exclusive second reward ceremony.
// PURE model: spore math, the fresh-per-run weighted board, and the outcome rolls live here;
// the canvas ceremony (ui/BioRoulette.tsx) is presentation over pre-rolled outcomes, and the
// meta layer (meta.grantRouletteRewards) owns the one-click collection.
//
// Design contract (docs/BOSS-RUSH.md §roulette): NOT a casino — a living biomechanical organ.
// Spores are earned by PLAY (new lifetime-record bosses + volume), outcomes are weighted (never
// uniform), and every spore pays SOMETHING — the wheel decides how big, not whether.

import type { TowerKind } from '../core/types';

// ── Tunables ────────────────────────────────────────────────────────────────────────────────
export const ROULETTE = {
  slots: 12, // pods on the wheel (≥10 by design; grows freely — the renderer lays out any count)
  sporesPerRecordBoss: 1, // one spore per NEW lifetime-record boss this run …
  sporesPerVolume: 5, // … +1 per this many bosses felled this run (volume lane, farmable-but-small)
  sporeCap: 40, // ceremony sanity cap (a 40-spore launch is already ~30s of theater)
} as const;

// ── Rewards ─────────────────────────────────────────────────────────────────────────────────
export type RouletteReward =
  | { kind: 'cores'; qty: number }
  | { kind: 'ichor'; qty: number }
  | { kind: 'towerShards'; tower: TowerKind; qty: number }
  | { kind: 'heroShards'; hero: string; qty: number }
  | { kind: 'scrap'; qty: number }
  | { kind: 'geneEssence'; qty: number }
  | { kind: 'equipment'; rarity: 'epic' | 'legendary' }
  | { kind: 'container'; rarity: string };

export interface RouletteSlot {
  id: string;
  label: string; // pod label ("8× Needle Samples", "Epic Bio-Gear", …)
  short: string; // tiny in-pod label ("8◈", "GEAR", …)
  weight: number; // outcome weight (never uniform — commons dominate)
  color: string; // pod accent
  reward: RouletteReward;
}

/** Spore math from the parts finishRun already computed (rushProgress.newRecordBosses). */
export function sporesFromParts(newRecordBosses: number, bossKills: number): number {
  const volume = Math.floor(Math.max(0, bossKills) / ROULETTE.sporesPerVolume);
  return Math.min(ROULETTE.sporeCap, Math.max(0, Math.floor(newRecordBosses)) + volume);
}

/** Spores earned by a settled Boss Rush run: record delta + a volume trickle.
 *  Record lane mirrors the Ichor bands (docs/BOSS-RUSH.md §ichor): only NEW lifetime-record
 *  bosses count, so the big payday follows a personal best — volume keeps every run warm. */
export function sporesFor(prevBestBoss: number, bossKills: number): number {
  return sporesFromParts(Math.floor(bossKills) - Math.max(0, Math.floor(prevBestBoss)), bossKills);
}

/** The roster the board may draw from (owned content only — mirrors the Splice Market). */
export interface RouletteRoster {
  towers: readonly TowerKind[];
  heroes: readonly string[];
}

const pick = <T>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const int = (rng: () => number, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));

/**
 * A FRESH board every run — 12 weighted pods. Composition (weights in parens, Σ≈100):
 * tower/hero shards dominate (the grind currencies), cores + scrap + essence fill the middle,
 * a small Ichor pod tempts, Bio-Gear is VERY rare (2) and a Bio-Container EXTREMELY rare (1).
 * Extend by pushing more pods — the renderer + outcome roll are count-agnostic.
 */
export function rollBoard(rng: () => number, roster: RouletteRoster): RouletteSlot[] {
  const towers = roster.towers.length > 0 ? roster.towers : (['needle'] as TowerKind[]);
  const heroes = roster.heroes.length > 0 ? roster.heroes : ['ravager'];
  const pods: Omit<RouletteSlot, 'id'>[] = [];
  const tower = (qty: number, weight: number): void => {
    const t = pick(rng, towers);
    pods.push({ label: `${qty}× Tower Samples`, short: `${qty}◈`, weight, color: 'var(--kinetic)', reward: { kind: 'towerShards', tower: t, qty } });
  };
  const hero = (qty: number, weight: number): void => {
    const h = pick(rng, heroes);
    pods.push({ label: `${qty}× Hero Genome`, short: `${qty}✶`, weight, color: 'var(--vital)', reward: { kind: 'heroShards', hero: h, qty } });
  };
  tower(int(rng, 3, 6), 15);
  tower(int(rng, 7, 12), 9);
  tower(int(rng, 14, 20), 4);
  hero(int(rng, 1, 2), 12);
  hero(int(rng, 3, 5), 5);
  pods.push({ label: `${int(rng, 3, 5)} Genome Cores`, short: 'CORE', weight: 14, color: 'var(--gold)', reward: { kind: 'cores', qty: int(rng, 3, 5) } });
  pods.push({ label: `${int(rng, 8, 12)} Genome Cores`, short: 'CORE+', weight: 6, color: 'var(--gold)', reward: { kind: 'cores', qty: int(rng, 8, 12) } });
  pods.push({ label: `${int(rng, 2, 4)}× Scrap`, short: '◳', weight: 12, color: 'var(--muted)', reward: { kind: 'scrap', qty: int(rng, 2, 4) } });
  pods.push({ label: `${int(rng, 6, 12)} Gene Essence`, short: '⌬', weight: 11, color: 'var(--caustic, #6ad1b0)', reward: { kind: 'geneEssence', qty: int(rng, 6, 12) } });
  pods.push({ label: `${int(rng, 2, 3)} Ichor`, short: '◆', weight: 9, color: 'var(--viral)', reward: { kind: 'ichor', qty: int(rng, 2, 3) } });
  const gearRarity = rng() < 0.8 ? ('epic' as const) : ('legendary' as const);
  pods.push({ label: `${gearRarity === 'epic' ? 'Epic' : 'Legendary'} Bio-Gear`, short: 'GEAR', weight: 2, color: 'var(--r-epic)', reward: { kind: 'equipment', rarity: gearRarity } });
  const contRarity = rng() < 0.7 ? 'rare' : rng() < 0.85 ? 'epic' : 'legendary';
  pods.push({ label: `${contRarity[0].toUpperCase()}${contRarity.slice(1)} Bio-Container`, short: 'VAULT', weight: 1, color: 'var(--r-legendary)', reward: { kind: 'container', rarity: contRarity } });
  return pods.map((p, i) => ({ id: `pod${i}`, ...p }));
}

/** One weighted outcome roll — the slot index a spore will settle into. */
export function rollOutcome(rng: () => number, board: RouletteSlot[]): number {
  const total = board.reduce((a, s) => a + s.weight, 0);
  let r = rng() * total;
  for (let i = 0; i < board.length; i++) {
    r -= board[i].weight;
    if (r < 0) return i;
  }
  return board.length - 1;
}

/** Pre-roll every spore's destination (the ceremony steers the physics to these). */
export function rollOutcomes(rng: () => number, board: RouletteSlot[], spores: number): number[] {
  return Array.from({ length: spores }, () => rollOutcome(rng, board));
}

/** Aggregate landed rewards for the summary panel (stable label order, quantities merged). */
export function summarizeRewards(board: RouletteSlot[], outcomes: number[]): { label: string; color: string; count: number }[] {
  const byPod = new Map<number, number>();
  for (const o of outcomes) byPod.set(o, (byPod.get(o) ?? 0) + 1);
  return [...byPod.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, count]) => ({ label: board[i].label, color: board[i].color, count }));
}
