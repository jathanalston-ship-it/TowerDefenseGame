// DAILY RUN generator (docs/DAILY-RUN.md) — the fourth pillar. One UTC day ⇒ one deterministic
// seed ⇒ the SAME run worldwide: a rolled biome, a 20-wave plan built through the SAME campaign
// machinery (composeStagePlan) so it feels authored, a seeded 3-boss roster + ordering, TWO
// gameplay modifiers, and a 3-tower trial Conveyor pool rolled from the FULL tower registry.
//
// PURE: seeded Rng + smooth formulas, no DOM/sim/audio import (the plan stores only DATA the UI/
// audio layers map). Every roll comes off a DEDICATED sub-stream XOR'd off the day seed (the Game
// ctor convention), so the streams never interfere and a field's roll is stable across releases.

import { Rng } from './rng';
import { DAILY, TOWER_ORDER } from './config';
import type { TowerKind, HeroKind } from './types';
import { BIOMES } from './biomes';
import { hashStr, composeStagePlan, generateStage, recommendedPowerScore } from './campaign';
import type { StageConfig } from './campaign';
import { resolveDifficulty } from './difficulty';
import { assembleBoss } from './boss';
import type { BossDef } from './boss';
import { dailyModifierRegistry, dailyModifierById } from './dailyModifiers';
import { MEGA, megaBossRegistry } from './megaboss';
import { pickLayoutId } from './mapLayouts';
import type { MegaEncounter } from './megaboss';

// XOR constants seeding each sub-stream (distinct per concern — the Game-ctor convention).
const S_STAGE = 0x5764a6e1;
const S_BIOME = 0xb10e0b01;
const S_WAVE = 0x7a5e0c02;
const S_BOSS = 0xb0550d03;
const S_POOL = 0x70010e04;
const S_MOD = 0x0d1f0f05;
const S_MUSIC = 0x0405c610;
const S_HERO = 0x4845524f; // 'HERO'
const S_MEGA = 0x4d454741; // 'MEGA' — the rare Mega variant roll (docs/MEGA-BOSS.md §daily)
const S_LAYOUT = 0x1a70a7e5; // the day's arena layout (docs/MAP-LAYOUTS.md §selection)

/** The fully-rolled plan for one UTC day. All fields are plain data (no live entities), so it
 *  serializes, ships to the UI, and drives the Phase-2 reward/ownership gating unchanged. */
export interface DailyPlan {
  key: string; // UTC ISO date key (YYYY-MM-DD)
  seed: number;
  biomeId: string; // rolled from the BIOMES registry (future biomes auto-included)
  stage: StageConfig; // 20-wave plan (campaign machinery) + the seeded boss roster (bossWaves)
  towerPool: [TowerKind, TowerKind, TowerKind]; // trial towers from the FULL registry (dupes allowed)
  modifierIds: [string, string]; // two DISTINCT registered modifier ids
  musicTrack: number; // seeded combat/boss track index the audio layer maps
  difficultyEstimate: { label: string; scalar: number };
  recommendedPower: number; // recommendedPowerScore scaled by the difficulty scalar
  /** The rare Daily MEGA variant (docs/MEGA-BOSS.md §daily): ~1-in-MEGA.dailyMegaOdds days the
   *  standard 20-wave gauntlet is REPLACED by one evolving Mega Boss encounter. Absent ⇒ normal. */
  megaBoss?: MegaEncounter;
}

/** UTC ISO date key (YYYY-MM-DD) — the identity of a day's run worldwide. */
export function dailyKey(now?: Date): string {
  return (now ?? new Date()).toISOString().slice(0, 10);
}

/** Deterministic day seed — `hashStr('daily:'+key)`, so the whole plan is reproducible. */
export function dailySeed(key: string): number {
  return hashStr('daily:' + key);
}

