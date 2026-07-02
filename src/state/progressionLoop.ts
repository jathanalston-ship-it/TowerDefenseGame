// The PROGRESSION LOOP ENGINE (docs/PROGRESSION-LOOP.md) — the read-model that makes the
// intended macro-loop legible and mathematically grounded:
//
//   Campaign advance → WALL → farm Infinite → permanent power → BREAKTHROUGH → repeat.
//
// It classifies where an account stands in that loop from the same models the game already
// trusts: the campaign requirement curve (recommendedPowerScore — geometric in stage), the
// account Power Score (composePower over accountPowerParts), and the Infinite reach estimator
// (core/predict — logarithmic in power). Because requirements are geometric and reach is
// logarithmic, a wall ALWAYS re-forms after every breakthrough (resistance is structural),
// and because farmable power (mastery XP, loot → stars/genes/equipment) is unbounded, every
// wall is finitely breakable (never permanently stuck). Those two facts — plus the
// campaign-only gates and the Infinite farm identity — are pinned as invariants in
// progressionLoop.test.ts, so a future change that breaks the loop breaks the build.
//
// Pure over SaveData (no DOM/sim); like nextGoal.ts it imports meta's derivations one-way and
// is NEVER imported by meta.ts. Surfaces: Results (the wall/breakthrough moment), Campaign
// (readiness meter), Infinite (what this farm feeds).

import type { SaveData } from '../save/saveStore';
import { highestCampaignStage } from '../save/derive';
import { recommendedPowerScore } from '../core/campaign';
import { defaultCalib, predictInfinite } from '../core/predict';
import { composePower } from '../core/power';
import { resolveDifficulty } from '../core/difficulty';
import { accountPowerParts } from './meta';

export type LoopPhase = 'advance-campaign' | 'farm-infinite';

export interface LoopState {
  phase: LoopPhase;
  frontierStage: number; // the next uncleared campaign stage
  requiredPower: number; // its readiness bar (recommendedPowerScore at the given difficulty)
  power: number; // the account's Power Score
  readiness: number; // power / requiredPower — ≥ 1 means the wall is open
  powerShort: number; // Power Score still missing for the frontier (0 when ready)
  farmDepth: number; // estimated Infinite frontier — where farming pays best right now
}

/** Classify the account's position in the Campaign↔Infinite loop. `difficultyId` is the
 *  campaign difficulty being attempted (defaults to the baseline). */
export function loopState(save: SaveData, difficultyId = 'standard'): LoopState {
  const frontierStage = highestCampaignStage(save) + 1;
  const p = composePower(accountPowerParts(save));
  const requiredPower = recommendedPowerScore(frontierStage, difficultyId);
  const readiness = requiredPower > 0 ? p.score / requiredPower : 1;
  const farmDepth = predictInfinite(
    p.mult,
    save.bestWave,
    resolveDifficulty(difficultyId).enemyHealthMult,
    save.prediction?.infinite ?? defaultCalib(),
  ).estimate;
  return {
    phase: readiness >= 1 ? 'advance-campaign' : 'farm-infinite',
    frontierStage,
    requiredPower,
    power: p.score,
    readiness,
    powerShort: Math.max(0, Math.ceil(requiredPower - p.score)),
    farmDepth,
  };
}

/** One-line, screen-ready advice for the loop position — the wall/breakthrough copy shared by
 *  Results, Campaign, and Infinite so the loop reads identically everywhere. */
export function loopAdvice(ls: LoopState): string {
  return ls.phase === 'advance-campaign'
    ? `Power target met — Stage ${ls.frontierStage} is breakable now.`
    : `Stage ${ls.frontierStage} wall: ${ls.powerShort.toLocaleString()} Power short. Farm Infinite (~Depth ${ls.farmDepth}) — loot, Mastery and genes bank permanently.`;
}
