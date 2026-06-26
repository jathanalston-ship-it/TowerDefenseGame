// Procedural Stage generation. Stage Mode is FINITE: a stage is generated
// deterministically from a seed by assembling modular components — a biome, an
// arena layout (obstacles + tower-slot pattern + spawn zones), environmental
// modifiers, an optional objective, a reward multiplier, and a finite, budget-
// built wave script. Same seed + stage number → byte-identical stage, forever.
//
// Thousands of combinations: 5 biomes × 4 slot patterns × randomized obstacle
// fields × 1–2 env modifiers (from 9) × optional objective (6) × seed-driven
// waves. Adding a biome/modifier/objective never touches the generator's shape.

import { Rng } from './rng';
import { BIOMES, BIOME_IDS } from './biomes';
import type { BiomeId } from './biomes';
import { COLS, DEFENSE_TOP_ROW, WIDTH, CELL } from './map';
import type { EnemyKind } from './types';
import type { WaveDef, SpawnGroup } from './config';

// ── Environmental modifiers ──────────────────────────────────────────────────
export interface StageMods {
  enemyHpMult: number;
  enemySpeedMult: number;
  towerRangeMult: number;
  towerFireRateMult: number;
  startBiomassBonus: number;
  integrityMult: number;
  extraObstacles: number; // Overgrowth thickens terrain
}

export function defaultStageMods(): StageMods {
  return {
    enemyHpMult: 1,
    enemySpeedMult: 1,
    towerRangeMult: 1,
    towerFireRateMult: 1,
    startBiomassBonus: 0,
    integrityMult: 1,
    extraObstacles: 0,
  };
}

export interface EnvModifier {
  id: string;
  name: string;
  description: string;
  rewardBias: number; // + harder (more reward), − a leg-up (less reward)
  apply: (m: StageMods) => void;
}

export const ENV_MODIFIERS: EnvModifier[] = [
  { id: 'dense-fog', name: 'Dense Fog', description: 'Tower range −18%.', rewardBias: 0.15, apply: (m) => { m.towerRangeMult *= 0.82; } },
  { id: 'frenzied', name: 'Frenzied', description: 'Enemies move 20% faster.', rewardBias: 0.15, apply: (m) => { m.enemySpeedMult *= 1.2; } },
  { id: 'armored-horde', name: 'Armored Horde', description: 'Enemies have 25% more HP.', rewardBias: 0.18, apply: (m) => { m.enemyHpMult *= 1.25; } },
  { id: 'fragile-core', name: 'Fragile Core', description: 'Hive Core integrity −30%.', rewardBias: 0.2, apply: (m) => { m.integrityMult *= 0.7; } },
  { id: 'power-surge', name: 'Power Surge', description: 'Towers fire 18% faster.', rewardBias: -0.12, apply: (m) => { m.towerFireRateMult *= 1.18; } },
  { id: 'reinforced', name: 'Reinforced Walls', description: '+40% Hive Core integrity.', rewardBias: -0.12, apply: (m) => { m.integrityMult *= 1.4; } },
  { id: 'bloom', name: 'Biomass Bloom', description: '+160 starting biomass.', rewardBias: -0.1, apply: (m) => { m.startBiomassBonus += 160; } },
  { id: 'overgrowth', name: 'Overgrowth', description: 'Denser terrain; enemies +10% HP.', rewardBias: 0.1, apply: (m) => { m.enemyHpMult *= 1.1; m.extraObstacles += 2; } },
  { id: 'magnetized', name: 'Magnetized', description: 'Towers +10% rate, enemies +10% speed.', rewardBias: 0.05, apply: (m) => { m.towerFireRateMult *= 1.1; m.enemySpeedMult *= 1.1; } },
];

const ENV_BY_ID = new Map(ENV_MODIFIERS.map((e) => [e.id, e]));
export function envModifier(id: string): EnvModifier | undefined {
  return ENV_BY_ID.get(id);
}

// ── Optional objectives ──────────────────────────────────────────────────────
export type ObjectiveKind = 'flawless' | 'restraint' | 'frugal' | 'slayer' | 'swift';

export interface ObjectiveDef {
  kind: ObjectiveKind;
  name: string;
  /** `target` is interpolated into the description ({t}). */
  describe: (target: number) => string;
  rewardBonus: number; // extra reward multiplier when completed
}

export const OBJECTIVES: Record<ObjectiveKind, ObjectiveDef> = {
  flawless: { kind: 'flawless', name: 'Flawless', describe: () => 'Let nothing breach the line.', rewardBonus: 0.5 },
  restraint: { kind: 'restraint', name: 'Restraint', describe: () => 'Win without using Apex Leap.', rewardBonus: 0.3 },
  frugal: { kind: 'frugal', name: 'Frugal', describe: (t) => `Build no more than ${t} towers.`, rewardBonus: 0.3 },
  slayer: { kind: 'slayer', name: 'Slayer', describe: (t) => `Kill at least ${t} enemies.`, rewardBonus: 0.25 },
  swift: { kind: 'swift', name: 'Swift Extraction', describe: (t) => `Clear in under ${t}s.`, rewardBonus: 0.35 },
};

