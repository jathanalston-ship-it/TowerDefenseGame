// THE UNIVERSAL DIFFICULTY DIRECTOR (docs/DIFFICULTY_DIRECTOR.md) — the single composition
// layer for every scaling POLICY in the game. Gameplay systems no longer combine balance
// factors inline: the sim, the campaign generator, the meta settle layer, and the UI all ASK
// this module, and it composes the answer from the same data sources every time:
//
//   • DifficultyDef        — the per-mode risk/reward variant (core/difficulty.ts)
//   • DoctrineWarp         — the doctrine protocol's enemy-world reshaping (core/doctrines.ts)
//   • Stage curves         — campaign per-stage geometric scaling (composeStageDifficulty)
//   • Wave/depth curves    — WAVE_*_GROWTH (scripted) and ENDLESS.* (infinite) from config
//   • Mode reward identity — MODE_REWARDS (which mode pays which currency)
//   • Adaptive seams       — power-ratio / recent-performance factors, weight-0 today (see below)
//
// WHERE the factors APPLY (per-wave, per-spawn, per-settle) stays in the owning system — that
// is simulation mechanics, not balance policy. The split matters for byte-identity: the sim
// keeps its exact multiplication order and sources each FACTOR from here, so the golden runs
// are bit-identical while the POLICY lives in one place.
//
// ADAPTIVE SEAMS: `DIRECTOR_ADAPTIVE` (config.ts) weights the player-relative factors
// (powerRatio, recentPerformance) into the threat/reward chains. The weights ship at 0 —
// composed into the formulas as an exact ×1 (IEEE-754 identity) — because balance changes
// must come from the progression simulator, not intuition. Tuning them is a config edit.
//
// Pure data + math: no sim, no DOM, no state imports. Companions: the AI Director
// (core/director.ts) COMPOSES waves under these scalars; the Spawn Director emits them.

import type { DifficultyDef } from './difficulty';
import { resolveDifficulty } from './difficulty';
import type { DoctrineWarp } from './doctrines';
import { resolveDoctrine, DOCTRINES, doctrineRankBonus } from './doctrines';
import type { DoctrineDef } from './doctrines';
import { BOSS, CAMPAIGN_ONBOARDING, DIRECTOR_ADAPTIVE, ENDLESS, MODE_REWARDS, WAVE_BOUNTY_GROWTH, WAVE_HP_GROWTH } from './config';

/** Player-relative inputs for the adaptive factors. All optional; omitted ⇒ neutral (×1).
 *  powerRatio = actual/expected account power for the content (1 = on-curve);
 *  recentPerformance = a signed recent-outcome score (0 = neutral). The progression-loop
 *  engine supplies these; nothing does yet, and the weights are 0 regardless. */
export interface AdaptiveInputs {
  powerRatio?: number;
  recentPerformance?: number;
}

export interface DirectorInputs {
  /** The RESOLVED difficulty for the run — campaign passes its combined per-stage def. */
  difficulty: DifficultyDef;
  /** Doctrine protocol warp; omitted/empty ⇒ no reshaping (zero-RNG, golden-safe). */
  warp?: DoctrineWarp;
  /** Campaign stage's own enemy-speed axis (1 elsewhere). */
  stageEnemySpeedMult?: number;
  adaptive?: AdaptiveInputs;
}

/** One run's scaling policy: every threat curve and economy scalar the run will use,
 *  composed once at construction. Stateless w.r.t. the sim — safe to query at any time. */
export class RunDirector {
  readonly difficulty: DifficultyDef; // warp damage folded ONCE here (the single fold site)
  readonly warp: DoctrineWarp;
  private readonly stageSpeed: number;
  private readonly adaptiveThreat: number; // exact 1 while DIRECTOR_ADAPTIVE weights are 0
  private readonly adaptiveReward: number;

  constructor(inputs: DirectorInputs) {
    const base = inputs.difficulty;
    this.warp = inputs.warp ?? {};
    // Doctrine damage reshapes the run's difficulty once, up front — exactly the old
    // constructor fold in game.ts, now owned here so no system re-implements it.
    this.difficulty = this.warp.damageMult
      ? { ...base, enemyDamageMult: base.enemyDamageMult * this.warp.damageMult }
      : base;
    this.stageSpeed = inputs.stageEnemySpeedMult ?? 1;
    const a = inputs.adaptive;
    this.adaptiveThreat = 1 + DIRECTOR_ADAPTIVE.threatPerPowerRatio * ((a?.powerRatio ?? 1) - 1);
    this.adaptiveReward = 1 + DIRECTOR_ADAPTIVE.rewardPerPerformance * (a?.recentPerformance ?? 0);
  }

  // ── THREAT: static axes (fixed for the run) ────────────────────────────────

  /** Enemy movement: the campaign stage's own axis × the difficulty speed axis. */
  enemySpeedStatic(): number {
    return this.stageSpeed * this.difficulty.enemySpeedMult;
  }

  /** The doctrine's per-wave queue reshaping (hp/bounty/elite/count) — applied by the sim
   *  on its deterministic runEventRng, exactly like run events. */
  queueWarp(): DoctrineWarp {
    return this.warp;
  }

