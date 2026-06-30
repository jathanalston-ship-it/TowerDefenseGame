// Procedural Campaign generator (CAMPAIGN.md). NOT hand-authored: every stage is generated
// deterministically from (stageNumber, difficulty) — same inputs ⇒ same stage, so it's
// predictable enough to balance yet endless without authoring levels. Pure: seeded Rng + smooth
// formulas, no DOM/sim. The Game runs a StageConfig through the existing scripted-wave path
// (`game.ts` 'campaign' mode); stage mode stays byte-identical (golden-safe).

import { CAMPAIGN_REWARDS, ENEMY_DEFS, ENEMY_KINDS, biomeRegistry } from './config';
import type { EnemyDef, SpawnGroup, WaveDef } from './config';
import type { EnemyKind } from './types';
import { Rng } from './rng';
import { assembleBoss } from './boss';
import type { BossDef } from './boss';
import { resolveDifficulty } from './difficulty';
import type { DifficultyDef } from './difficulty';

// ── Tunables (all smooth/continuous in `stage` ⇒ no spikes) ──────────────────────────────────
const C = {
  baseWaves: 6, waveIncEvery: 4, waveMax: 14, // wave count grows a step every few stages
  hpGrowth: 0.07, dmgGrowth: 0.05, // geometric per-stage scaling
  speedGrowth: 0.012, speedCap: 1.6, // capped so fast enemies stay fair
  spawnGrowth: 0.01, spawnCap: 1.5,
  rewardGrowth: 0.05,
  eliteBase: 0.04, elitePerStage: 0.012, eliteCap: 0.45,
  mbBase: 0.1, mbPerStage: 0.03, mbCap: 0.8, mbTierFrac: 0.5, // mini-boss
  baseBudget: 56, stageBudgetGrowth: 0.1, intraBudget: 0.14, // wave threat budget
  threatDivisor: 28, groupMax: 16,
  baseHp: 20, hpPerTier: 72, // enemy unlock-stage gating (tougher enemies arrive later)
  heavyHp: 280, heavyArmor: 12, fastSpeed: 110, // category thresholds
} as const;

const BOSS_VISUAL_KIND: EnemyKind = 'tyrant'; // reserved as the framework-boss render; excluded from the pool

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// ── Biomes (data; self-registered into biomeRegistry). Each leans the roster + adds an
//    intrinsic modifier and a telegraphed hazard. Adding a biome = one row. ──────────────────
type BiomeCategory = 'swarm' | 'fast' | 'heavy' | 'special';
export interface CampaignBiome {
  id: string;
  name: string;
  accent: string;
  bias: Partial<Record<BiomeCategory, number>>; // category weight multipliers (default 1)
  // Biome identity is mechanical via `bias` (roster) + `hazard`; `modifier` is the telegraphed
  // NAME of that character. It deliberately does NOT perturb the scaling curve — that keeps
  // HP/speed/damage/reward a pure, monotonic, spike-free function of stage (CAMPAIGN.md §3).
  modifier: { name: string };
  hazard: { name: string; desc: string };
}

export const BIOMES: CampaignBiome[] = [
  {
    id: 'verdant', name: 'Verdant Hive', accent: 'var(--caustic)',
    bias: { swarm: 1.3, fast: 1.1 },
    modifier: { name: 'Fertile Ground' },
    hazard: { name: 'Spore Bloom', desc: 'Dense growth — swarms come thick and fast.' },
  },
  {
    id: 'necrotic', name: 'Necrotic Mire', accent: 'var(--viral)',
    bias: { special: 1.6, swarm: 1.1 },
    modifier: { name: 'Rot' },
    hazard: { name: 'Miasma', desc: 'Regenerating and special strains thrive in the rot.' },
  },
  {
    id: 'frostbound', name: 'Frostbound Reach', accent: 'var(--kinetic)',
    bias: { heavy: 1.5 },
    modifier: { name: 'Permafrost' },
    hazard: { name: 'Deep Freeze', desc: 'Slow but heavily armored hosts grind the line.' },
  },
  {
    id: 'ashen', name: 'Ashen Warrens', accent: 'var(--vital)',
    bias: { fast: 1.7, swarm: 1.2 },
    modifier: { name: 'Wildfire' },
    hazard: { name: 'Firestorm', desc: 'Fast, aggressive packs race the line.' },
  },
  {
    id: 'carapace', name: 'Carapace Wastes', accent: 'var(--neural)',
    bias: { heavy: 1.6, special: 1.3 },
    modifier: { name: 'Chitin' },
    hazard: { name: 'Shellquake', desc: 'Armored and shielded bulwarks demand shred.' },
  },
  {
    id: 'neural', name: 'Neural Expanse', accent: 'var(--gold)',
    bias: { fast: 1.2, special: 1.4 },
    modifier: { name: 'Overcharge' },
    hazard: { name: 'Static Field', desc: 'Erratic, high-pressure assaults from every angle.' },
  },
];
biomeRegistry.registerAll(BIOMES.map((b) => ({ id: b.id, name: b.name })));

