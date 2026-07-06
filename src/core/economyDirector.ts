// THE ADAPTIVE ECONOMY FRAMEWORK (docs/ECONOMY_FORMULAS.md) — one composition layer for
// every INCOME formula in the game. Progression systems no longer scale the economy
// independently: the settle layer supplies named inputs (mode, difficulty economy, stage,
// prestige, collection, doctrine, adaptive) and this module composes the payout, with a
// FACTOR TRACE so any number can be explained ("why did this run pay 412 Genome Cores?").
//
// Division of labor: the Difficulty Director (difficultyDirector.ts) owns the THREAT side
// and the per-axis POLICIES (difficulty economy scalars, mode identity, doctrine economy,
// loot-quality tier); this module owns the INCOME COMPOSITIONS those policies feed — the
// exact multiplier chains a settle applies. In-run biomass is sim-side (the director's
// bounty curves × the player's build); container/equipment/material DROP TABLES stay data
// (core/loot RARITIES.reward, config CHESTS/EQUIP_DROP_CHANCE) — this module is where their
// RATES compose with progression.
//
// HEALTH MECHANISMS (the adaptive part):
//   • anti-starvation — pity ceilings (core/loot), the progression-aware catch-up bias
//     (core/progressionLoot via the director's lootQualityTier), and the CATCH-UP seam below;
//   • anti-inflation — geometric sink curves (star/upgrade/gene costs; pinned by tests), the
//     Infinite qualify gate, and the AHEAD-TAPER seam below.
// The two seams ride ECONOMY_ADAPTIVE (config.ts) and SHIP AT 0 — an exact ×1 in every chain
// (IEEE-754 identity) — because economy changes must come from progression-simulator evidence
// (docs/PROGRESSION_REPORT.md), the same rule the Difficulty Director pins.
//
// Pure math + named inputs (no save/state imports) — the settle layer, the simulator, and
// the formulas doc all read the SAME composition.

import { ECONOMY_ADAPTIVE, ECON } from './config';
import { LOOT_EARN } from './loot';

/** One named multiplier in an income chain — the unit of the factor trace. */
export interface IncomeFactor {
  id: string; // stable name ("prestige.shardGain", "mode.core", …)
  value: number;
}

/** A composed income: base points × the factor chain, applied LEFT-TO-RIGHT (float order is
 *  part of the contract — settle layers must not re-associate). */
export interface Income {
  base: number;
  factors: IncomeFactor[];
  /** base × factors, left-to-right — the exact legacy multiplication order. */
  total: () => number;
}

function income(base: number, factors: IncomeFactor[]): Income {
  return { base, factors, total: () => factors.reduce((acc, f) => acc * f.value, base) };
}

/** Player-relative adaptive inputs. `powerGap` = (expected/actual − 1) for the account's
 *  frontier: positive when BEHIND the curve (catch-up), negative when ahead (taper). */
export interface EconomyAdaptiveInputs {
  powerGap?: number;
}

/** The adaptive income seam: catch-up boosts a behind account, the taper cools a runaway
 *  one. Exactly 1 while the ECONOMY_ADAPTIVE weights are 0 (golden/meta-test safe). */
export function adaptiveIncomeMult(a?: EconomyAdaptiveInputs): number {
  const gap = a?.powerGap ?? 0;
  return gap >= 0
    ? 1 + ECONOMY_ADAPTIVE.catchUpPerPowerGap * gap
    : 1 / (1 + ECONOMY_ADAPTIVE.aheadTaperPerPowerGap * -gap);
}

// ── Genome Cores (the account currency) — the run-end settle chain ─────────────

export interface CoreShardInputs {
  wave: number;
  kills: number;
  prestigeShardGainMult: number; // ascendant Shard Gain (×1 without the node)
  prestigeCoreGainMult: number; // ascendant Core Gain (×1 without the node)
  stageRewardMult: number; // campaign per-stage reward scalar (1 otherwise)
  endlessRewardMult: number; // difficulty reward × ascendant Infinity (endless only; 1 otherwise)
  modeCoreMult: number; // mode reward identity (difficultyDirector.modeCoreMult)
  doctrineRewardMult: number; // doctrine protocol run-end warp (1 without)
  adaptive?: EconomyAdaptiveInputs;
}

/** Genome Cores earned by a run, BEFORE flat bonuses (first-clear) — floor at the settle. */
export function coreShardIncome(i: CoreShardInputs): Income {
  return income(i.wave * ECON.shardsPerWave + i.kills * ECON.shardsPerKill, [
    { id: 'prestige.shardGain', value: i.prestigeShardGainMult },
    { id: 'prestige.coreGain', value: i.prestigeCoreGainMult },
    { id: 'campaign.stageReward', value: i.stageRewardMult },
    { id: 'difficulty.endlessReward', value: i.endlessRewardMult },
    { id: 'mode.core', value: i.modeCoreMult },
    { id: 'doctrine.reward', value: i.doctrineRewardMult },
    { id: 'adaptive.income', value: adaptiveIncomeMult(i.adaptive) },
  ]);
}

// ── Loot points (Bio-Container meter) — the run-end settle chain ────────────────

export interface LootPointInputs {
  wave: number;
  kills: number;
  prestigeLootGainMult: number; // ascendant Loot Gain (×1 without)
  stageRewardMult: number; // campaign per-stage reward scalar (1 otherwise)
  modeLootMult: number; // mode reward identity (Infinite is the farm)
  containerRateMult: number; // difficulty economy axis (containers fill faster)
  bossLootMult: number; // Bosses codex bonus (×1 on a fresh account)
  endlessTaperMult?: number; // Infinite depth-camping taper (docs/MODE-IDENTITY.md §anti-grind); omitted/1 ⇒ identity
  adaptive?: EconomyAdaptiveInputs;
}

/** Loot points a run banks toward Bio-Containers — floor at the settle. The LIVE meter
 *  (syncRunLoot) uses base × prestige only; the remaining factors settle at run end. */
export function lootPointIncome(i: LootPointInputs): Income {
  return income(i.wave * LOOT_EARN.pointsPerWave + i.kills * LOOT_EARN.pointsPerKill, [
    { id: 'prestige.lootGain', value: i.prestigeLootGainMult },
    { id: 'campaign.stageReward', value: i.stageRewardMult },
    { id: 'mode.loot', value: i.modeLootMult },
    { id: 'difficulty.containerRate', value: i.containerRateMult },
    { id: 'collection.bossLoot', value: i.bossLootMult },
    { id: 'endless.taper', value: i.endlessTaperMult ?? 1 }, // Infinite depth-camping taper (identity elsewhere)
    { id: 'adaptive.income', value: adaptiveIncomeMult(i.adaptive) },
  ]);
}

/** One-line factor trace for debugging/reports: "base 620 × prestige.lootGain 1.1 × …". */
export function explainIncome(inc: Income): string {
  const parts = inc.factors.filter((f) => f.value !== 1).map((f) => `${f.id} ×${f.value}`);
  return `base ${inc.base}${parts.length ? ' × ' + parts.join(' × ') : ''} = ${inc.total()}`;
}
