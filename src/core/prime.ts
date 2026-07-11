// PRIME STRAINS (docs/PRIME-STRAINS.md) — the per-unit INFINITE ladder past max Stars.
// Pure math over config.PRIME: costs are steeply geometric, bonuses small and honestly
// diminishing, and deep levels cross-link the material economy through Catalyst. No state,
// no DOM — meta owns the purchase, towerProgress/heroProgress own the fold, the labs read
// the same closed forms for display.
//
// CLOSED FORMS (the doc's §curves section quotes these):
//   cost(L→L+1)  = round(finalStarCost × costMult × costGrowth^L)      (geometric, growth ≥1.35)
//   mult(L)      = 1 + b·L₀·ln(1 + L/L₀)   b = bonusPerLevel, L₀ = softCapLevels
// mult(0) = 1 EXACTLY (a save with no Prime levels folds to identity — golden-safe), the first
// level is worth the full +b, and the marginal gain of level L is ≈ b/(1 + L/L₀): at L₀ each
// level is worth half the first, at 3·L₀ a quarter — unbounded, but logarithmic.

import { PRIME, STAR } from './config';

export type PrimeLadder = 'tower' | 'hero';

/** The FINAL star's shard price for a ladder — Prime's cost anchor ("the grind continues"). */
export function primeAnchorCost(ladder: PrimeLadder): number {
  return ladder === 'tower'
    ? Math.round(STAR.towerBaseCost * Math.pow(STAR.towerCostMult, STAR.maxTowerStars - 1))
    : Math.round(STAR.heroBaseCost * Math.pow(STAR.heroCostMult, STAR.maxStars - 1));
}

/** Shard cost of buying Prime level `level+1` (i.e. from `level`). Steeply geometric. */
export function primeCost(ladder: PrimeLadder, level: number): number {
  return Math.round(primeAnchorCost(ladder) * PRIME.costMult * Math.pow(PRIME.costGrowth, Math.max(0, level)));
}

/** Catalyst consumed by buying TARGET level `toLevel` (1-indexed). 0 below the first tier;
 *  the highest matching `catalystTiers` row applies (ascending thresholds). */
export function primeCatalystCost(toLevel: number): number {
  let need = 0;
  for (const t of PRIME.catalystTiers) if (toLevel >= t.from) need = t.catalyst;
  return need;
}

/** The damage-equivalent multiplier of `level` Prime levels — the ONE lane the run fold and
 *  Power both consume. Exactly 1 at level 0 (golden-safe identity). */
export function primeMult(level: number): number {
  if (level <= 0) return 1;
  const l0 = PRIME.softCapLevels;
  return 1 + PRIME.bonusPerLevel * l0 * Math.log(1 + level / l0);
}

/** Display helper: the curve's total bonus at `level`, in percent (e.g. 3.7). */
export function primeBonusPct(level: number): number {
  return (primeMult(level) - 1) * 100;
}

/** Display helper: what the NEXT level adds, in percent — the honest diminishing readout. */
export function primeNextGainPct(level: number): number {
  return (primeMult(level + 1) - primeMult(level)) * 100;
}
