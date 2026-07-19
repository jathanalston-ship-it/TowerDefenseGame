// TOWER IDLE POSTURES (docs/TOWER-IDLE.md) — the secondary-behavior registry behind the
// three-state contract: COMBAT / PREPARATION / TRANSITION. Every tower kind carries exactly
// ONE row here (validator-enforced); a future tower ships a row or the build fails. The verbs
// are a small reusable vocabulary — per-tower identity lives in the payoff PARAMETERS and the
// presentation, never in per-kind sim forks. Execution: game.towerSystem (+ the bespoke
// beam/trap/summon/support systems); all payouts ride the EXISTING folds (cast globals,
// biomass/integrity chokepoints), so cards/equipment/strains/branches compose by construction.
//
// Pure data module: no DOM, no state imports, no rng.

import { TOWER_DEFS } from './config';
import type { TowerKind } from './types';

export type TowerIdleVerb = 'windup' | 'reserve' | 'ranging' | 'preheat' | 'tending' | 'trickle' | 'choir';

/** The discrete state label derived from the `prep` scalar (UI copy only — the renderer
 *  eases from the scalar itself, so motion never snaps). */
export type TowerIdleState = 'combat' | 'transition' | 'preparation';

export function towerIdleState(prep: number): TowerIdleState {
  return prep < 0.2 ? 'combat' : prep > 0.65 ? 'preparation' : 'transition';
}

/** The opener bundle a WINDUP consumes on re-engagement, scaled by banked charge (0..1).
 *  Multipliers are the FULL-charge values (charge interpolates toward them from ×1). */
export interface IdleOpenBundle {
  dmgMult?: number; // damage × at full charge
  rangeMult?: number; // reach/radius × at full charge (rides castRangeMult — auras included)
  splashMult?: number; // splash × at full charge
  extraProjectiles?: number; // +projectiles/jumps/blades on the opening cast (rounded by charge)
  pierce?: number; // +pierce on the opening cast (rounded by charge)
  statusBonus?: number; // +status amount (stacks/seconds) on the opening cast's applications
}

export interface IdleBehaviorDef {
  kind: TowerKind;
  name: string; // the behavior's display name ("Salivating Gape")
  verb: TowerIdleVerb;
  blurb: string; // one tooltip sentence (Inspector/Codex — auto-consumed, no per-tower UI)
  /** Seconds of preparation to a full bank (windup charge / reserve clutch). Scaled by
   *  RunModifiers.towerIdleChargeMult (the future card/gear hook). */
  chargeTime?: number;
  open?: IdleOpenBundle; // windup payoff
  reserve?: { volleys: number; burstInterval: number }; // reserve payoff (opening burst cadence)
  ranging?: { dmgFrac: number; cadence: number; reachMult: number; splashFrac: number }; // idle suppression fire
  preheat?: { floor: number }; // beam heat floor while unengaged
  tending?: { rateMult?: number; regenMult?: number; capBonus?: number }; // brood/minefield husbandry
  trickle?: { biomassPerSec?: number; integrityPerSec?: number }; // idle economy/repair
  choir?: { radius: number; dmgBonus: number }; // unengaged aura onto nearby towers
}

/** One row per tower kind (docs/TOWER-IDLE.md §3 — the canonical table). Payoff magnitude
 *  scales INVERSELY with range band and charge time scales WITH it (§4): the shortest-reach
 *  towers idle most, so they earn the fastest winds and the biggest openers. */