/** Milliseconds until the next UTC midnight (the Phase-3 reset countdown). */
export function msUntilDailyReset(now?: Date): number {
  const d = now ?? new Date();
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return next - d.getTime();
}

/** Whether `prevKey` is the UTC day immediately before `key` — the streak-continuation test.
 *  Pure date math on the ISO keys (no timezone drift; both keys are UTC by construction). */
export function isPrevDayKey(prevKey: string, key: string): boolean {
  if (!prevKey || !key) return false;
  const prev = Date.parse(prevKey + 'T00:00:00Z');
  const cur = Date.parse(key + 'T00:00:00Z');
  return Number.isFinite(prev) && Number.isFinite(cur) && cur - prev === 86_400_000;
}

/** Roll `count` DISTINCT modifier ids from the registry (never a hardcoded list ⇒ future modifiers
 *  join the pool automatically). Draws without replacement off the given stream. */
function rollModifiers(rng: Rng, count: number): string[] {
  const avail = dailyModifierRegistry.ids();
  const out: string[] = [];
  while (out.length < count && avail.length > 0) {
    out.push(avail.splice(rng.int(avail.length), 1)[0]);
  }
  return out;
}

/**
 * Generate the day plan for `key`. Pure + deterministic in the key. Rolls, in isolated streams:
 * biome, a 20-wave stage plan (reusing the campaign generator for scaling/rewards, overriding
 * waves/biome/bosses), a 3-boss roster ordered by the seed, a 3-tower trial pool, two modifiers,
 * a music track, and the difficulty/recommended-power heuristics.
 */
