// BIOMORPH CONVEYOR (docs/STRAIN.md §conveyor) — the deployment model. One permanent FAVORITE
// tower is always deployable; every other organism arrives on a living conveyor: it grows,
// occupies one of three queue slots, and the player chooses Deploy / Strain / Discard. When a
// new organism matures against a full queue it auto-enters the Biomass Recycler — nothing is
// wasted. Pure data + helpers here; the Game owns the state and the DEDICATED rng stream
// (docs/STRAIN.md §framework golden-safety: conveyor rolls never touch the gameplay rng).

import type { TowerKind } from './types';
import { ENEMY_DEFS, TOWER_ABILITIES, TOWER_DEFS, TOWER_ORDER } from './config';
import type { TowerDef, WaveDef } from './config';
import type { AbilityComponent } from './ability';
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
  costGrowth: 1.11, // per deployment this run — smooth compounding (1.16 priced strain merges out of campaign runs entirely — PROMPT-8 probe finding)
  strainCostMult: [3, 4, 5, 6], // I→II · II→III · III→IV · IV→V, × the strain base below
  strainGrowth: 1.05, // strain costs escalate with deployments on their OWN gentler curve —
  // riding the full deploy compound priced merges out of campaign runs (PROMPT-8 probe)
  recycleFrac: 0.5, // recycler refund = this × baseCost (flat — a compounding refund would be an idle money printer)
  // OPENING ANSWER (§opening — Batch G grind audit): a Campaign run's GIFT organism is rolled from
  // the owned kinds that ANSWER the stage's opening threats (OPENING_ANSWERS below), not the whole
  // roster — the 100 h audit had seed 2's belt win 17/17 deep stages and seed 1's win 0/17.
  openingAnswerFromStage: 4, // Stages 1–3 keep the plain gift: their chip-damage curve is calibrated on it (docs/CAMPAIGN.md §curve)
  openingWaves: 3, // the opening = the first N waves (the ones fought with the opening build)
  packGroup: 4, // a group this large in the opening is a PACK
  areaRadius: 200, // an aura/debuff/explosion/pool reaching this far (or any splash) covers a pack — 170 px brawler jaws don't (harness: no better than a random gift)
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
  /** The run-start GIFT organism (docs/STRAIN.md §conveyor): instantly ready, deploys for 0
   *  without advancing the universal cost curve, and recycles for 0 (free in, free out — it
   *  can never feed the recycler economy). Absent on every belt-grown organism. */
  free?: boolean;
}

/** The universal deployment cost (docs/STRAIN.md §economy): the nth deployment this run. */
export function deployCost(deployments: number): number {
  return Math.round(CONVEYOR.baseCost * Math.pow(CONVEYOR.costGrowth, deployments));
}

/** The recycler's payout for an overflowed or discarded organism (flat — never compounds). */
export function recycleValue(): number {
  return Math.round(CONVEYOR.baseCost * CONVEYOR.recycleFrac);
}

/** The cost to raise a tower FROM `strain` (1..4) via a conveyor merge: the ×3/4/5/6 ladder on
 *  the base cost, escalating gently with this run's deployment count. Late-game sink by design
 *  (Strain V is a run trophy), but reachable — see docs/STRAIN.md §economy. */
export function strainCost(deployments: number, fromStrain: number): number {
  const mult = CONVEYOR.strainCostMult[Math.max(0, Math.min(3, fromStrain - 1))];
  return Math.round(CONVEYOR.baseCost * Math.pow(CONVEYOR.strainGrowth, deployments) * mult);
}

/** Roll the next organism's kind: mild bias toward kinds not on the board, the favorite
 *  down-weighted (it is always deployable anyway — it appears mostly as strain fuel).
 *  `allowed` restricts the pool to the account's OWNED roster (docs/TOWERS.md §expansion);
 *  omitted or all-inclusive ⇒ the historical full-roster stream, byte-identical. */
