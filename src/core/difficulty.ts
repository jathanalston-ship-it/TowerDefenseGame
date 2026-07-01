// Universal difficulty framework. ONE place that expresses how hard a run is AND how richly it
// pays, so every game mode (Campaign, Infinite, Stage, and every FUTURE mode) references the SAME
// knobs instead of hardcoding difficulty math. A DifficultyDef is a set of global SCALARS layered
// ON TOP of the base balance curves (config.ts) — it never edits them. The default 'standard' is
// IDENTITY (every scalar 1), so the shipping game — and the golden tests — are byte-identical
// (×1 is an IEEE-754 no-op). Pure data: no sim, no DOM; difficulties self-register like all content.
//
// The scalars split into two groups:
//   • THREAT (consumed by the sim / campaign / director): health, damage, SPEED, spawn, elite, boss.
//   • ECONOMY (consumed by the meta layer at run end): reward, XP, loot quality, container rate,
//     equipment quality, and the recommended-power target. Harder ⇒ tougher AND richer, so a
//     difficulty is a genuine risk/reward trade, not just a wall.
//
// A new mode inherits all of this for free: resolve a DifficultyDef, hand its threat scalars to the
// run and read its economy scalars at settle time. No mode reimplements "make it harder / richer".

import { Registry } from './registry';

export interface DifficultyDef {
  id: string;
  name: string;
  blurb: string;
  // ── Threat (sim / campaign / director) ──
  enemyHealthMult: number; // × enemy HP
  enemyDamageMult: number; // × enemy integrity/contact damage
  enemySpeedMult: number; // × enemy movement speed
  spawnRateMult: number; // × spawn cadence (>1 = tighter spacing → faster pressure)
  eliteChanceMult: number; // × elite-promotion chance
  bossFrequencyMult: number; // × how often (mini)bosses appear
  // ── Economy (meta settle) ──
  rewardMult: number; // × bounty + biomass + Genome Cores income
  xpMult: number; // × Mastery XP earned
  lootQualityMult: number; // × the progression-loot rarity bias (better containers)
  containerRateMult: number; // × loot points banked (containers fill faster)
  equipQualityMult: number; // × equipment drop-rarity odds
  powerTargetMult: number; // × the recommended-power bar for a stage (the readiness gate)
}

export const STANDARD_DIFFICULTY = 'standard';

/** Every economy scalar of the identity difficulty, for concise preset spreads below. */
const ECON_IDENTITY = { rewardMult: 1, xpMult: 1, lootQualityMult: 1, containerRateMult: 1, equipQualityMult: 1, powerTargetMult: 1 };

/** The baseline. Every scalar is 1 → the run plays and pays exactly like the un-scaled game. */
export const STANDARD: DifficultyDef = {
  id: 'standard',
  name: 'Standard',
  blurb: 'The baseline balance — the numbers as designed.',
  enemyHealthMult: 1,
  enemyDamageMult: 1,
  enemySpeedMult: 1,
  spawnRateMult: 1,
  eliteChanceMult: 1,
  bossFrequencyMult: 1,
  ...ECON_IDENTITY,
};

// Graduated band. Threat and economy rise together so harder is always a risk/reward trade.
// Numbers are the balance surface; the architecture (one referenced def, no inline math) is the
// invariant. `standard` MUST stay identity (golden-safe).
export const DIFFICULTIES: Record<string, DifficultyDef> = {
  relaxed: {
    id: 'relaxed',
    name: 'Relaxed',
    blurb: 'Softer enemies and gentler pacing for onboarding — modestly leaner rewards.',
    enemyHealthMult: 0.8, enemyDamageMult: 0.8, enemySpeedMult: 0.92, spawnRateMult: 0.9, eliteChanceMult: 0.5, bossFrequencyMult: 0.8,
    rewardMult: 0.9, xpMult: 0.9, lootQualityMult: 0.9, containerRateMult: 0.9, equipQualityMult: 0.9, powerTargetMult: 0.85,
  },
  standard: STANDARD,
  hardened: {
    id: 'hardened',
    name: 'Hardened',
    blurb: 'Tougher, faster hosts and tighter spawns — richer payouts across the board.',
    enemyHealthMult: 1.35, enemyDamageMult: 1.2, enemySpeedMult: 1.08, spawnRateMult: 1.15, eliteChanceMult: 1.5, bossFrequencyMult: 1.2,
    rewardMult: 1.25, xpMult: 1.2, lootQualityMult: 1.2, containerRateMult: 1.15, equipQualityMult: 1.15, powerTargetMult: 1.2,
  },
  brutal: {
    id: 'brutal',
    name: 'Brutal',
    blurb: 'A serious test — heavy health, frequent elites and bosses, markedly better loot.',
    enemyHealthMult: 1.8, enemyDamageMult: 1.45, enemySpeedMult: 1.18, spawnRateMult: 1.3, eliteChanceMult: 2.0, bossFrequencyMult: 1.5,
    rewardMult: 1.5, xpMult: 1.45, lootQualityMult: 1.5, containerRateMult: 1.3, equipQualityMult: 1.35, powerTargetMult: 1.5,
  },
  nightmare: {
    id: 'nightmare',
    name: 'Nightmare',
    blurb: 'Endgame masochism for fully-geared hives — the richest rewards in the game.',
    enemyHealthMult: 2.6, enemyDamageMult: 1.8, enemySpeedMult: 1.3, spawnRateMult: 1.5, eliteChanceMult: 2.5, bossFrequencyMult: 2.0,
    rewardMult: 2.0, xpMult: 1.8, lootQualityMult: 2.0, containerRateMult: 1.5, equipQualityMult: 1.6, powerTargetMult: 2.0,
  },
};

const POSITIVE_LEVERS: (keyof DifficultyDef)[] = [
  'enemyHealthMult', 'enemyDamageMult', 'enemySpeedMult', 'spawnRateMult', 'eliteChanceMult', 'bossFrequencyMult',
  'rewardMult', 'xpMult', 'lootQualityMult', 'containerRateMult', 'equipQualityMult', 'powerTargetMult',
];

/** Per-def invariants (shared with validate.ts and the registry's own `validate()`). */
export function difficultyProblems(d: DifficultyDef): string[] {
  const out: string[] = [];
  for (const k of POSITIVE_LEVERS) {
    const v = d[k] as number;
    if (!Number.isFinite(v)) out.push(`'${k}' must be finite`);
    else if (v <= 0) out.push(`'${k}' must be > 0`);
  }
  return out;
}

// Difficulties self-register; lookups resolve by id via the registry (modding-open).
export const difficultyRegistry = new Registry<DifficultyDef>('difficulty', {
  idOf: (d) => d.id,
  validate: difficultyProblems,
});
difficultyRegistry.registerAll(Object.values(DIFFICULTIES));

// Registration order isn't ascending value (standard sits mid-object), so pin an explicit
// easy→hard order for the pickers.
export const DIFFICULTY_ORDER = ['relaxed', 'standard', 'hardened', 'brutal', 'nightmare'];
export const DIFFICULTY_IDS: string[] = DIFFICULTY_ORDER.filter((id) => difficultyRegistry.has(id));

/** Resolve a difficulty id to its def; unknown/omitted falls back to Standard (identity). */
export function resolveDifficulty(id?: string): DifficultyDef {
  if (!id) return STANDARD;
  return difficultyRegistry.get(id) ?? STANDARD;
}