export function generateDaily(key: string): DailyPlan {
  const seed = dailySeed(key);
  const stageRng = new Rng((seed ^ S_STAGE) >>> 0);
  const biomeRng = new Rng((seed ^ S_BIOME) >>> 0);
  const waveRng = new Rng((seed ^ S_WAVE) >>> 0);
  const bossRng = new Rng((seed ^ S_BOSS) >>> 0);
  const poolRng = new Rng((seed ^ S_POOL) >>> 0);
  const modRng = new Rng((seed ^ S_MOD) >>> 0);
  const musicRng = new Rng((seed ^ S_MUSIC) >>> 0);

  // Effective campaign-stage (drives roster gating + HP/reward scaling) + a rolled HP-scaling
  // scalar (the day-to-day difficulty variance) — both from the DAILY band.
  const effectiveStage = DAILY.stageMin + stageRng.int(DAILY.stageMax - DAILY.stageMin + 1);
  const waveScaling = stageRng.range(DAILY.waveScalingMin, DAILY.waveScalingMax);

  // Biome: registry-driven roll (one FIXED biome for the whole run — no per-wave rotation).
  const biome = biomeRng.pick(BIOMES);

  // Reuse the campaign generator for the scaling/reward/difficulty machinery at the effective
  // stage, then OVERRIDE the run-defining parts (waves, biome, bosses) with the daily rolls.
  const baseStage = generateStage(effectiveStage, 'standard');
  const base = resolveDifficulty('standard');
  const plan = composeStagePlan(waveRng, effectiveStage, biome, base, DAILY.waveCount);

  // Three bosses, ORDER from the seed: two mid-bosses (waves 7 & 14) + the finale (wave 20). Tiers
  // rise with the effective stage; ids are uniquified so concurrent def resolution never collides.
  const [w7, w14, w20] = DAILY.bossWaves;
  const boss1 = assembleBoss(() => bossRng.next(), effectiveStage * 0.5, biome.mods.bossChassisBias);
  const boss2 = assembleBoss(() => bossRng.next(), effectiveStage * 0.75, biome.mods.bossChassisBias);
  const finale = assembleBoss(() => bossRng.next(), effectiveStage, biome.mods.bossChassisBias);
  boss1.id = `${boss1.id}_d${w7}`;
  boss2.id = `${boss2.id}_d${w14}`;
  finale.id = `${finale.id}_d${w20}`;
  const bossWaves: Record<number, BossDef> = { [w7]: boss1, [w14]: boss2 }; // wave 20 is stage.boss

  const stage: StageConfig = {
    ...baseStage,
    biome,
    // The day's arena: a biome-flavored roll on its own stream (the whole world shares it).
    layout: pickLayoutId(new Rng((seed ^ S_LAYOUT) >>> 0), effectiveStage, biome.id),
    modifierName: biome.modifierName,
    hazardName: biome.mods.hazard.name,
    hazardDesc: biome.mods.hazard.desc,
    waveCount: DAILY.waveCount,
    waves: plan.waves,
    enemyPool: plan.enemyPool,
    eliteFrequency: plan.eliteFrequency,
    miniBoss: null,
    miniBossWave: 0,
    boss: finale,
    bossWaves,
    // Fold the rolled wave-scaling scalar onto the stage's own HP scaling (the difficulty variance).
    scaling: { ...baseStage.scaling, enemyHealthMult: baseStage.scaling.enemyHealthMult * waveScaling },
    enemySpeedMult: baseStage.enemySpeedMult,
    startBiomassBonus: 0, // Daily is a challenge mode — no early-stage opening aid
  };

  // Trial-tower Conveyor pool: `poolSize` INDEPENDENT rolls over the FULL registry (dupes allowed) —
  // players meet towers they haven't unlocked (ownership/reward gating is Phase 2, not here).
  const towerPool: TowerKind[] = [];
  for (let i = 0; i < DAILY.poolSize; i++) towerPool.push(poolRng.pick(TOWER_ORDER));

  const modifierIds = rollModifiers(modRng, DAILY.modifierCount);
  const musicTrack = musicRng.int(DAILY.musicTrackCount);

  // The rare Daily MEGA variant (docs/MEGA-BOSS.md §daily): its own stream, so the roll never
  // perturbs any other field. Registry-driven pick ⇒ future megas rotate in automatically; the
  // tier rides the day's effective stage so the encounter scales with the band.
  const megaRng = new Rng((seed ^ S_MEGA) >>> 0);
  const megaRolled = megaRng.int(MEGA.dailyMegaOdds) === 0;
  const megaBoss: MegaEncounter | undefined = megaRolled
    ? { defId: megaRng.pick(megaBossRegistry.active()).id, tier: 1 + effectiveStage / 12 }
    : undefined;

  // Difficulty heuristic: the rolled HP scalar × the modifier severities → a scalar + a label. The
  // recommended Power rides recommendedPowerScore(effectiveStage) scaled by it (readiness gate).
  const sevSum = modifierIds.reduce((s, id) => s + (dailyModifierById(id)?.severity ?? 0), 0);
  const scalar = waveScaling * (1 + 0.12 * sevSum);
  const label = scalar < 1.05 ? 'Routine' : scalar < 1.3 ? 'Tense' : scalar < 1.6 ? 'Harsh' : 'Brutal';
  const recommendedPower = Math.round(recommendedPowerScore(effectiveStage, 'standard') * scalar);

  return {
    key,
    seed,
    biomeId: biome.id,
    stage,
    towerPool: towerPool as [TowerKind, TowerKind, TowerKind],
    modifierIds: modifierIds as [string, string],
    musicTrack,
    difficultyEstimate: { label, scalar },
    recommendedPower,
    ...(megaBoss ? { megaBoss } : {}),
  };
}

/** Deterministically pick the day's hero from the player's UNLOCKED roster. Stable under roster
 *  ORDER (sorts a copy before indexing) and always returns a member of the given roster. */
export function pickDailyHero(seed: number, unlockedHeroes: HeroKind[]): HeroKind {
  const roster = [...unlockedHeroes].sort();
  if (roster.length === 0) return 'ravager'; // never happens in practice (slot 1 is always unlocked)
  return roster[((seed ^ S_HERO) >>> 0) % roster.length];
}
