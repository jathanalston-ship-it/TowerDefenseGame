// Shared simulation types. `Def`s are static data (config.ts); the live objects
// below are runtime instances owned by the Game (game.ts). No React/DOM here.

import type { Vec2 } from './math';

export type CombatClass = 'Kinetic' | 'Caustic' | 'Vital';
export type StatusType = 'Fracture' | 'Corrosion';
export type TowerKind = 'needle' | 'mortar' | 'reactor';
export type EnemyKind = 'runner' | 'brute' | 'tyrant' | 'rusher' | 'tank' | 'flyer' | 'burrower';

/** How a tower delivers its attack — drives the firing/projectile dispatch, so a
 * new tower that reuses a behavior is data-only (no sim code). 'support' = no fire. */
export type TowerFiring = 'homing' | 'splash' | 'support';
/** What a live projectile does on the field (a subset of TowerFiring that flies). */
export type ProjectileBehavior = 'homing' | 'splash';

/** Run phase. A run is: prep -> wave -> draft -> prep ... -> won | lost. */
export type Phase = 'prep' | 'wave' | 'draft' | 'won' | 'lost';

export type CardRarity = 'common' | 'rare';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  baseArmor: number;
  speed: number; // px/sec at full speed
  bounty: number; // biomass on death
  damage: number; // integrity damage if it reaches the bottom edge (the line)
  // status
  fracture: number; // stacks
  corrosion: number; // remaining seconds of corrosion
  shredFlash: number; // seconds of reaction flash remaining (visual)
  alive: boolean;
  lastHitKind: TowerKind | null; // tower kind of the last damaging hit (mastery: kill credit)
}

export interface Tower {
  id: number;
  kind: TowerKind;
  x: number;
  y: number;
  slot: number; // tower-slot index it occupies
  cooldown: number; // seconds until next action
  overcharged: boolean; // buffed by an adjacent reactor this tick
  bornAt: number; // sim-time placed (drives the grow-in animation)
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  targetId: number; // homing target id (-1 = positional, e.g. splash)
  damage: number;
  behavior: ProjectileBehavior;
  splash: number; // splash radius (0 = single target)
  alive: boolean;
  sourceKind: TowerKind | null; // tower kind that fired it (mastery: damage credit)
}

export interface Pool {
  id: number;
  x: number;
  y: number;
  radius: number;
  dps: number;
  remaining: number; // seconds
  sourceKind: TowerKind | null; // tower kind that spawned it (mastery: damage credit)
}

export interface Hero {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  down: boolean;
  respawn: number; // seconds until respawn when down
  rally: Vec2;
  attackCd: number;
  abilityCd: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number; // seconds remaining
}

/** Cosmetic particle (pooled, capped). Never affects gameplay determinism. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

/** Permanent (meta) multipliers folded into a run at start — the "permanent bucket". */
export interface MetaModifiers {
  towerDamageMult: number;
  biomassMult: number;
  heroDamageMult: number;
  integrityBonus: number;
}

/** Per-tower-kind permanent multipliers (stars + mastery), applied at build time.
 * Identity (all 1) for a fresh save, so the base game is unchanged. */
export interface TowerMods {
  damageMult: number;
  fireRateMult: number;
}
export type TowerProgress = Record<TowerKind, TowerMods>;

/** Per-tower-kind usage signals a run accrues for mastery (pure observation — never
 * feeds back into the sim; banked into permanent XP at run end). */
export interface MasteryCount {
  kills: number;
  damage: number;
  activeTime: number; // tower-seconds deployed
}
export type MasteryCounts = Record<TowerKind, MasteryCount>;

/** Compact snapshot the React HUD reads (throttled). Never the live entity arrays. */
export interface HudSnapshot {
  phase: Phase;
  wave: number; // 1-based wave the player is on / just finished
  totalWaves: number;
  biomass: number;
  integrity: number;
  maxIntegrity: number;
  kills: number;
  hero: {
    down: boolean;
    respawn: number;
    hp: number;
    maxHp: number;
    abilityReady: boolean;
    abilityCd: number;
    abilityCdMax: number;
  };
  enemiesAlive: number;
  draft: CardOption[] | null;
  selectedTower: TowerKind | null;
  armedAbility: boolean;
  cards: CardOption[]; // gene cards drafted this run (build panel)
  buffs: string[]; // human-readable active run modifiers
}

export interface CardOption {
  id: string;
  name: string;
  rarity: CardRarity;
  description: string;
  category: string;
}