  // ── THREAT: scripted/campaign wave curves (linear — docs/DESIGN.md) ────────

  /** Enemy-HP multiplier for a 0-based wave index (the sim multiplies its run-mods on top). */
  waveHpMult(idx0: number): number {
    return (1 + WAVE_HP_GROWTH * idx0) * this.difficulty.enemyHealthMult * this.adaptiveThreat;
  }

  /** Bounty/biomass multiplier for a 0-based wave index. */
  waveBountyMult(idx0: number): number {
    return (1 + WAVE_BOUNTY_GROWTH * idx0) * this.difficulty.rewardMult * this.adaptiveReward;
  }

  // ── THREAT: endless depth curves (docs/ENDLESS-SCALING.md) ─────────────────
  // The doctrine's scalingRateMult accelerates the DEPTH TERM of all four curves.

  /** GEOMETRIC enemy HP — the primary wall (outpaces any fixed DPS over depth). */
  endlessHpMult(depth: number): number {
    return Math.pow(ENDLESS.hpGrowth, (depth - 1) * (this.warp.scalingRateMult ?? 1)) * this.difficulty.enemyHealthMult * this.adaptiveThreat;
  }

  /** Per-enemy bounty — rises SLOWER than HP, so deep enemies are biomass-inefficient. */
  endlessBountyMult(depth: number): number {
    return (1 + ENDLESS.bountyGrowth * ((depth - 1) * (this.warp.scalingRateMult ?? 1))) * this.difficulty.rewardMult * this.adaptiveReward;
  }

  /** Enemy speed — gradual, CLAMPED for readability (no adaptive term: the cap must bind). */
  endlessSpeedMult(depth: number): number {
    return Math.min(ENDLESS.speedCap, 1 + ENDLESS.speedGrowth * ((depth - 1) * (this.warp.scalingRateMult ?? 1)));
  }

  /** Enemy damage — gradual, continuous. */
  endlessDamageMult(depth: number): number {
    return (1 + ENDLESS.damageGrowth * ((depth - 1) * (this.warp.scalingRateMult ?? 1))) * this.adaptiveThreat;
  }

  /** Procedural endless boss depth-durability (docs/ENDLESS-SCALING.md §boss). Fed to
   *  spawnProceduralBoss as its `strengthScale` (× def.hpMult; contact damage × min(RUSH.damageCap,·)).
   *  ≈1 at the first boss depth, then growing so a DEEP boss is a real centerpiece fight instead of
   *  being out-tanked by its own elite escort (boss HP otherwise scales only +5%/TL). Boss Rush does
   *  NOT use this — its call site passes its own RUSH.strength* ramp, so that mode stays untouched. */
  endlessBossStrength(depth: number): number {
    const past = Math.max(0, depth - ENDLESS.bossFirstDepth) * (this.warp.scalingRateMult ?? 1);
    return Math.min(ENDLESS.bossStrengthCap, 1 + ENDLESS.bossStrengthPerDepth * past);
  }

  // ── ECONOMY: the run-end settle view (docs/DIFFICULTY.md economy axes) ─────

  /** The difficulty's economy scalars (reward/xp/lootQuality/containerRate/equipQuality/powerTarget). */
  economy(): Pick<DifficultyDef, 'rewardMult' | 'xpMult' | 'lootQualityMult' | 'containerRateMult' | 'equipQualityMult' | 'powerTargetMult'> {
    return this.difficulty;
  }
}

export function createDirector(inputs: DirectorInputs): RunDirector {
  return new RunDirector(inputs);
}

// ── Standalone policy queries (no run required) — meta settle, generators, UI ─

/** Resolve a difficulty id to its ECONOMY view (the settle layer's entry point). */
export function economyFor(difficultyId?: string): DifficultyDef {
  return resolveDifficulty(difficultyId);
}

/** Campaign stage composition: fold per-stage scalars onto the chosen difficulty VARIANT.
 *  This IS the campaign's difficulty policy — the generator calls it, the sim consumes it. */
export function composeStageDifficulty(
  base: DifficultyDef,
  sc: { hpMult: number; damageMult: number; spawnMult: number; rewardMult: number },
): DifficultyDef {
  return {
    ...base,
    id: `campaign:${base.id}`,
    enemyHealthMult: base.enemyHealthMult * sc.hpMult,
    enemyDamageMult: base.enemyDamageMult * sc.damageMult,
    spawnRateMult: base.spawnRateMult * sc.spawnMult,
    rewardMult: base.rewardMult * sc.rewardMult,
    // eliteChanceMult / bossFrequencyMult carry from the variant — campaign drives its own
    // elite frequency (per-group flags) and bosses (finale/mini), not the AI Director.
  };
}

/** Campaign ONBOARDING boss strength (docs/DIFFICULTY_DIRECTOR.md §onboarding): the finale boss
 *  of the first stages fields a reduced body, ramping linearly from CAMPAIGN_ONBOARDING's floor at
 *  stage 1 to ×1 at `bossFullStage` (exactly 1 from there — the deep campaign is untouched). */
