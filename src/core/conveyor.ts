// BIOMORPH CONVEYOR (docs/STRAIN.md §conveyor) — the deployment model. One permanent FAVORITE
// tower is always deployable; every other organism arrives on a living conveyor: it grows,
// occupies one of three queue slots, and the player chooses Deploy / Strain / Discard. When a
// new organism matures against a full queue it auto-enters the Biomass Recycler — nothing is
// wasted. Pure data + helpers here; the Game owns the state and the DEDICATED rng stream
// (docs/STRAIN.md §framework golden-safety: conveyor rolls never touch the gameplay rng).

import type { TowerKind } from './types';
import { TOWER_ORDER } from './config';
import type { Rng } from './rng';

export const CONVEYOR = {
  queueMax: 3, // ready organisms the belt can hold — the next maturity past this recycles
  growSeconds: 14, // base seconds an organism takes to mature
  growWaveFactor: 0.94, // each wave quickens growth slightly (min clamp below)
  growMin: 7, // the belt never outpaces play entirely
  undeployedBias: 1.6, // weight × for kinds NOT currently deployed (mild — randomness stays)
  favoriteBias: 0.4, // the favorite still appears (fuel for strain-merging) but rarely
  // Universal deployment economy (docs/STRAIN.md §economy): ONE curve, no per-tower prices.
  baseCost: 100,
  costGrowth: 1.16, // per deployment this run — smooth compounding
  strainCostMult: [3, 4, 5, 6], // I→II · II→III · III→IV · IV→V, × the CURRENT deploy cost
  recycleFrac: 0.5, // recycler refund = this × baseCost (flat — a compounding refund would be an idle money printer)
  // Rarity ladder: how evolved an organism arrives. Weights shift gently with wave depth.
  rarities: [
    { id: 'common', strain: 1, weight: 70, waveWeight: -0.6 },
    { id: 'uncommon', strain: 1, weight: 24, waveWeight: 0.2 },
    { id: 'rare', strain: 2, weight: 5, waveWeight: 0.3 },
    { id: 'epic', strain: 3, weight: 1, waveWeight: 0.1 },
  ],
} as const;

export type ConveyorRarity = (typeof CONVEYOR.rarities)[number]['id'];

/** One organism on the belt. `readyAt` is sim time; before it the slot renders as growth. */
export interface ConveyorItem {
  id: number;
  kind: TowerKind;
  rarity: ConveyorRarity;
  strain: number; // the strain level it arrives at (deploy) — merging always grants +1 instead
  bornAt: number; // sim time growth began (drives the growth animation)
  readyAt: number; // sim time it matures (≤ now ⇒ ready for Deploy/Strain/Discard)
}

/** The universal deployment cost (docs/STRAIN.md §economy): the nth deployment this run. */
export function deployCost(deployments: number): number {
  return Math.round(CONVEYOR.baseCost * Math.pow(CONVEYOR.costGrowth, deployments));
}

/** The recycler's payout for an overflowed or discarded organism (flat — never compounds). */
export function recycleValue(): number {
  return Math.round(CONVEYOR.baseCost * CONVEYOR.recycleFrac);
}

/** The cost to raise a tower FROM `strain` (1..4) via a conveyor merge — × the current deploy cost. */
export function strainCost(deployments: number, fromStrain: number): number {
  const mult = CONVEYOR.strainCostMult[Math.max(0, Math.min(3, fromStrain - 1))];
  return Math.round(deployCost(deployments) * mult);
}

/** Roll the next organism's kind: mild bias toward kinds not on the board, the favorite
 *  down-weighted (it is always deployable anyway — it appears mostly as strain fuel). */
export function rollKind(rng: Rng, deployed: ReadonlySet<TowerKind>, favorite: TowerKind): TowerKind {
  let total = 0;
  const weights: number[] = [];
  for (const k of TOWER_ORDER) {
    let w = deployed.has(k) ? 1 : CONVEYOR.undeployedBias;
    if (k === favorite) w *= CONVEYOR.favoriteBias;
    weights.push(w);
    total += w;
  }
  let u = rng.next() * total;
  for (let i = 0; i < TOWER_ORDER.length; i++) {
    u -= weights[i];
    if (u < 0) return TOWER_ORDER[i];
  }
  return TOWER_ORDER[TOWER_ORDER.length - 1];
}

/** Roll an organism's rarity (arrival strain) — deeper waves skew slightly richer. */
export function rollRarity(rng: Rng, wave: number): { id: ConveyorRarity; strain: number } {
  let total = 0;
  const ws: number[] = [];
  for (const r of CONVEYOR.rarities) {
    const w = Math.max(0.2, r.weight + r.waveWeight * wave);
    ws.push(w);
    total += w;
  }
  let u = rng.next() * total;
  for (let i = 0; i < CONVEYOR.rarities.length; i++) {
    u -= ws[i];
    if (u < 0) return { id: CONVEYOR.rarities[i].id, strain: CONVEYOR.rarities[i].strain };
  }
  const last = CONVEYOR.rarities[CONVEYOR.rarities.length - 1];
  return { id: last.id, strain: last.strain };
}

/** Growth duration for the organism starting at `wave` (quickens gently, floored). */
export function growDuration(wave: number): number {
  return Math.max(CONVEYOR.growMin, CONVEYOR.growSeconds * Math.pow(CONVEYOR.growWaveFactor, wave));
}
