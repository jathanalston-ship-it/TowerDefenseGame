// Universal Power Score (docs/POWER-SCORE.md). ONE monotonic index of total account strength:
// every permanent AND temporary upgrade folds into a single multiplier, scaled to a readable
// integer where a fresh account reads exactly POWER_BASE. It is a FEEDBACK + BALANCING signal,
// not the literal sim damage number — its defining invariant is that any upgrade strictly
// raises it, so the player can ALWAYS tell whether something improved them.
//
// Pure: no DOM/sim/state. Callers derive each contributor's multiplier (from the save / a run)
// and hand them here; the shared `effectsPower` bridge scores equipment and gene-card/branch
// buffs on the SAME footing (both are CardEffect[]), which is what makes the index universal.

import type { CardEffect } from './cards';
import { RARITY_ORDER } from './equipment';
import type { Rarity } from './equipment';

/** A fresh account (all contributor multipliers = 1) reads exactly this. Chosen at 1000 so a
 * typical single upgrade moves the score by a readable handful of points (see the doc). */
export const POWER_BASE = 1000;

// Offense-relevant run-mod fields and how heavily each counts toward Power. Raw offense (damage,
// fire rate) counts fully; secondary offense (splash / DoT / auras / execute) counts partially;
// economy + survivability are weighted lighter; everything else (pure utility, CC, behavior, string
// /flag knobs, and inverse trade-offs like heroCooldownMult / enemyHpRunMult) is 0 — it doesn't move
// Power. Data-driven so a new offense knob is one row. INVARIANT: every POWER_RELEVANT_FIELDS entry
// MUST appear here or in ADD_POWER (enforced by validate.ts → 'power-coverage'); a fresh account is
// unaffected because all these fields default to their neutral value (effectsPower(defaults) === 1).
const FIELD_WEIGHT: Record<string, number> = {
  towerDamageMult: 1,
  heroDamageMult: 1,
  towerFireRateMult: 1,
  splashRadiusMult: 0.5,
  poolDpsMult: 0.5,
  parasiteInfectionMult: 0.4,
  heroAbilityRadiusMult: 0.3,
  lastStandMult: 0.3,
  integrityMult: 0.35, // survivability
  heroMaxHpMult: 0.3, // survivability
  biomassMult: 0.3, // economy
  reactorBiomassMult: 0.25, // economy
};
// `add`-op fields that meaningfully raise offense/strength, expressed as "per unit" multiplier bumps.
const ADD_POWER: Record<string, number> = {
  needleExtraProjectiles: 0.08, // each extra projectile ≈ +8% offense
  heroLifestealFrac: 0.5,
  heroThornsFrac: 0.2,
  heroTowerHasteAura: 0.3,
  heroTowerDamageAura: 0.4,
  executeThreshold: 1.5,
  damagePerTower: 3,
  damagePerEmptySlot: 3,
  classResonanceBonus: 0.5,
  diversityBonus: 0.5,
  fractureBonusStacks: 0.04,
  reactionRepeats: 0.1,
  obeliskVulnerabilityBonus: 0.3,
  reactorOverchargeBonus: 0.1,
};

/** The canonical set of run-modifier fields that represent account STRENGTH — the CONTRACT the Power
 *  index must honor. Every entry MUST be scored by the model above (FIELD_WEIGHT ∪ ADD_POWER), which
 *  `validate.ts` enforces at dev boot: a strength field left unscored is a validation ERROR, so no
 *  strength-affecting content can exist without a Power evaluation. Deliberately EXCLUDES inverse
 *  trade-offs (heroCooldownMult, enemyHpRunMult) and pure utility/CC/behavior knobs. */