export function campaignBossStrength(stage: number): number {
  const { bossStrengthFloor: floor, bossFullStage: full } = CAMPAIGN_ONBOARDING;
  if (stage >= full) return 1;
  return floor + ((1 - floor) * (Math.max(1, stage) - 1)) / (full - 1);
}

/** A boss def at `strength`: the BODY (HP, contact damage, armor) and the KIT's magnitudes (every
 *  module `amount` — heal, shield, adds, core-shot) all scale, so a reduced boss is a smaller fight,
 *  not a weaker body that out-heals an opening board. Returns the SAME object at ×1, so an unscaled
 *  stage keeps its exact def (authored bosses are never mutated — scaled copies only). */
export function scaleBossStrength<T extends { hpMult: number; damage: number; armor?: number; modules: readonly { amount?: number }[] }>(def: T, strength: number): T {
  if (strength === 1) return def;
  return {
    ...def,
    hpMult: def.hpMult * strength,
    damage: Math.round(def.damage * strength),
    armor: Math.round((def.armor ?? BOSS.baseArmor) * strength),
    modules: def.modules.map((m) => (m.amount ? { ...m, amount: Math.max(1, Math.round(m.amount * strength)) } : m)),
  };
}

/** Mode reward identity — account-currency multiplier (docs/MODE-IDENTITY.md). */
export function modeCoreMult(flags: { endless: boolean; campaign: boolean; firstClear: boolean; bossRush?: boolean }): number {
  return flags.bossRush
    ? MODE_REWARDS.core.bossRush
    : flags.endless
      ? MODE_REWARDS.core.endless
      : flags.campaign
        ? (flags.firstClear ? MODE_REWARDS.core.campaignFirst : MODE_REWARDS.core.campaignReplay)
        : MODE_REWARDS.core.stage;
}

/** Mode reward identity — loot-point multiplier (Infinite is the farm). */
export function modeLootMult(flags: { endless: boolean; campaign: boolean; bossRush?: boolean }): number {
  return flags.bossRush ? MODE_REWARDS.loot.bossRush : flags.endless ? MODE_REWARDS.loot.endless : flags.campaign ? MODE_REWARDS.loot.campaign : MODE_REWARDS.loot.stage;
}

/** Mode reward identity — Mastery XP multiplier (Infinite pays an endurance bonus). */
export function modeMasteryMult(flags: { endless: boolean; campaign: boolean; bossRush?: boolean }): number {
  return flags.bossRush ? MODE_REWARDS.mastery.bossRush : flags.endless ? MODE_REWARDS.mastery.endless : flags.campaign ? MODE_REWARDS.mastery.campaign : MODE_REWARDS.mastery.stage;
}

/** A doctrine's run-END economy: reward multiplier + Gene Essence payout for waves survived.
 *  `rank` is the account's mastery rank with THIS doctrine (core/doctrines.ts doctrineRank) —
 *  commitment pays a small premium on the doctrine's own lane (rank 0 ⇒ ×1 identity). */
export function doctrineEconomy(doctrineId?: string, rank = 0): { rewardMult: number; essenceFor: (wave: number) => number } {
  const w = resolveDoctrine(doctrineId).warp ?? {};
  return {
    rewardMult: (w.rewardMult ?? 1) * doctrineRankBonus(rank),
    essenceFor: (wave) => (w.essencePerWave ? Math.floor(w.essencePerWave * wave) : 0),
  };
}

/** The progression-loot quality tier: difficulty tilt + prestige Fortune + codex bonus,
 *  composed on one scale (0 = no tilt). Consumed by the loot bias (state/meta lootBiasFor). */
export function lootQualityTier(parts: { difficultyLootQualityMult: number; fortuneMult: number; codexTier: number }): number {
  return Math.max(0, (parts.difficultyLootQualityMult - 1) * 2 + (parts.fortuneMult - 1) * 2 + parts.codexTier);
}

/** Composite 1–5 hazard rating for a configured experiment (difficulty × doctrine warp) —
 *  the Infinite terminal's skulls; any future mode picker reads the same number. */
export function hazardRating(difficultyId: string, doctrine: DoctrineDef = DOCTRINES.none): number {
  const diff = resolveDifficulty(difficultyId);
  const w = doctrine.warp ?? {};
  const load = (diff?.enemyHealthMult ?? 1) * (w.hpMult ?? 1) * (w.damageMult ?? 1) *
    (w.countMult && w.countMult > 1 ? w.countMult : 1) * (w.speedMult ?? 1) * (w.scalingRateMult ?? 1) *
    // Economy DROUGHTS are difficulty too (Famine Protocol): a bounty cut rates like a load rise.
    (w.bountyMult && w.bountyMult < 1 ? 1 + (1 - w.bountyMult) : 1) *
    // Extra elites raise sustained pressure (Experimental Mutation / Predator's Wager).
    (w.eliteChance ? 1 + w.eliteChance * 0.8 : 1);
  return Math.max(1, Math.min(5, Math.round(1 + (load - 1) * 1.4)));
}