// ── Enemy classification (derived from stats ⇒ a new enemy auto-slots; future-proof) ──────────
function categoryOf(e: EnemyDef): BiomeCategory {
  if (e.shieldHp || e.regenPerSec || e.summon || e.siege || e.explodeRadius || e.auraRadius) return 'special';
  if (e.hp >= C.heavyHp || e.armor >= C.heavyArmor) return 'heavy';
  if (e.speed >= C.fastSpeed) return 'fast';
  return 'swarm';
}
function unlockStage(e: EnemyDef): number {
  return clamp(1 + Math.floor((e.hp - C.baseHp) / C.hpPerTier), 1, 80);
}
function spacingFor(cat: BiomeCategory): number {
  return cat === 'swarm' ? 0.5 : cat === 'fast' ? 0.45 : cat === 'heavy' ? 1.3 : 0.9;
}

// ── Combined scaling ──────────────────────────────────────────────────────────────────────────
export interface StageScaling { hpMult: number; damageMult: number; spawnMult: number; rewardMult: number; speedMult: number }

function stageScaling(stage: number): StageScaling {
  const s = stage - 1;
  return {
    hpMult: Math.pow(1 + C.hpGrowth, s), // geometric — smooth + strictly monotonic, no spikes
    damageMult: Math.pow(1 + C.dmgGrowth, s),
    spawnMult: Math.min(C.spawnCap, 1 + C.spawnGrowth * s),
    rewardMult: 1 + C.rewardGrowth * s,
    speedMult: Math.min(C.speedCap, 1 + C.speedGrowth * s),
  };
}

/** Fold the per-stage scalars onto the chosen difficulty VARIANT → the DifficultyDef the Game runs. */
function combineDifficulty(base: DifficultyDef, sc: StageScaling): DifficultyDef {
  return {
    ...base,
    id: `campaign:${base.id}`,
    enemyHealthMult: base.enemyHealthMult * sc.hpMult,
    enemyDamageMult: base.enemyDamageMult * sc.damageMult,
    spawnRateMult: base.spawnRateMult * sc.spawnMult,
    rewardMult: base.rewardMult * sc.rewardMult,
    // eliteChanceMult / bossFrequencyMult carry from the variant — campaign drives its own
    // elite frequency (per-group flags) and bosses (finale/mini), not the Director.
  };
}

