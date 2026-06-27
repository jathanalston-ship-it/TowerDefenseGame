// Shared simulation types. `Def`s are static data (config.ts); the live objects
// below are runtime instances owned by the Game (game.ts). No React/DOM here.

import type { Vec2 } from './math';
import type { ActiveStatus } from './status';
import type { AbilityComponent } from './ability';
import type { TargetingProfile } from './targeting';

export type CombatClass = 'Kinetic' | 'Caustic' | 'Viral' | 'Neural' | 'Vital';
export type StatusType = 'Fracture' | 'Corrosion' | 'Infection' | 'Disruption';
export type TowerKind = 'needle' | 'mortar' | 'reactor' | 'parasite' | 'obelisk';
export type EnemyKind =
  // swarm
  | 'runner' | 'mite' | 'larva'
  // fast
  | 'rusher' | 'darter' | 'lasher'
  // heavy
  | 'brute' | 'tank' | 'golem' | 'colossus'
  // shielded
  | 'bulwark' | 'warden'
  // regenerating
  | 'knitter' | 'revenant'
  // burrowing
  | 'burrower' | 'molerat'
  // flying
  | 'flyer' | 'wisp' | 'gargoyle'
  // summoner
  | 'broodmother' | 'hivecaller'
  // support
  | 'mender' | 'cantor'
  // suicide
  | 'bomber' | 'popper'
  // artillery
  | 'siegeworm' | 'spitter'
  // elite / apex
  | 'apex' | 'dreadnought' | 'tyrant';
export type HeroKind = 'ravager' | 'shepherd' | 'overseer';

/** How a tower delivers its attack — drives the firing/projectile dispatch, so a
 * new tower that reuses a behavior is data-only (no sim code). 'support' = no fire,
 * 'field' = periodic in-range pulse (no projectile). */
export type TowerFiring = 'homing' | 'splash' | 'support' | 'infest' | 'field';
/** What a live projectile does on the field (a subset of TowerFiring that flies). */
export type ProjectileBehavior = 'homing' | 'splash' | 'parasite';

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
  infection: number; // Viral infection stacks — ramping armor-ignoring DoT; spreads on death
  disrupt: number; // remaining seconds of Neural Disruption (slow + vulnerability)
  shredFlash: number; // seconds of reaction flash remaining (visual)
  hitFlash: number; // seconds of white hit-flash remaining (visual)
  dmgAccum: number; // damage banked toward the next aggregated damage number (visual)
  dmgTimer: number; // throttle until the banked damage may pop as a float (visual)
  alive: boolean;
  lastHitKind: TowerKind | null; // tower kind of the last damaging hit (mastery: kill credit)
  boss: BossRuntime | null; // present only for framework bosses (null for normal enemies)
  elite: boolean; // director-promoted elite (buffed) — drives elite-priority targeting
  // Universal status-effect container (status.ts). Optional/lazy — the four legacy
  // statuses keep their fast fields above; NEW effects (burn, slow, stun, …) live here
  // and run through the generic engine. Undefined on the historical path (golden-safe).
  statuses?: ActiveStatus[];
  // ── Role-trait runtime (the ~30-enemy roster). Optional/lazy: undefined on the historical
  //    seven enemies, so every gated hook is a no-op there and the golden run is byte-identical.
  shield?: number; // remaining front-shield HP absorbed before the body (Shielded / Support)
  summonCd?: number; // seconds until the next add spawns (Summoner)
  siegeCd?: number; // seconds until the next bombardment volley (Artillery)
}

/** Live state a framework boss carries on top of its enemy body (see boss.ts). */
export interface BossRuntime {
  defId: string;
  name: string;
  phase: number; // current phase index
  phases: number; // total phase count
  moduleCd: number[]; // per-module cooldown remaining (indexed like BossDef.modules)
  shielded: number; // seconds of invulnerability remaining (0 = vulnerable)
  enrage: number; // enrage stacks
  channel: number; // seconds left on a Nucleus channel (0 = none)
  charge: number; // seconds left on a telegraphed dash (0 = not charging)
  telegraph: string | null; // current telegraphed action (drives the banner)
}

export interface BossBannerSnapshot {
  name: string;
  hpPct: number;
  phase: number;
  phases: number;
  telegraph: string | null;
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
  disabledUntil: number; // sim-time a boss suppressor re-enables it (0 = active)
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
  // ── Projectile mutators (mutators.ts). Absent ⇒ no pierce ⇒ dies on first hit (the
  //    historical behavior, golden-safe). Set by a tower's star kit at spawn. ──
  pierce?: number; // extra enemies it passes through before dying (0/undefined = none)
  hitIds?: number[]; // enemies already struck (pierce: avoids re-hitting the same body)
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
  kind: HeroKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  down: boolean;
  respawn: number; // seconds until respawn when down
  rally: Vec2;
  attackCd: number;
  abilityCd: number;
  pulseCd: number; // role pulse timer (Shepherd vital pulse / Overseer disrupt field)
  // Absorb-shield (Shepherd's Bloom; future support gear). `shield` = remaining absorb
  // pool, soaked before HP; `shieldTime` = seconds until it lapses. 0/0 ⇒ no shield, so
  // the Ravager and a fresh run are byte-identical (golden-safe).
  shield: number;
  shieldTime: number;
}

