// Progression-aware loot (docs/LOOT-PROGRESSION.md). The drop system reads the player's ACCOUNT
// STRENGTH and quietly steers rewards so runs feel consistently worthwhile — no long dry spells,
// no accidental power spikes. It composes with the existing pity system (soft/hard guarantees in
// loot.ts / lootQueue.ts): pity stops droughts by TIME; this stops droughts by NEED.
//
// Two subtle levers, both pure and free of any visible percentage:
//   • Catch-up weighting — if your gear/power lags where the game expects you to be for your
//     campaign/wave depth, higher rarities are weighted up (and commons down); if you're ahead,
//     rewards normalize back down. Difficulty nudges it further toward richer drops.
//   • Duplicate protection — when choosing WHICH item drops, already-owned options are weighted
//     down so a drop is more likely to be a near-upgrade than a dead duplicate.
//
// Pure: no DOM/sim/state/rarity-id hardcoding. Callers pass the rarity ids (ascending rank) and
// the strength inputs; the bias is a per-id weight MULTIPLIER consumed by rollRarity.

export const PROG_LOOT = {
  expectBase: 1.0, // expected power multiple at zero progress (a fresh account is "on par")
  expectPerStage: 0.02, // …+2% expected power per unit of progress (campaign stage / half-wave)
  catchupFloor: 0.85, // ahead of the curve → rewards normalize DOWN to at most this factor
  catchupCap: 1.6, // far behind → boost rare+ weights by at most this factor
  difficultyStep: 0.06, // each difficulty tier above Standard tilts odds this much richer
  dupeK: 0.6, // duplicate downweight strength (owned copies divide an option's pick weight)
} as const;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The account power the game EXPECTS for a given progress depth (max of campaign stage and
 * half the best Infinite wave — the two frontiers on one scale). A soft, smooth target. */
export function expectedPower(campaignStage: number, bestWave: number): number {
  const progress = Math.max(0, campaignStage, bestWave * 0.5);
  return PROG_LOOT.expectBase + PROG_LOOT.expectPerStage * progress;
}

/**
 * How hard to steer rewards. >1 = the player is BEHIND the curve (boost rarity); <1 = AHEAD
 * (normalize down); 1 = on par. `actualPower` is the account power MULTIPLE (meta.power().mult).
 * Difficulty tilts the result richer. Clamped so the effect stays subtle and bounded.
 */
export function catchupFactor(expected: number, actual: number, difficultyTier = 0): number {
  const ratio = expected / Math.max(0.01, actual);
  const withDiff = ratio * (1 + PROG_LOOT.difficultyStep * Math.max(0, difficultyTier));
  return clamp(withDiff, PROG_LOOT.catchupFloor, PROG_LOOT.catchupCap);
}

/**
 * Per-rarity weight MULTIPLIERS from a catch-up factor. `idsAscending` is the rarity id list in
 * ascending value (common first). Behind (factor>1) shifts mass UP the tiers (commons ×1/f,
 * mid ×1, high ×f, ×f² …); ahead (factor<1) shifts it back toward commons. factor=1 ⇒ all 1 (a
 * true no-op, so an on-par player rolls the untouched table). Consumed as RollOpts.bias. */
export function rarityBias(idsAscending: readonly string[], factor: number): Record<string, number> {
  const bias: Record<string, number> = {};
  idsAscending.forEach((id, rank) => {
    bias[id] = Math.pow(factor, rank - 1); // rank 0 (common) → f⁻¹; rank 1 → 1; rank 2 → f; …
  });
  return bias;
}

/** Convenience: the full bias from raw strength inputs (see the two functions above). */
export function lootBias(inputs: {
  idsAscending: readonly string[];
  campaignStage: number;
  bestWave: number;
  actualPowerMult: number;
  difficultyTier?: number;
}): Record<string, number> {
  const f = catchupFactor(expectedPower(inputs.campaignStage, inputs.bestWave), inputs.actualPowerMult, inputs.difficultyTier ?? 0);
  return rarityBias(inputs.idsAscending, f);
}

/**
 * Duplicate protection / near-upgrade steering: turn each candidate's owned-count into a pick
 * weight that shrinks with ownership (1 / (1 + k·count)), so an un-owned option is favored and a
 * drop is more likely to matter. Pure; the caller supplies the rng-based selection.
 */
export function dupeWeights(ownedCounts: readonly number[], k = PROG_LOOT.dupeK): number[] {
  return ownedCounts.map((c) => 1 / (1 + k * Math.max(0, c)));
}
