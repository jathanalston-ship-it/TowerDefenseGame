// Shared simulation types. `Def`s are static data (config.ts); the live objects
// below are runtime instances owned by the Game (game.ts). No React/DOM here.

import type { Vec2 } from './math';

export type CombatClass = 'Kinetic' | 'Caustic' | 'Vital';
export type StatusType = 'Fracture' | 'Corrosion';
export type TowerKind = 'needle' | 'mortar' | 'reactor';
export type HeroId = 'ravager'; // roster grows by adding HEROES entries (config.ts)
export type EnemyKind =
  | 'runner'
  | 'brute'
  | 'tyrant'
  | 'rusher' // Fast
  | 'tank' // Tank
  | 'flyer'
  | 'burrower'
  | 'splitter' // bursts into smaller enemies on death
  | 'spitter' // Ranged — shoots the hero from afar
  | 'mender' // Regenerating — heals unless recently hurt
  | 'warden'; // Shielded — a shield soaks damage before HP

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
  elite: boolean; // buffed "champion" spawn (Wave Composer elite injection)
  // status
  fracture: number; // stacks
  corrosion: number; // remaining seconds of corrosion
  slowUntil: number; // sim-time an external slow (reactor aura) expires
  weakenUntil: number; // sim-time the reactor "weaken" mark (+damage taken) expires
  shredFlash: number; // seconds of reaction flash remaining (visual)
  // archetype state
  shield: number; // current shield HP (absorbed before HP); 0 if none
  maxShield: number;
  lastHitTime: number; // sim-time of last damage (gates regen)
  attackCd: number; // ranged-attack cooldown (spitter)
  alive: boolean;
}

/** A projectile fired by a Ranged enemy at the hero. Tiny dedicated list — keeps
 *  the tower Projectile type clean. */
export interface EnemyShot {
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  damage: number;
  alive: boolean;
}

export interface Tower {
  id: number;
  kind: TowerKind;
  x: number;
  y: number;
  slot: number; // tower-slot index it occupies
  cooldown: number; // seconds until next action
  overcharged: boolean; // buffed by an adjacent reactor this tick
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  ox: number; // launch origin (for the mortar's visual arc)
  oy: number;
  tx: number;
  ty: number;
  speed: number;
  targetId: number; // homing target (-1 = positional, e.g. mortar)
  damage: number;
  kind: TowerKind;
  splash: number; // splash radius (0 = single target)
  bounces: number; // remaining ricochets (needle, Ricochet Spores)
  alive: boolean;
}

export interface Pool {
  id: number;
  x: number;
  y: number;
  radius: number;
  dps: number;
  remaining: number; // seconds
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
  facing: number; // radians — smoothed toward the target/movement (for rendering)
  swing: number; // seconds left in the current attack animation
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

/** Permanent currencies, each the buy-currency of one upgrade track. Stage/Classic
 *  pay Shards (Core power) + Components (Equipment); Endless pays Essence (Mastery)
 *  + Catalyst (Prestige). Every currency has a sink, so no earned currency is dead. */
export type Currency = 'shards' | 'essence' | 'components' | 'catalyst';

/** Permanent (meta) multipliers folded into a run at start — the "permanent bucket".
 *  Accumulated from every upgrade track (Core/Mastery/Equipment/Prestige) in meta.ts. */
export interface MetaModifiers {
  towerDamageMult: number;
  towerFireRateMult: number;
  splashMult: number;
  biomassMult: number;
  heroDamageMult: number;
  heroSpeedMult: number;
  integrityBonus: number;
  startBiomass: number;
}

/** Compact snapshot the React HUD reads (throttled). Never the live entity arrays. */
export interface HudSnapshot {
  phase: Phase;
  mode: 'classic' | 'stage' | 'endless';
  wave: number; // 1-based wave the player is on / just finished
  totalWaves: number; // Infinity in endless
  biomeName: string | null;
  biomass: number;
  integrity: number;
  maxIntegrity: number;
  kills: number;
  hero: { down: boolean; respawn: number; hp: number; maxHp: number; abilityReady: boolean };
  enemiesAlive: number;
  draft: CardOption[] | null;
  selectedTower: TowerKind | null;
  armedAbility: boolean;
  objective: { name: string; description: string; done: boolean } | null;
  score: number; // endless score (0 otherwise)
  // Automatic wave flow (Build Phase)
  buildCountdown: number | null; // seconds until auto-start (null = not counting down)
  buildCountdownTotal: number; // full countdown duration (for a progress ring)
  earlyBonus: number; // amount of the most recent early-start biomass bonus
  earlyBonusSeq: number; // bumps each grant — the HUD pops the bonus once per change
  // Build-Phase presentation
  waveSummary: { wave: number; kills: number; biomass: number } | null; // last cleared wave
  incoming: { kind: EnemyKind; count: number; elite: boolean; isBoss: boolean }[]; // next wave preview
}

export interface CardOption {
  id: string;
  name: string;
  rarity: CardRarity;
  description: string;
  category: string;
}
