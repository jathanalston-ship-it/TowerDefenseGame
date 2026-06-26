// Universal difficulty framework. ONE place that expresses how hard a run is, so every
// game mode (Stage, Endless, and every FUTURE mode) references the SAME knobs instead of
// hardcoding difficulty math in the sim. A DifficultyDef is a set of global SCALARS layered
// ON TOP of the base balance curves (config.ts) — it never edits them — covering the six
// canonical levers: enemy health, enemy damage, spawn rate, elite chance, reward, and boss
// frequency. The default 'standard' is IDENTITY (every scalar 1), so the shipping game — and
// the golden tests — are byte-identical (×1 / no clamp change is an IEEE-754 no-op). Pure
// data: no sim, no DOM; difficulty self-registers under the content registry like all content.
//
// A new mode inherits difficulty for free: it just resolves a DifficultyDef and hands it to
// the run (RunOptions.difficulty). No mode reimplements "make enemies tougher".

import { Registry } from './registry';

/** The six canonical difficulty levers (all multiplicative; 1 = no change). */
export interface DifficultyDef {
  id: string;
  name: string;
  blurb: string;
  enemyHealthMult: number; // × enemy HP
  enemyDamageMult: number; // × enemy integrity/contact damage
  spawnRateMult: number; // × spawn cadence (>1 = tighter spacing → faster pressure)
  eliteChanceMult: number; // × elite-promotion chance (Director / endless)
  rewardMult: number; // × bounty + biomass income
  bossFrequencyMult: number; // × how often (mini)bosses appear (>1 = more often)
}

export const STANDARD_DIFFICULTY = 'standard';

/** The baseline. Every scalar is 1 → the run plays exactly like the un-scaled game. */
export const STANDARD: DifficultyDef = {
  id: 'standard',
  name: 'Standard',
  blurb: 'The baseline balance — the numbers as designed.',
  enemyHealthMult: 1,
  enemyDamageMult: 1,
  spawnRateMult: 1,
  eliteChanceMult: 1,
  rewardMult: 1,
  bossFrequencyMult: 1,
};

// Preset band for future modes. Illustrative starting points — the architecture (one
// referenced def, no inline difficulty math) is the deliverable, not the exact numbers.
export const DIFFICULTIES: Record<string, DifficultyDef> = {
  standard: STANDARD,
  relaxed: {
    id: 'relaxed',
    name: 'Relaxed',
    blurb: 'Softer enemies and gentler pacing — onboarding / practice.',
    enemyHealthMult: 0.8,
    enemyDamageMult: 0.8,
    spawnRateMult: 0.9,
    eliteChanceMult: 0.5,
    rewardMult: 1.1,
    bossFrequencyMult: 0.8,
  },
  hardened: {
    id: 'hardened',
    name: 'Hardened',
    blurb: 'Tougher hosts, tighter spawns, richer payouts.',
    enemyHealthMult: 1.35,
    enemyDamageMult: 1.2,
    spawnRateMult: 1.15,
    eliteChanceMult: 1.5,
    rewardMult: 1.25,
    bossFrequencyMult: 1.2,
  },
  brutal: {
    id: 'brutal',
    name: 'Brutal',
    blurb: 'A serious test — heavy health, frequent elites and bosses.',
    enemyHealthMult: 1.8,
    enemyDamageMult: 1.45,
    spawnRateMult: 1.3,
    eliteChanceMult: 2.0,
    rewardMult: 1.5,
    bossFrequencyMult: 1.5,
  },
  nightmare: {
    id: 'nightmare',
    name: 'Nightmare',
    blurb: 'Endgame masochism — for fully-geared hives chasing leaderboards.',
    enemyHealthMult: 2.6,
    enemyDamageMult: 1.8,
    spawnRateMult: 1.5,
    eliteChanceMult: 2.5,
    rewardMult: 2.0,
    bossFrequencyMult: 2.0,
  },
};

/** Per-def invariants (shared with validate.ts and the registry's own `validate()`). */
export function difficultyProblems(d: DifficultyDef): string[] {
  const out: string[] = [];
  const positive: (keyof DifficultyDef)[] = [
    'enemyHealthMult',
    'enemyDamageMult',
    'spawnRateMult',
    'eliteChanceMult',
    'rewardMult',
    'bossFrequencyMult',
  ];
  for (const k of positive) {
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

export const DIFFICULTY_IDS: string[] = difficultyRegistry.ids();

/** Resolve a difficulty id to its def; unknown/omitted falls back to Standard (identity). */
export function resolveDifficulty(id?: string): DifficultyDef {
  if (!id) return STANDARD;
  return difficultyRegistry.get(id) ?? STANDARD;
}
