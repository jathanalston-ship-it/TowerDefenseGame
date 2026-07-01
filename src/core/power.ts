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
// fire rate) counts fully; economy is weighted lighter; everything else (utility/flags) is 0 —
// it doesn't move Power. Data-driven so a new offense knob is one row.
const FIELD_WEIGHT: Record<string, number> = {
  towerDamageMult: 1,
  heroDamageMult: 1,
  towerFireRateMult: 1,
  biomassMult: 0.3,
};
// `add`-op fields that meaningfully raise offense, expressed as "per unit" multiplier bumps.
const ADD_POWER: Record<string, number> = {
  needleExtraProjectiles: 0.08, // each extra projectile ≈ +8% offense
};

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
