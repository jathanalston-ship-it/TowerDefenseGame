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
  heroAttackSpeedMult: 1, // hero attack/pulse cadence — raw offense (Hero Evolution)
  heroHealingMult: 0.2, // sustain — survivability weight (Hero Evolution)
  splashRadiusMult: 0.5,
  poolDpsMult: 0.5,
  parasiteInfectionMult: 0.4,
  heroAbilityRadiusMult: 0.3,
  lastStandMult: 0.3,
  integrityMult: 0.35, // survivability
  heroMaxHpMult: 0.3, // survivability
  biomassMult: 0.3, // economy
  reactorBiomassMult: 0.25, // economy
  // Permanent-upgrade axes the "did buying this make me stronger?" invariant requires: ability uptime
  // and effective-damage-vs-tougher-enemies are INVERSE (lower value = stronger ⇒ NEGATIVE weight, so a
  // buff raises Power and a trade-off downside lowers it); mobility/engagement count lightly.
  heroCooldownMult: -0.4, // lower cooldown ⇒ more ability casts ⇒ more offense
  enemyHpRunMult: -0.4, // softer enemies ⇒ more effective damage
  heroSpeedMult: 0.15, // mobility ⇒ survival + uptime
  heroAggroRangeMult: 0.1, // wider engagement ⇒ more effective DPS
};
// `add`-op fields that meaningfully raise offense/strength, expressed as "per unit" multiplier bumps.
const ADD_POWER: Record<string, number> = {
  needleExtraProjectiles: 0.08, // each extra projectile ≈ +8% offense
  heroLifestealFrac: 0.5,
  heroThornsFrac: 0.2,
  heroCritChance: 0.5, // Hero Evolution — expected-damage from crit rate
  heroCritDamageBonus: 0.3, // Hero Evolution — bigger crits
  heroArmor: 0.5, // Hero Evolution — flat damage-prevention (survivability)
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
  startBiomassBonus: 0.0003, // flat starting biomass — economy tempo; small per-unit so a big grant ≈ a few %
  sellRefundFrac: 0.2, // tower sell refund — economy flexibility (a small but real advantage)
};

/** The canonical set of run-modifier fields that represent account STRENGTH — the CONTRACT the Power
 *  index must honor. Every entry MUST be scored by the model above (FIELD_WEIGHT ∪ ADD_POWER), which
 *  `validate.ts` enforces at dev boot: a strength field left unscored is a validation ERROR, so no
 *  strength-affecting content can exist without a Power evaluation. Inverse fields (heroCooldownMult,
 *  enemyHpRunMult) ARE scored — with negative weights, so a buff raises Power — because permanent
 *  upgrades tune them; only pure cosmetic / flag / string knobs remain unscored. */
export const POWER_RELEVANT_FIELDS: readonly string[] = [
  'towerDamageMult', 'towerFireRateMult', 'heroDamageMult', 'splashRadiusMult', 'poolDpsMult',
  'parasiteInfectionMult', 'heroAbilityRadiusMult', 'lastStandMult', 'integrityMult', 'heroMaxHpMult',
  'biomassMult', 'reactorBiomassMult', 'needleExtraProjectiles', 'heroLifestealFrac', 'heroThornsFrac',
  'heroTowerHasteAura', 'heroTowerDamageAura', 'executeThreshold', 'damagePerTower', 'damagePerEmptySlot',
  'classResonanceBonus', 'diversityBonus', 'fractureBonusStacks', 'reactionRepeats', 'obeliskVulnerabilityBonus',
  'reactorOverchargeBonus', 'startBiomassBonus',
  // Permanent-upgrade axes (inverse fields scored with negative weights; mobility/economy lightly):
  'heroCooldownMult', 'enemyHpRunMult', 'heroSpeedMult', 'heroAggroRangeMult', 'sellRefundFrac',
  // Hero Evolution axes (in-run biomass sink; every one moves Power — docs/HERO-EVOLUTION.md):
  'heroAttackSpeedMult', 'heroCritChance', 'heroCritDamageBonus', 'heroHealingMult', 'heroArmor',
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

/** Each permanent build slot ≈ +5% account offense (one more tower on the field). */
export const META_SLOT_POWER = 0.05;

/** Each UNLOCKED hero slot beyond the first ≈ +10% account offense — fielding a whole extra
 *  champion is undeniable strength (the hero-slot twin of META_SLOT_POWER; found by the same
 *  audit that fixed branches). Folded into the meta bucket in accountPowerParts. */
export const HERO_SLOT_POWER = 0.1;

/** Each purchased in-run Tower Branch TIER ≈ +5% run offense. Branch tiers are build-defining
 *  capability buys whose grants are mostly invisible to effectsPower (the Task 9 lesson), so —
 *  like equipment rarity (itemRarityPower) — they score by a flat heuristic weight. A maxed
 *  5-tier tower reads ≈ +25%; the scoring-vehicle effect below feeds the TEMPORARY bucket. */
export const BRANCH_TIER_POWER = 0.05;

/** The run's purchased branch tiers as a scoring-vehicle effect (consumed ONLY by the Power fold —
 *  game.powerEffects() is never applied to the sim). [] at 0 tiers keeps a branchless run exact. */
export function branchPowerEffects(totalTiers: number): CardEffect[] {
  if (totalTiers <= 0) return [];
  return [{ op: 'mul', field: 'towerDamageMult', value: 1 + BRANCH_TIER_POWER * totalTiers }];
}

/** The permanent-meta contributions the `towerDamageMult` proxy does NOT already capture, scored so
 * that EVERY permanent upgrade moves Power (the coverage guarantee): hero-damage upgrades, biomass,
 * integrity, and build slots. Weights mirror `effectsPower`. Prestige/Ascendant global damage is
 * excluded here (it is counted once via `towerDamageMult`), so pass the UPGRADE-only hero multiple.
 * Neutral input (1 / 1 / 1 / 0) → 1, so a fresh account still reads exactly POWER_BASE. */
export function metaExtrasPower(s: {
  heroDamageUpgradeMult: number; // hero damage from meta upgrades ONLY (prestige/ascendant excluded)
  biomassMult: number;
  integrityMult: number; // (baseIntegrity + integrityBonus) / baseIntegrity
  bonusSlots: number;
}): number {
  return Math.pow(Math.max(0, s.heroDamageUpgradeMult) || 1, FIELD_WEIGHT.heroDamageMult)
    * Math.pow(Math.max(0, s.biomassMult) || 1, FIELD_WEIGHT.biomassMult)
    * Math.pow(Math.max(0, s.integrityMult) || 1, FIELD_WEIGHT.integrityMult)
    * (1 + META_SLOT_POWER * Math.max(0, s.bonusSlots));
}

/** Per-contributor multipliers (each ≥ 1 on a fresh account). Every listed system in the design
 * maps to exactly one of these buckets; `temporary` is 1 outside a run. */
export interface PowerParts {
  meta: number; // permanent meta upgrades × prestige damage bucket
  towers: number; // tower Stars + Mastery (roster geomean)
  heroes: number; // hero Stars + Mastery (roster geomean)
  equipment: number; // equipped loadout (effects + rarity/affixes)
  collection: number; // codex completion across categories (1 on a fresh account)
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
  const mult = parts.meta * parts.towers * parts.heroes * parts.equipment * parts.collection * parts.temporary;
  return { score: Math.round(POWER_BASE * mult), mult, parts };
}

/** The readable integer, thousands-separated (e.g. 1284 → "1,284"). */
export function formatPower(score: number): string {
  return Math.round(score).toLocaleString();
}