export interface StageObjective {
  kind: ObjectiveKind;
  target: number; // meaning depends on kind (tower cap / kill goal / seconds)
  name: string;
  description: string;
  rewardBonus: number;
}

// ── Arena layout (consumed by map.ts loadArena) ──────────────────────────────
export type SlotPattern = 'lattice' | 'sparse' | 'clustered' | 'flanks';
export interface ObstacleRect { col: number; row: number; w: number; h: number; }
export interface SpawnZone { x0: number; x1: number; } // px segment along the top edge

export interface ArenaLayout {
  obstacles: ObstacleRect[];
  spawnZones: SpawnZone[];
  slotPattern: SlotPattern;
}

// ── The generated stage ──────────────────────────────────────────────────────
export interface StageDef {
  seed: number;
  stageNumber: number;
  biome: BiomeId;
  name: string;
  layout: ArenaLayout;
  mods: string[]; // env-modifier ids
  objective: StageObjective | null;
  rewardMultiplier: number;
  waves: WaveDef[];
}

// Threat cost per spawnable archetype (drives the wave budget). Tyrant is reserved
// for boss waves and never budget-rolled.
const THREAT_COST: Partial<Record<EnemyKind, number>> = {
  runner: 1, rusher: 1.3, flyer: 2.5, burrower: 2.5, brute: 3, spitter: 3, splitter: 3.5, mender: 4, warden: 5, tank: 6,
};

const SLOT_PATTERNS: SlotPattern[] = ['lattice', 'sparse', 'clustered', 'flanks'];

const STAGE_TITLES = ['Incursion', 'Breach', 'Holdout', 'Descent', 'Quarantine', 'Reclamation', 'Siege', 'Purge', 'Outbreak', 'Vigil'];

/** Generate the obstacle field for a biome's style + density (+ modifier extras). */
function generateObstacles(rng: Rng, biome: BiomeId, extra: number): ObstacleRect[] {
  const def = BIOMES[biome];
  const band = { top: 4, bottom: DEFENSE_TOP_ROW - 2 }; // keep clear of spawn + the line
  const count = Math.round(def.obstacleDensity * 6) + extra;
  const out: ObstacleRect[] = [];
  for (let i = 0; i < count; i++) {
    let w: number;
    let h: number;
    switch (def.obstacleStyle) {
      case 'columns': w = 1 + rng.int(2); h = 2 + rng.int(3); break;
      case 'blocky': w = 3 + rng.int(2); h = 2 + rng.int(2); break;
      case 'organic': w = 1 + rng.int(3); h = 1 + rng.int(2); break;
      default: w = 2 + rng.int(2); h = 1 + rng.int(2); break; // scattered
    }
    w = Math.min(w, COLS - 4);
    // Never start at col 0 or end at the last col — always leave flank lanes.
    const col = 1 + rng.int(Math.max(1, COLS - w - 2));
    const row = band.top + rng.int(Math.max(1, band.bottom - band.top - h));
    out.push({ col, row, w, h });
  }
  return out;
}

/** 1–3 spawn segments along the top edge (deterministic). */
function generateSpawnZones(rng: Rng): SpawnZone[] {
  const margin = CELL;
  const usable = WIDTH - 2 * margin;
  const n = 1 + rng.int(3);
  if (n === 1) return [{ x0: margin, x1: WIDTH - margin }];
  const zones: SpawnZone[] = [];
  const seg = usable / n;
  for (let i = 0; i < n; i++) {
    const base = margin + i * seg;
    const pad = seg * 0.12;
    zones.push({ x0: base + pad, x1: base + seg - pad });
  }
  return zones;
}

