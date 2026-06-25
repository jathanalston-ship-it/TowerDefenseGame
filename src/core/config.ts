// Central balance config — ALL tunables live here (CLAUDE.md: centralize tunables;
// ARCHITECTURE.md §6.2). Systems read these; they never inline magic numbers.
// Every value is an illustrative starting point for the vertical slice.

import type { CombatClass, EnemyKind, TowerKind } from './types';

export const SIM_DT = 1 / 60; // fixed simulation timestep (seconds)

// ── Towers ────────────────────────────────────────────────────────────────
export interface TowerDef {
  kind: TowerKind;
  name: string;
  combatClass: CombatClass;
  cost: number;
  range: number;
  fireInterval: number; // seconds between actions
  damage: number;
  projectileSpeed: number; // px/sec (0 = no projectile)
  splash: number; // splash radius (0 = single target)
  color: string;
  blurb: string;
}

export const TOWER_DEFS: Record<TowerKind, TowerDef> = {
  needle: {
    kind: 'needle',
    name: 'Needle Spitter',
    combatClass: 'Kinetic',
    cost: 100,
    range: 135,
    fireInterval: 0.34,
    damage: 13,
    projectileSpeed: 540,
    splash: 0,
    color: '#5ad1ff',
    blurb: 'Fast single-target. Stacks Fracture (armor shred).',
  },
  mortar: {
    kind: 'mortar',
    name: 'Bone Mortar',
    combatClass: 'Caustic',
    cost: 150,
    range: 175,
    fireInterval: 1.45,
    damage: 20,
    projectileSpeed: 250,
    splash: 56,
    color: '#b6e84a',
    blurb: 'Arcing AoE. Leaves Corrosion pools (DoT + slow).',
  },
  reactor: {
    kind: 'reactor',
    name: 'Flesh Reactor',
    combatClass: 'Vital',
    cost: 120,
    range: 0,
    fireInterval: 0,
    damage: 0,
    projectileSpeed: 0,
    splash: 0,
    color: '#ff7a59',
    blurb: 'Generates biomass; overcharges ADJACENT towers (+dmg, +rate).',
  },
};

export const TOWER_ORDER: TowerKind[] = ['needle', 'mortar', 'reactor'];

// ── Enemies ───────────────────────────────────────────────────────────────
export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  armor: number;
  speed: number; // px/sec
  bounty: number; // biomass on death
  damage: number; // integrity damage at the Nucleus
  radius: number;
  color: string;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  runner: { kind: 'runner', name: 'Skitterling', hp: 36, armor: 0, speed: 72, bounty: 11, damage: 4, radius: 10, color: '#d98cff' },
  brute: { kind: 'brute', name: 'Carrion Brute', hp: 150, armor: 8, speed: 42, bounty: 26, damage: 9, radius: 14, color: '#7b9cff' },
  tyrant: { kind: 'tyrant', name: 'Brood Tyrant', hp: 900, armor: 14, speed: 32, bounty: 180, damage: 45, radius: 26, color: '#ff4d6d' },
};

// Per-wave HP/bounty growth so later waves bite (finite — slice ends at wave 12).
export const WAVE_HP_GROWTH = 0.12; // +12% enemy HP per wave index
export const WAVE_BOUNTY_GROWTH = 0.05;

// ── Waves (threat-budget scripts) ─────────────────────────────────────────
export interface SpawnGroup {
  kind: EnemyKind;
  count: number;
  spacing: number; // seconds between spawns in this group
  delay: number; // seconds before the group starts
}
export type WaveDef = SpawnGroup[];

export const WAVES: WaveDef[] = [
  [{ kind: 'runner', count: 8, spacing: 0.9, delay: 0.5 }],
  [{ kind: 'runner', count: 12, spacing: 0.8, delay: 0.5 }],
  [
    { kind: 'runner', count: 10, spacing: 0.7, delay: 0.4 },
    { kind: 'brute', count: 2, spacing: 1.6, delay: 3.5 },
  ],
  [
    { kind: 'runner', count: 14, spacing: 0.65, delay: 0.4 },
    { kind: 'brute', count: 3, spacing: 1.5, delay: 4.0 },
  ],
  [
    { kind: 'brute', count: 6, spacing: 1.2, delay: 0.5 },
    { kind: 'runner', count: 8, spacing: 0.7, delay: 2.0 },
  ],
  [{ kind: 'runner', count: 22, spacing: 0.45, delay: 0.4 }],
  [
    { kind: 'brute', count: 8, spacing: 1.0, delay: 0.5 },
    { kind: 'runner', count: 10, spacing: 0.6, delay: 1.5 },
  ],
  [
    { kind: 'runner', count: 16, spacing: 0.45, delay: 0.4 },
    { kind: 'brute', count: 6, spacing: 1.1, delay: 2.0 },
  ],
  [
    { kind: 'brute', count: 10, spacing: 0.9, delay: 0.5 },
    { kind: 'runner', count: 14, spacing: 0.5, delay: 1.5 },
  ],
  [
    { kind: 'runner', count: 24, spacing: 0.4, delay: 0.4 },
    { kind: 'brute', count: 6, spacing: 1.0, delay: 3.0 },
  ],
  [
    { kind: 'brute', count: 14, spacing: 0.8, delay: 0.5 },
    { kind: 'runner', count: 16, spacing: 0.45, delay: 2.0 },
  ],
  [
    { kind: 'tyrant', count: 1, spacing: 1, delay: 1.0 },
    { kind: 'brute', count: 8, spacing: 0.9, delay: 2.0 },
    { kind: 'runner', count: 16, spacing: 0.45, delay: 4.0 },
  ],
];