// ── The generated stage ─────────────────────────────────────────────────────────────────────
export interface StageConfig {
  stage: number;
  difficulty: string;
  biome: { id: string; name: string; accent: string };
  modifierName: string;
  hazardName: string;
  hazardDesc: string;
  waveCount: number;
  waves: WaveDef[];
  enemyPool: EnemyKind[];
  eliteFrequency: number;
  miniBoss: BossDef | null;
  miniBossWave: number;
  boss: BossDef;
  scaling: DifficultyDef; // combined variant×stage → Game's `this.diff`
  enemySpeedMult: number;
  rewardMult: number; // end-of-run shard/loot multiplier (currency + loot quality)
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministic seed from (stage, difficulty) — same inputs ⇒ the same stage forever. */
export function stageSeed(stage: number, difficultyId: string): number {
  return (Math.imul(stage >>> 0, 2654435761) ^ hashStr(difficultyId)) >>> 0;
}

function weightedPick(rng: Rng, pool: EnemyKind[], weights: number[]): EnemyKind {
  let total = 0;
  for (const w of weights) total += w;
  let u = rng.next() * total;
  for (let i = 0; i < pool.length; i++) { u -= weights[i]; if (u < 0) return pool[i]; }
  return pool[pool.length - 1];
}

/** Spend a threat budget on weighted picks from the pool → an ordered WaveDef. */
function composeWave(rng: Rng, budget: number, pool: EnemyKind[], weights: number[], eliteFreq: number): WaveDef {
  const groups: SpawnGroup[] = [];
  let remaining = budget;
  let delay = rng.range(0.4, 0.7);
  let guard = 0;
  while (remaining > 0 && guard++ < 10) {
    const kind = weightedPick(rng, pool, weights);
    const def = ENEMY_DEFS[kind];
    const cost = Math.max(1, Math.round(def.hp / C.threatDivisor));
    const count = clamp(Math.min(C.groupMax, Math.floor(remaining / cost), rng.range(3, 9)), 1, C.groupMax);
    remaining -= count * cost;
    groups.push({ kind, count, spacing: spacingFor(categoryOf(def)), delay, elite: rng.chance(eliteFreq) || undefined });
    delay += rng.range(1.6, 3.2);
  }
  if (groups.length === 0) groups.push({ kind: pool[0], count: 6, spacing: 0.6, delay: 0.5 });
  return groups;
}

/**
 * Generate a campaign stage. Pure + deterministic in (stage, difficultyId). See CAMPAIGN.md.
 */
export function generateStage(stage: number, difficultyId = 'standard'): StageConfig {
  const st = Math.max(1, Math.floor(stage));
  const rng = new Rng(stageSeed(st, difficultyId));
  const biome = biomeForStage(st); // contiguous biome regions (BIOME_REGION stages each)
  const base = resolveDifficulty(difficultyId);
  const sc = stageScaling(st);

  // Roster: stage-gated, biome-biased (exclude the boss-visual kind).
  const pool = (ENEMY_KINDS as EnemyKind[]).filter((k) => k !== BOSS_VISUAL_KIND && unlockStage(ENEMY_DEFS[k]) <= st);
  if (pool.length === 0) pool.push('runner');
  const weights = pool.map((k) => biome.bias[categoryOf(ENEMY_DEFS[k])] ?? 1);

  const waveCount = Math.min(C.waveMax, C.baseWaves + Math.floor((st - 1) / C.waveIncEvery));
  const eliteFrequency = clamp(C.eliteBase + C.elitePerStage * st, 0, C.eliteCap) * base.eliteChanceMult;
  const miniBossChance = clamp(C.mbBase + C.mbPerStage * st, 0, C.mbCap) * base.bossFrequencyMult;

  const budget0 = C.baseBudget * (1 + C.stageBudgetGrowth * (st - 1));
  const waves: WaveDef[] = [];
  for (let w = 1; w <= waveCount; w++) {
    const finale = w === waveCount;
    const budget = budget0 * (1 + C.intraBudget * (w - 1)) * (finale ? 0.55 : 1); // boss carries the finale
    waves.push(composeWave(rng, budget, pool, weights, eliteFrequency));
  }

  // Mini-boss (a middle wave) + the finale boss — both via the framework boss assembler, so the
  // pool/selection/difficulty all come from boss.ts (difficulty rides the tier `tl`).
  const rngFn = (): number => rng.next();
  const hasMiniBoss = rng.chance(miniBossChance) && waveCount >= 3;
  const miniBoss = hasMiniBoss ? assembleBoss(rngFn, Math.max(1, st * C.mbTierFrac)) : null;
  const miniBossWave = Math.max(2, Math.ceil(waveCount / 2));
  const boss = assembleBoss(rngFn, st);

  return {
    stage: st,
    difficulty: difficultyId,
    biome: { id: biome.id, name: biome.name, accent: biome.accent },
    modifierName: biome.modifier.name,
    hazardName: biome.hazard.name,
    hazardDesc: biome.hazard.desc,
    waveCount,
    waves,
    enemyPool: pool,
    eliteFrequency,
    miniBoss,
    miniBossWave,
    boss,
    scaling: combineDifficulty(base, sc),
    enemySpeedMult: sc.speedMult,
    rewardMult: sc.rewardMult * base.rewardMult,
  };
}

// ── World-map read models (CAMPAIGN-MAP / docs/MODE-IDENTITY.md §3) ────────────────────────────
// Pure, LIGHT (no wave generation) + deterministic in stage number, so the living map is a windowed
// view over an unbounded procedural ladder — thousands of stages, zero authoring, no redesign.

/** Stages per biome REGION — biomes occupy contiguous bands of the map (a region, not every-other
 *  stage), so the world reads as zones you cross. Appending a biome extends the planet's depth. */
export const BIOME_REGION = 5;

/** The biome a stage belongs to. Regions cycle through BIOMES; appending a biome extends the world. */
export function biomeForStage(stage: number): CampaignBiome {
  return BIOMES[Math.floor((Math.max(1, Math.floor(stage)) - 1) / BIOME_REGION) % BIOMES.length];
}

/** Recommended account Power Score for a stage — SAME scale as meta.powerScore() (1.0 = fresh),
 *  derived from the stage's combined HP×damage scaling so "am I strong enough?" is a glance. */
export function recommendedPower(stage: number, difficultyId = 'standard'): number {
  const sc = stageScaling(Math.max(1, Math.floor(stage)));
  const base = resolveDifficulty(difficultyId);
  return Math.sqrt(sc.hpMult * base.enemyHealthMult * sc.damageMult * base.enemyDamageMult);
}

export interface CampaignMapNode {
  stage: number;
  biome: { id: string; name: string; accent: string };
  state: 'cleared' | 'current' | 'locked';
  milestone: boolean; // a CAMPAIGN_REWARDS.milestoneEvery checkpoint (bonus reward + a map landmark)
  recommendedPower: number;
}

/** A WINDOWED slice of the campaign for the map — `cleared` = highest cleared on this difficulty
 *  track; renders `count` nodes from `viewStart` (1-based). O(count), independent of total depth. */
export function campaignMapView(cleared: number, difficultyId: string, viewStart: number, count: number): CampaignMapNode[] {
  const start = Math.max(1, Math.floor(viewStart));
  const out: CampaignMapNode[] = [];
  for (let i = 0; i < count; i++) {
    const stage = start + i;
    const b = biomeForStage(stage);
    out.push({
      stage,
      biome: { id: b.id, name: b.name, accent: b.accent },
      state: stage <= cleared ? 'cleared' : stage === cleared + 1 ? 'current' : 'locked',
      milestone: stage % CAMPAIGN_REWARDS.milestoneEvery === 0,
      recommendedPower: recommendedPower(stage, difficultyId),
    });
  }
  return out;
}