export const IDLE_BEHAVIORS: Record<TowerKind, IdleBehaviorDef> = {
  needle: {
    kind: 'needle', name: 'Spindle Tension', verb: 'windup', chargeTime: 7,
    open: { dmgMult: 1.6, pierce: 1 },
    blurb: 'Winds its firing gland while nothing is in reach — the opening volley cracks out at ×1.6 damage and pierces.',
  },
  mortar: {
    kind: 'mortar', name: 'Ranged Solution', verb: 'windup', chargeTime: 8,
    open: { dmgMult: 1.35, splashMult: 1.25 },
    blurb: 'Plots a firing solution while the map is quiet — the opening shell lands heavier and wider.',
  },
  reactor: {
    kind: 'reactor', name: 'Systolic Reserve', verb: 'trickle',
    trickle: { integrityPerSec: 0.55 },
    blurb: 'While its neighborhood is calm, the heart knits the Hive back together.',
  },
  parasite: {
    kind: 'parasite', name: 'Spore Drift', verb: 'ranging',
    ranging: { dmgFrac: 0.3, cadence: 3.5, reachMult: 2, splashFrac: 1 },
    blurb: 'With nothing in nesting reach it exhales slow drifting spores far up-lane — weak, but the Infection seeds early.',
  },
  obelisk: {
    kind: 'obelisk', name: 'Stored Scream', verb: 'windup', chargeTime: 5,
    open: { statusBonus: 0.6, rangeMult: 1.2 },
    blurb: 'The silence gathers — its first pulse after waiting disrupts deeper and reaches wider.',
  },
  maw: {
    kind: 'maw', name: 'Salivating Gape', verb: 'windup', chargeTime: 3.5,
    open: { dmgMult: 2, rangeMult: 1.25 },
    blurb: 'Jaws gape wider the longer they hunger — the first bite after waiting is a lunge at double force.',
  },
  chrysalis: {
    kind: 'chrysalis', name: 'Resin Winding', verb: 'windup', chargeTime: 5,
    open: { statusBonus: 0.5 },
    blurb: 'Patience thickens the amber — the first encasement after waiting holds half a second longer.',
  },
  effigy: {
    kind: 'effigy', name: 'Gathering Dread', verb: 'windup', chargeTime: 4.5,
    open: { statusBonus: 0.5, rangeMult: 1.15 },
    blurb: 'Dread pools while the field is quiet — the first wail after waiting panics longer and farther.',
  },
  coil: {
    kind: 'coil', name: 'Harmonic Reserve', verb: 'preheat',
    preheat: { floor: 0.35 },
    blurb: 'Holds a standing harmonic while unengaged — the beam opens a third pre-ramped instead of cold.',
  },
  siphon: {
    kind: 'siphon', name: 'Root Draw', verb: 'trickle',
    trickle: { biomassPerSec: 0.8 },
    blurb: 'Between meals the roots drink the soil — a slow Biomass draw while nothing is dying.',
  },
  sower: {
    kind: 'sower', name: 'Fallow Tilling', verb: 'tending',
    tending: { rateMult: 1.3, capBonus: 1 },
    blurb: 'The gardener works hardest before the wave — planting faster and keeping one extra mine armed while unengaged.',
  },
  spire: {
    kind: 'spire', name: 'Static Accumulation', verb: 'windup', chargeTime: 4,
    open: { extraProjectiles: 2 },
    blurb: 'Banks static while the air is clear — the first arc after waiting leaps two extra victims.',
  },
  polyp: {
    kind: 'polyp', name: 'Deepening Current', verb: 'windup', chargeTime: 3.5,
    open: { dmgMult: 1.5, rangeMult: 1.2 },
    blurb: 'The undertow keeps churning under an empty lane — first contact meets a current that SNAPS.',
  },
  spitfang: {
    kind: 'spitfang', name: 'Belt Feed', verb: 'reserve', chargeTime: 4.5,
    reserve: { volleys: 3, burstInterval: 0.16 },
    blurb: 'Loads a three-round belt while waiting — re-engagement dumps it at full autocannon tempo.',
  },
  rift: {
    kind: 'rift', name: 'Horizon Collapse', verb: 'windup', chargeTime: 3.5,
    open: { dmgMult: 1.6, rangeMult: 1.25 },
    blurb: 'A starved void coils tighter — the first pulse after waiting closes like a fist.',
  },
  glaive: {
    kind: 'glaive', name: 'Whetstone Orbit', verb: 'windup', chargeTime: 6,
    open: { extraProjectiles: 1 },
    blurb: 'The blade hones itself in its cradle — the first throw after waiting flies with a spare wing.',
  },
  roost: {
    kind: 'roost', name: 'Brood Tending', verb: 'tending',
    tending: { rateMult: 1.5, regenMult: 2 },
    blurb: 'A calm leash is mothering time — eggs hatch half again as fast and perched drakes mend at double rate.',
  },
  lung: {
    kind: 'lung', name: 'Deep Inhale', verb: 'windup', chargeTime: 4,
    open: { rangeMult: 1.4, statusBonus: 1 },
    blurb: 'The sac inflates while the air is clean — the first exhale after waiting fogs wider and infects deeper.',
  },
  bell: {
    kind: 'bell', name: 'Sustained Toll', verb: 'windup', chargeTime: 4.5,
    open: { statusBonus: 1, rangeMult: 1.2 },
    blurb: 'The hum never quite dies — the first toll after waiting rings a second Resonance into every body.',
  },
  lancet: {
    kind: 'lancet', name: 'Pressure Draw', verb: 'windup', chargeTime: 7,
    open: { dmgMult: 1.45, pierce: 1 },
    blurb: 'Pressure builds past the stops — the first harpoon after waiting hits harder and passes through.',
  },
  basilisk: {
    kind: 'basilisk', name: 'Lidless Vigil', verb: 'windup', chargeTime: 6,
    open: { statusBonus: 0.4 },
    blurb: 'It was already watching — the first stare after waiting petrifies noticeably longer.',
  },
  ossuary: {
    kind: 'ossuary', name: 'Sepulchral Chorus', verb: 'choir',
    choir: { radius: 250, dmgBonus: 0.05 },
    blurb: 'While its own reach is empty the choir tunes the guns — nearby towers sing +5% damage.',
  },
};