export const TOTAL_WAVES = WAVES.length;

// ── Status & reaction ─────────────────────────────────────────────────────
export const STATUS = {
  fractureMaxStacks: 6,
  fractureArmorShred: 2, // armor removed per stack
  fractureDamageTakenPerStack: 0.04, // +4% damage taken per stack
  corrosionDuration: 3.0, // seconds, refreshed on re-apply
  corrosionDps: 7,
  corrosionArmorShred: 4,
  corrosionSlow: 0.25, // -25% speed while corroded
  // Shred reaction (Fracture + Corrosion):
  shredBase: 22,
  shredPerStack: 9,
  shredArmorBreak: 2.5, // seconds of zero armor
  shredFlash: 0.4,
  // Corrosion pools left by Bone Mortar:
  poolDuration: 3.5,
  poolRadiusFactor: 0.85, // pool radius relative to splash radius
};

// ── Hero (Ravager) ────────────────────────────────────────────────────────
export const HERO = {
  maxHp: 230,
  speed: 115,
  attackRange: 32,
  attackInterval: 0.55,
  attackDamage: 19,
  attackFracture: 1,
  aggroRange: 230,
  leashRadius: 160,
  contactRange: 26, // enemies this close damage the hero
  respawnTime: 8,
  ability: {
    cooldown: 8,
    radius: 72,
    damage: 62,
    fracture: 2,
  },
};

// ── Economy ───────────────────────────────────────────────────────────────
export const ECON = {
  startingBiomass: 220,
  reactorBiomassPerSec: 6,
  overchargeDamage: 0.35, // +35% damage to adjacent towers
  overchargeRate: 0.25, // +25% fire rate to adjacent towers
  baseIntegrity: 100,
  // Run-end rewards (permanent shards):
  shardsPerWave: 8,
  shardsPerKill: 0.4,
};

// ── Battlefield / arena ─────────────────────────────────────────────────────
// Open vertical arena (map.ts owns CELL/COLS/ROWS/WIDTH/HEIGHT). Enemies spawn
// along the TOP edge and dynamically flow toward the BOTTOM edge (the line) via a
// flow field, routing around obstacles — no predetermined path.
export const DEFENSE = {
  fraction: 0.25, // the bottom 25% of the arena is the player's defensive region
};

// Static impassable blocks (grid rects {col,row,w,h}) enemies must navigate
// around. Kept ABOVE the defensive zone and never spanning a full row, so a path
// to the line always exists.
export const OBSTACLES: { col: number; row: number; w: number; h: number }[] = [
  { col: 2, row: 5, w: 4, h: 2 },
  { col: 12, row: 6, w: 4, h: 2 },
  { col: 7, row: 10, w: 4, h: 2 },
  { col: 1, row: 13, w: 3, h: 2 },
  { col: 14, row: 13, w: 3, h: 2 },
];

// Tower placement slots: a regular lattice within the defensive region. The total
// count is derived from the steps; `initialUnlocked` gates how many are usable at
// run start — future upgrades raise it (Game.unlockedSlots).
export const SLOTS = {
  colStep: 2,
  colStart: 1, // columns 1,3,5,… leave gaps for enemies and visual clarity
  rowStep: 2,
  rowOffset: 1, // first slot row sits 1 cell below the defensive line's top
  initialUnlocked: 14,
};

// ── Meta upgrades (permanent, capped — NOT prestige/infinite) ─────────────
export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costMult: number;
}

export const META_UPGRADES: UpgradeDef[] = [
  { id: 'lethality', name: 'Lethal Spores', description: '+8% tower damage per level', maxLevel: 10, baseCost: 30, costMult: 1.55 },
  { id: 'metabolism', name: 'Rich Biomass', description: '+10% in-run biomass income per level', maxLevel: 10, baseCost: 30, costMult: 1.55 },
  { id: 'nucleus', name: 'Reinforced Nucleus', description: '+25 max Integrity per level', maxLevel: 10, baseCost: 25, costMult: 1.5 },
  { id: 'apex', name: 'Apex Genome', description: '+10% hero damage per level', maxLevel: 10, baseCost: 35, costMult: 1.55 },
];