/** Budget-built finite wave script weighted by the biome. */
function generateWaves(rng: Rng, biome: BiomeId, stageNumber: number): WaveDef[] {
  const weights = BIOMES[biome].enemyWeights;
  const pool: [EnemyKind, number][] = (Object.keys(weights) as EnemyKind[])
    .filter((k) => THREAT_COST[k] !== undefined)
    .map((k) => [k, weights[k] as number]);
  const waveCount = 7 + rng.int(4) + Math.floor(stageNumber / 4); // ~7–13+
  const waves: WaveDef[] = [];
  for (let w = 0; w < waveCount; w++) {
    let budget = (8 + w * 4) * (1 + stageNumber * 0.12);
    const counts = new Map<EnemyKind, number>();
    let guard = 0;
    while (budget > 1 && guard++ < 400) {
      const kind = rng.pickWeighted(pool);
      const cost = THREAT_COST[kind] as number;
      if (cost > budget && counts.size > 0) break;
      budget -= cost;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    const groups: SpawnGroup[] = [];
    let delay = 0.4;
    for (const [kind, count] of counts) {
      const spacing = THREAT_COST[kind]! < 2 ? 0.45 + rng.range(0, 0.2) : 0.9 + rng.range(0, 0.6);
      groups.push({ kind, count, spacing, delay });
      delay += 0.8 + rng.range(0, 1.2);
    }
    // Mini-boss on the final wave of deeper stages.
    if (w === waveCount - 1 && stageNumber >= 3) {
      groups.push({ kind: 'tyrant', count: 1, spacing: 1, delay: 1.0 });
    }
    waves.push(groups);
  }
  return waves;
}

function pickModifiers(rng: Rng, biome: BiomeId, stageNumber: number): string[] {
  const favored = BIOMES[biome].favoredModifiers;
  // weight favored modifiers higher, then take 1 (early) or up to 2 (deeper) distinct.
  const pairs: [string, number][] = ENV_MODIFIERS.map((m) => [m.id, favored.includes(m.id) ? 3 : 1]);
  const wanted = stageNumber >= 5 ? 1 + rng.int(2) : rng.int(2); // 0–1 early, 1–2 later
  const chosen: string[] = [];
  let guard = 0;
  while (chosen.length < wanted && guard++ < 50) {
    const id = rng.pickWeighted(pairs.filter(([cid]) => !chosen.includes(cid)));
    chosen.push(id);
  }
  return chosen;
}

function maybeObjective(rng: Rng, stageNumber: number, waveCount: number): StageObjective | null {
  if (stageNumber < 2 || !rng.chance(0.55)) return null;
  const kind = rng.pick(Object.keys(OBJECTIVES) as ObjectiveKind[]);
  const def = OBJECTIVES[kind];
  let target = 0;
  if (kind === 'frugal') target = 6 + rng.int(4);
  else if (kind === 'slayer') target = 30 + stageNumber * 10;
  else if (kind === 'swift') target = waveCount * 16;
  return { kind, target, name: def.name, description: def.describe(target), rewardBonus: def.rewardBonus };
}

/**
 * Deterministically assemble a full stage from `(seed, stageNumber)`. Pure — no
 * globals touched; map.ts consumes `layout` separately via loadArena.
 */
export function generateStage(seed: number, stageNumber: number): StageDef {
  const rng = new Rng((seed ^ (stageNumber * 0x9e3779b1)) >>> 0);
  const biome = rng.pick(BIOME_IDS);
  const mods = pickModifiers(rng, biome, stageNumber);
  const stageMods = defaultStageMods();
  for (const id of mods) envModifier(id)?.apply(stageMods);

  const layout: ArenaLayout = {
    obstacles: generateObstacles(rng, biome, stageMods.extraObstacles),
    spawnZones: generateSpawnZones(rng),
    slotPattern: rng.pick(SLOT_PATTERNS),
  };
  const waves = generateWaves(rng, biome, stageNumber);
  const objective = maybeObjective(rng, stageNumber, waves.length);

  const envBias = mods.reduce((s, id) => s + (envModifier(id)?.rewardBias ?? 0), 0);
  const rewardMultiplier = Math.max(0.8, Math.min(3, 1 + envBias + stageNumber * 0.05));

  const title = STAGE_TITLES[(seed + stageNumber) % STAGE_TITLES.length];
  return {
    seed,
    stageNumber,
    biome,
    name: `${BIOMES[biome].name}: ${title}`,
    layout,
    mods,
    objective,
    rewardMultiplier,
    waves,
  };
}

// ── Endless mode wave generation ─────────────────────────────────────────────
// Infinite, ever-escalating waves built from the same budget machinery. Each wave
// index is generated deterministically from the run seed so two runs of the same
// seed are identical, and the budget grows without bound (survival).
export function generateEndlessWave(seed: number, index: number, biome: BiomeId): WaveDef {
  const rng = new Rng((seed ^ ((index + 1) * 0x85ebca77)) >>> 0);
  const weights = BIOMES[biome].enemyWeights;
  const pool: [EnemyKind, number][] = (Object.keys(weights) as EnemyKind[])
    .filter((k) => THREAT_COST[k] !== undefined)
    .map((k) => [k, weights[k] as number]);
  let budget = 10 + index * 5 + index * index * 0.4; // accelerating
  const counts = new Map<EnemyKind, number>();
  let guard = 0;
  while (budget > 1 && guard++ < 1000) {
    const kind = rng.pickWeighted(pool);
    const cost = THREAT_COST[kind] as number;
    if (cost > budget && counts.size > 0) break;
    budget -= cost;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const groups: SpawnGroup[] = [];
  let delay = 0.3;
  for (const [kind, count] of counts) {
    const spacing = THREAT_COST[kind]! < 2 ? 0.35 + rng.range(0, 0.15) : 0.7 + rng.range(0, 0.5);
    groups.push({ kind, count, spacing, delay });
    delay += 0.6 + rng.range(0, 1.0);
  }
  if (index > 0 && index % 5 === 4) groups.push({ kind: 'tyrant', count: 1 + Math.floor(index / 15), spacing: 2, delay: 1.5 });
  return groups;
}