/** Validator laws (docs/TOWER-IDLE.md §8) — bounded magnitudes so a typo can never ship a
 *  runaway idle economy. Wired into the towerIdle test + the validate pipeline via the suite. */
export function towerIdleProblems(): string[] {
  const problems: string[] = [];
  for (const kind of Object.keys(TOWER_DEFS) as TowerKind[]) {
    const row = IDLE_BEHAVIORS[kind];
    if (!row) { problems.push(`${kind}: no idle behavior row`); continue; }
    if (row.kind !== kind) problems.push(`${kind}: row kind mismatch (${row.kind})`);
    if (row.name.length < 3 || row.blurb.length < 20) problems.push(`${kind}: name/blurb too thin`);
    const needsCharge = row.verb === 'windup' || row.verb === 'reserve';
    if (needsCharge && (row.chargeTime === undefined || row.chargeTime < 2 || row.chargeTime > 10)) {
      problems.push(`${kind}: chargeTime out of bounds (2..10s)`);
    }
    const payloads = [row.open, row.reserve, row.ranging, row.preheat, row.tending, row.trickle, row.choir].filter((p) => p !== undefined);
    if (payloads.length !== 1) problems.push(`${kind}: exactly one payoff payload required (${payloads.length})`);
    if (row.verb === 'windup' && !row.open) problems.push(`${kind}: windup requires open`);
    if (row.verb === 'reserve' && !row.reserve) problems.push(`${kind}: reserve requires reserve`);
    if (row.verb === 'ranging' && !row.ranging) problems.push(`${kind}: ranging requires ranging`);
    if (row.verb === 'preheat' && !row.preheat) problems.push(`${kind}: preheat requires preheat`);
    if (row.verb === 'tending' && !row.tending) problems.push(`${kind}: tending requires tending`);
    if (row.verb === 'trickle' && !row.trickle) problems.push(`${kind}: trickle requires trickle`);
    if (row.verb === 'choir' && !row.choir) problems.push(`${kind}: choir requires choir`);
    if (row.open) {
      if (row.open.dmgMult !== undefined && (row.open.dmgMult <= 1 || row.open.dmgMult > 2.5)) problems.push(`${kind}: open.dmgMult out of bounds (1..2.5]`);
      if (row.open.rangeMult !== undefined && (row.open.rangeMult <= 1 || row.open.rangeMult > 1.5)) problems.push(`${kind}: open.rangeMult out of bounds (1..1.5]`);
      if (row.open.splashMult !== undefined && (row.open.splashMult <= 1 || row.open.splashMult > 1.5)) problems.push(`${kind}: open.splashMult out of bounds (1..1.5]`);
      if (row.open.statusBonus !== undefined && (row.open.statusBonus <= 0 || row.open.statusBonus > 1)) problems.push(`${kind}: open.statusBonus out of bounds (0..1]`);
      if (row.open.pierce !== undefined && row.open.pierce > 1) problems.push(`${kind}: open.pierce out of bounds (≤1)`);
      if (row.open.extraProjectiles !== undefined && row.open.extraProjectiles > 2) problems.push(`${kind}: open.extraProjectiles out of bounds (≤2)`);
    }
    if (row.trickle) {
      if ((row.trickle.biomassPerSec ?? 0) > 1) problems.push(`${kind}: trickle.biomassPerSec out of bounds (≤1)`);
      if ((row.trickle.integrityPerSec ?? 0) > 1) problems.push(`${kind}: trickle.integrityPerSec out of bounds (≤1)`);
    }
    if (row.ranging && (row.ranging.dmgFrac > 0.5 || row.ranging.cadence < 2)) problems.push(`${kind}: ranging too strong (dmgFrac ≤0.5, cadence ≥2s)`);
    if (row.choir && row.choir.dmgBonus > 0.1) problems.push(`${kind}: choir.dmgBonus out of bounds (≤0.1)`);
  }
  return problems;
}