export function rollKind(rng: Rng, deployed: ReadonlySet<TowerKind>, favorite: TowerKind, allowed?: ReadonlySet<TowerKind>): TowerKind {
  let total = 0;
  const kinds: TowerKind[] = [];
  const weights: number[] = [];
  for (const k of TOWER_ORDER) {
    if (allowed !== undefined && !allowed.has(k)) continue; // locked kinds never grow on the belt
    let w = deployed.has(k) ? 1 : CONVEYOR.undeployedBias;
    if (k === favorite) w *= CONVEYOR.favoriteBias;
    kinds.push(k);
    weights.push(w);
    total += w;
  }
  let u = rng.next() * total;
  for (let i = 0; i < kinds.length; i++) {
    u -= weights[i];
    if (u < 0) return kinds[i];
  }
  return kinds[kinds.length - 1];
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

// ── OPENING ANSWER (docs/STRAIN.md §opening) ────────────────────────────────────────────────
// Threat → answer, both DERIVED FROM DATA: a stage's opening threats come from its first waves'
// enemy defs; a tower's answer class comes from its def + derived ability kit (splash, damaging
// area components, their radii and pull, firing). Never a per-tower list — a new tower or enemy is
// classified by its stats. Fitted on the G1 harness (forced-gift sweep, every owned kind × 7 stages
// × 2 seeds): a damaging DRAG aura lost 0/28 runs in waves 1–3 on the 100 h account (natural roll
// 5/14); AREA damage was the best owned class on the 8 h account (5/24 vs 7/12). Pure CONTROL
// (Effigy's Fear — no damage) was safe early too but turned whole runs into unlosable slogs, so it
// never counts: a pack is answered by killing it, not only stalling it.

/** The opening threats a stage can field. */
export type OpeningThreat = 'pack' | 'air';

/** A DAMAGING aura that also DRAGS the pack up-lane (pull) — its coverage is the whole approach. */
export function dragsAndDamages(kit: readonly AbilityComponent[]): boolean {
  return kit.some((c) => c.type === 'aura' && (c.pull ?? 0) > 0 && (c.damage ?? 0) > 0);
}

/** Does this kit DAMAGE an area — any splash, or a damaging aura/explosion/pool reaching areaRadius? */
export function damagesArea(def: TowerDef, kit: readonly AbilityComponent[]): boolean {
  if (def.splash > 0) return true;
  return kit.some((c) => ((c.type === 'aura' || c.type === 'explosion') && (c.damage ?? 0) > 0 && c.radius >= CONVEYOR.areaRadius)
    || (c.type === 'pool' && c.dps > 0 && c.radius >= CONVEYOR.areaRadius));
}

/** Answer classes, BEST FIRST: the gift rolls from the first class with an owned kind. */
export const OPENING_ANSWER_TIERS: readonly { id: string; answers: (def: TowerDef, kit: readonly AbilityComponent[]) => boolean }[] = [
  { id: 'drag', answers: (_def, kit) => dragsAndDamages(kit) },
  { id: 'area', answers: (def, kit) => damagesArea(def, kit) },
];

/** Threat → the extra condition an answer must meet. Airborne packs ignore obstacles and can't be
 *  body-blocked by minions, so a summoner never counts as an air answer. */
export const OPENING_THREAT_RULES: Record<OpeningThreat, (def: TowerDef) => boolean> = {
  pack: () => true,
  air: (def) => def.firing !== 'summon',
};

/** The opening threats in a stage's first CONVEYOR.openingWaves waves (data-derived). */
export function openingThreats(waves: readonly WaveDef[]): OpeningThreat[] {
  const out: OpeningThreat[] = [];
  const opening = waves.slice(0, CONVEYOR.openingWaves);
  if (opening.some((w) => w.some((g) => g.count >= CONVEYOR.packGroup))) out.push('pack');
  if (opening.some((w) => w.some((g) => ENEMY_DEFS[g.kind].behavior.flying === true))) out.push('air');
  return out;
}

/** The owned kinds (favorite excluded — it is always deployable already) of the BEST answer class
 *  that meets every opening threat's rule, or null when there is no threat / no owned answer (the
 *  caller then rolls the plain owned roster, exactly as before). */
export function openingAnswerKinds(waves: readonly WaveDef[], owned: ReadonlySet<TowerKind>, favorite: TowerKind): Set<TowerKind> | null {
  const threats = openingThreats(waves);
  if (threats.length === 0) return null;
  for (const tier of OPENING_ANSWER_TIERS) {
    const out = new Set<TowerKind>();
    for (const k of TOWER_ORDER) {
      if (!owned.has(k) || k === favorite) continue;
      const def = TOWER_DEFS[k];
      if (tier.answers(def, TOWER_ABILITIES[k]) && threats.every((t) => OPENING_THREAT_RULES[t](def))) out.add(k);
    }
    if (out.size > 0) return out;
  }
  return null;
}