export const POWER_RELEVANT_FIELDS: readonly string[] = [
  'towerDamageMult', 'towerFireRateMult', 'heroDamageMult', 'splashRadiusMult', 'poolDpsMult',
  'parasiteInfectionMult', 'heroAbilityRadiusMult', 'lastStandMult', 'integrityMult', 'heroMaxHpMult',
  'biomassMult', 'reactorBiomassMult', 'needleExtraProjectiles', 'heroLifestealFrac', 'heroThornsFrac',
  'heroTowerHasteAura', 'heroTowerDamageAura', 'executeThreshold', 'damagePerTower', 'damagePerEmptySlot',
  'classResonanceBonus', 'diversityBonus', 'fractureBonusStacks', 'reactionRepeats', 'obeliskVulnerabilityBonus',
  'reactorOverchargeBonus',
];

/** The run-modifier fields the Power model currently scores (mul weights ∪ add bumps). */
export function powerModelFields(): Set<string> {
  return new Set([...Object.keys(FIELD_WEIGHT), ...Object.keys(ADD_POWER)]);
}

/** Strength fields the model FAILS to score — must be empty (validate.ts turns a non-empty result
 *  into a 'power-coverage' error). The enforcement point for "no strength content without Power". */
export function uncoveredPowerFields(): string[] {
  const scored = powerModelFields();
  return POWER_RELEVANT_FIELDS.filter((f) => !scored.has(f));
}

/**
 * Fold any CardEffect[] — an equipped loadout, drafted gene cards, or branch grants — into one
 * offense multiplier. This is the bridge that lets equipment and TEMPORARY buffs contribute to
 * Power on the same footing. Multiplicative `mul` fields compound (weighted); `add` fields bump.
 */
export function effectsPower(effects: readonly CardEffect[]): number {
  let mult = 1;
  for (const e of effects) {
    if (e.op === 'mul') {
      const w = FIELD_WEIGHT[e.field];
      if (w) mult *= Math.pow(e.value, w);
    } else if (e.op === 'add') {
      const a = ADD_POWER[e.field];
      if (a) mult *= 1 + a * e.value;
    }
  }
  return mult;
}

/** Flat index contribution of an equipped item from its rarity + affixes, so even a pure-utility
 * piece reads as "power gained" when equipped (rarity 1..5 → +3%..+15%; each affix +1%). */
export function itemRarityPower(rarity: Rarity, affixCount: number): number {
  return 1 + 0.03 * (RARITY_ORDER.indexOf(rarity) + 1) + 0.01 * Math.max(0, affixCount);
}

/** Per-contributor multipliers (each ≥ 1 on a fresh account). Every listed system in the design
 * maps to exactly one of these buckets; `temporary` is 1 outside a run. */
export interface PowerParts {
  meta: number; // permanent meta upgrades × prestige damage bucket
  towers: number; // tower Stars + Mastery (roster geomean)
  heroes: number; // hero Stars + Mastery (roster geomean)
  equipment: number; // equipped loadout (effects + rarity/affixes)
  temporary: number; // in-run buffs: gene cards + branch upgrades (1 outside a run)
}

export interface PowerScore {
  score: number; // the readable integer index (POWER_BASE × mult)
  mult: number; // the raw composite multiplier
  parts: PowerParts; // per-contributor breakdown (drives breakdown tooltips)
}

/** Geometric mean — used to roster-average per-tower / per-hero multipliers so one maxed unit
 * doesn't dominate the index. Guards non-positive inputs to 1. */
export function geomean(vals: number[]): number {
  return vals.length ? Math.exp(vals.reduce((s, v) => s + Math.log(v <= 0 ? 1 : v), 0) / vals.length) : 1;
}

/**
 * Compose the parts into the final Power Score. MULTIPLICATIVE by design: each system scales
 * the others (a Star is worth more when your meta bucket is high), and any single increase
 * strictly raises the total — the core "you always know if it improved you" invariant.
 */
export function composePower(parts: PowerParts): PowerScore {
  const mult = parts.meta * parts.towers * parts.heroes * parts.equipment * parts.temporary;
  return { score: Math.round(POWER_BASE * mult), mult, parts };
}

/** The readable integer, thousands-separated (e.g. 1284 → "1,284"). */
export function formatPower(score: number): string {
  return Math.round(score).toLocaleString();
}