/** A summoned friendly unit (the `summon` ability primitive). A temporary attacker that
 * seeks and strikes the nearest enemy; enemies in contact halt and chew through it, so it
 * also body-blocks the lane until its HP or lifetime runs out. Runtime-only (never persisted)
 * and absent on the golden path — no content summons there — so it's byte-identical. */
export interface Minion {
  id: number;
  kind: string; // MINION_DEFS key (the unit type)
  x: number;
  y: number;
  hp: number; // remaining health — enemies in contact damage it; 0 ⇒ destroyed
  maxHp: number;
  damage: number; // per attack
  attackCd: number; // seconds until the next attack
  attackInterval: number;
  range: number; // seek radius — finds the nearest enemy within it
  speed: number; // px/sec
  life: number; // seconds remaining before it expires
  maxLife: number; // initial life (drives the render fade-out)
  radius: number; // body radius (render + attack reach)
  color: string;
  alive: boolean;
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
  // ── Star-evolution kit (stars.ts). All optional; absent ⇒ base behavior, so a fresh
  //    account (no stars) is byte-identical. The sim reads these in towerSystem. ──
  targeting?: TargetingProfile; // overrides the tower's default target pick
  extraProjectiles?: number; // additional simultaneous targets for the base attack
  splashMult?: number; // multiplies projectile splash radius
  // Identity-range upgrades (docs/RANGE.md §8) — NEVER a generic "+range%". Each is a
  // tower-specific reach axis: engagement range (needle marksman) / pulse radius (obelisk
  // control field), and infection-spread reach (parasite). Absent ⇒ base, golden-safe.
  rangeMult?: number; // scales the tower's targeting range + field/aura radius (engagement / pulse)
  infectionSpreadMult?: number; // parasite-only: scales the Infection death-spread radius
  projectileMutators?: string[]; // mutator ids applied to each spawned projectile (pierce …)
  extraAbilities?: AbilityComponent[]; // granted attacks/auras/chains run each cast
  reactorBiomassMult?: number; // reactor-only: scales its biomass generation (support evolution)
  reactorOverchargeBonus?: number; // reactor-only: extra overcharge to adjacent towers
  cosmetics?: string[]; // visual mutation ids (renderer)
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
export type HeroMasteryCounts = Record<HeroKind, MasteryCount>;

/** Per-hero permanent multipliers (stars + mastery + equipment), applied at run
 * start. Identity (all 1) for a fresh save, so the base hero is unchanged. This is
 * the fold point the EQUIPMENT.md item system plugs into (see meta.heroProgress). */
export interface HeroMods {
  damageMult: number;
  cooldownMult: number;
}
export type HeroProgress = Record<HeroKind, HeroMods>;

/** Raw per-run statistics observed by the sim (presentation/meta only — never feeds
 * combat, so it can't change a fixed-seed outcome). Read out once at run end and
 * folded into LifetimeStats by `state/stats.ts`. */
export interface RunStats {
  kills: number;
  wave: number;
  won: boolean;
  biomassEarned: number; // total biomass income this run
  damageDealt: number; // total damage dealt (towers + hero + DoT)
  killsByEnemy: Record<EnemyKind, number>;
  towerBuilds: Record<TowerKind, number>; // towers grown this run, per kind
  cardIds: string[]; // gene cards drafted this run (ids; may repeat)
  heroId: string; // hero fielded this run
}

/** Persistent lifetime statistics (in SaveData). The accumulation reducer in
 * `state/stats.ts` is the single place that grows when a new stat is added. */
export interface LifetimeStats {
  lifetimeKills: number;
  highestWave: number;
  totalBiomass: number;
  totalDamage: number;
  runsCompleted: number; // won
  runsFailed: number; // lost
  cardsDrafted: number; // total gene cards drafted across all runs
  uniqueCards: string[]; // distinct card ids ever collected (the "collection")
  killsByEnemy: Record<EnemyKind, number>;
  towerUsage: Record<TowerKind, number>; // total builds per kind (drives "favorite tower")
  heroUsage: Record<string, number>; // runs fielded per hero id
}

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
    kind: HeroKind;
    down: boolean;
    respawn: number;
    hp: number;
    maxHp: number;
    shield: number; // active absorb-shield HP (0 = none); shown beside Health when > 0
    abilityReady: boolean;
    abilityCd: number;
    abilityCdMax: number;
  };
  enemiesAlive: number;
  emergency: boolean; // Emergency Defense Mode — an enemy is in the Final Defense Zone
  draft: CardOption[] | null;
  selectedTower: TowerKind | null;
  armedAbility: boolean;
  cards: CardOption[]; // gene cards drafted this run (build panel)
  buffs: string[]; // human-readable active run modifiers
  bossBanner: BossBannerSnapshot | null; // a live framework-boss banner (name/hp/phase)
  endless: boolean; // true in Endless mode (HUD shows Depth instead of Wave N/12)
  anticipation: string[]; // upcoming named beats (next boss / next chest tier) — pacing hook
  autoStart: boolean; // auto-start preference (next wave fires after a prep countdown)
  autoStartIn: number; // seconds left on the auto-start countdown (0 when off / not in prep)
}

export interface CardOption {
  id: string;
  name: string;
  rarity: CardRarity;
  description: string;
  category: string;
}

/** A telegraph of an upcoming wave's composition (anticipation / informed prep). */
export interface WavePreviewEntry {
  kind: EnemyKind;
  count: number;
}
