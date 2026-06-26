// Central balance config — ALL tunables live here (CLAUDE.md: centralize tunables;
// ARCHITECTURE.md §6.2). Systems read these; they never inline magic numbers.
// Every value is an illustrative starting point for the vertical slice.

import type { CombatClass, Currency, EnemyKind, HeroId, MetaModifiers, TowerKind } from './types';

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
    range: 150,
    fireInterval: 0.3,
    damage: 12,
    projectileSpeed: 620,
    splash: 0,
    color: '#5ad1ff',
    // ROLE: single-target executioner. LOCKS one target and rapid-fires homing
    // needles into it, stacking Fracture (armor shred) — melts tanks & bosses.
    blurb: 'Locks one target; rapid homing needles stack Fracture. Melts armor; weak vs swarms.',
  },
  mortar: {
    kind: 'mortar',
    name: 'Bone Mortar',
    combatClass: 'Caustic',
    cost: 150,
    range: 185,
    fireInterval: 1.5,
    damage: 18,
    projectileSpeed: 230,
    splash: 62,
    color: '#b6e84a',
    // ROLE: area denial. LOBS slow arcing shells at the DENSEST cluster, then
    // leaves a Corrosion pool (DoT + slow). Clears swarms; poor vs lone targets.
    blurb: 'Lobs at the biggest cluster; leaves Corrosion pools. Clears swarms; poor vs single targets.',
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
    // ROLE: support. No attack — generates biomass, OVERCHARGES adjacent towers,
    // and emits a weakening aura (nearby enemies are slowed + take more damage).
    blurb: 'No attack. Biomass + overcharges neighbors + weakens nearby foes. Useless alone.',
  },
};

export const TOWER_ORDER: TowerKind[] = ['needle', 'mortar', 'reactor'];

// ── Enemies ───────────────────────────────────────────────────────────────
/**
 * Steering profile — how an enemy *thinks*, not just where it walks. Combined each
 * tick into a single movement vector (see Game.enemyMoveSystem). Data-driven so new
 * archetypes are a config entry, not new code.
 */
export interface EnemyBehavior {
  seek: number; // pull toward the base/line (flow field)
  avoidTowers: number; // steer out of tower kill-zones -> seek gaps (penetration)
  avoidHero: number; // >0 skirt the hero, <0 hunt it (future hunter types)
  separation: number; // spread from neighbours
  jitter: number; // organic wander
  flying?: boolean; // ignore ground obstacles (drift straight for the base)
  burrowing?: boolean; // ignore ground obstacles (tunnel under them)
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  armor: number;
  speed: number; // px/sec
  bounty: number; // biomass on death
  damage: number; // integrity damage at the line
  radius: number;
  color: string;
  behavior: EnemyBehavior;
  isBoss?: boolean; // marks a wave-defining elite (future boss bars/codex/rewards key off this)
  // ── Archetype hooks (each is one optional data field, no bespoke per-type code) ──
  shield?: number; // Shielded — soaks this much damage before HP is touched
  regen?: { perSec: number; delay: number }; // Regenerating — heals after `delay`s unhurt
  split?: { kind: EnemyKind; count: number }; // Splitter — bursts into these on death
  ranged?: { range: number; damage: number; interval: number; speed: number }; // Ranged — shoots the hero
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  runner: {
    kind: 'runner', name: 'Skitterling', hp: 36, armor: 0, speed: 72, bounty: 11, damage: 4, radius: 10, color: '#d98cff',
    behavior: { seek: 1, avoidTowers: 0.28, avoidHero: 0.5, separation: 0.55, jitter: 0.16 },
  },
  brute: {
    kind: 'brute', name: 'Carrion Brute', hp: 150, armor: 8, speed: 42, bounty: 26, damage: 9, radius: 14, color: '#7b9cff',
    behavior: { seek: 1, avoidTowers: 0.16, avoidHero: 0.22, separation: 0.4, jitter: 0.06 },
  },
  tyrant: {
    kind: 'tyrant', name: 'Brood Tyrant', hp: 900, armor: 14, speed: 32, bounty: 180, damage: 45, radius: 26, color: '#ff4d6d',
    behavior: { seek: 1, avoidTowers: 0.05, avoidHero: 0, separation: 0.18, jitter: 0 }, isBoss: true,
  },
  // ── Future archetypes — spawnable via the debug panel; not in the authored waves
  //    yet. Each is purely a data profile, proving the AI scales by configuration. ──
  rusher: {
    kind: 'rusher', name: 'Razor Sprinter', hp: 28, armor: 0, speed: 132, bounty: 9, damage: 5, radius: 8, color: '#ff5db0',
    behavior: { seek: 1.2, avoidTowers: 0, avoidHero: 0, separation: 0.2, jitter: 0.04 }, // beelines, ignores defenses
  },
  tank: {
    kind: 'tank', name: 'Carapace Hauler', hp: 430, armor: 18, speed: 30, bounty: 60, damage: 14, radius: 18, color: '#5fd0c6',
    behavior: { seek: 1, avoidTowers: 0.08, avoidHero: 0, separation: 0.3, jitter: 0.02 }, // soaks, unbothered
  },
  flyer: {
    kind: 'flyer', name: 'Spore Drifter', hp: 60, armor: 2, speed: 64, bounty: 18, damage: 7, radius: 11, color: '#c0a3ff',
    behavior: { seek: 1, avoidTowers: 0.12, avoidHero: 0.35, separation: 0.3, jitter: 0.12, flying: true }, // over obstacles
  },
  burrower: {
    kind: 'burrower', name: 'Gut Tunneler', hp: 90, armor: 6, speed: 58, bounty: 22, damage: 8, radius: 12, color: '#e8a04a',
    behavior: { seek: 1, avoidTowers: 0.55, avoidHero: 0.4, separation: 0.3, jitter: 0.1, burrowing: true }, // tunnels gaps
  },

  // ── Combat archetypes — each is mostly a data profile + one archetype hook. ──
  // Splitter: a fat sac that bursts into a knot of Skitterlings — punish single-
  // target overkill; reward AoE (Mortar) parked behind it.
  splitter: {
    kind: 'splitter', name: 'Brood Sac', hp: 130, armor: 4, speed: 44, bounty: 26, damage: 9, radius: 16, color: '#c7e04a',
    behavior: { seek: 1, avoidTowers: 0.1, avoidHero: 0.15, separation: 0.35, jitter: 0.05 },
    split: { kind: 'runner', count: 3 },
  },
  // Ranged: hangs back and shoots the hero — towers must reach it; keep the hero clear.
  spitter: {
    kind: 'spitter', name: 'Bile Spitter', hp: 72, armor: 2, speed: 50, bounty: 24, damage: 6, radius: 12, color: '#ff5db0',
    behavior: { seek: 0.9, avoidTowers: 0.2, avoidHero: 0.75, separation: 0.3, jitter: 0.08 }, // kites the hero
    ranged: { range: 190, damage: 16, interval: 1.9, speed: 230 },
  },
  // Regenerating: heals fast unless kept under pressure — counter with Corrosion
  // pools (continuous DoT) or burst it down before regen kicks in.
  mender: {
    kind: 'mender', name: 'Knit Crawler', hp: 165, armor: 6, speed: 40, bounty: 32, damage: 8, radius: 14, color: '#3fe08a',
    behavior: { seek: 1, avoidTowers: 0.16, avoidHero: 0.25, separation: 0.35, jitter: 0.06 },
    regen: { perSec: 16, delay: 1.6 },
  },
  // Shielded: a hard shield soaks the first hits — needs sustained fire or splash
  // to crack before the body even takes damage (Needle focus / Mortar chip).
  warden: {
    kind: 'warden', name: 'Carapace Warden', hp: 150, armor: 8, speed: 38, bounty: 36, damage: 11, radius: 16, color: '#6e9bff',
    behavior: { seek: 1, avoidTowers: 0.1, avoidHero: 0.18, separation: 0.3, jitter: 0.03 },
    shield: 130,
  },
};

// Steering radii / cadence for enemy threat behaviour. Raw px (avoids a config<->map
// import cycle; CELL is 40, so these are ~2.4 / ~2.2 cells).
export const STEER = {
  towerAvoidRadius: 96,
  heroAvoidRadius: 88,
  jitterFreq: 0.9,
};

// ── Performance / scalability budgets (large-scale combat) ──────────────────
export const PERF = {
  spatialCell: 64, // grid cell px for proximity queries (~tower-avoid radius)
  maxEnemies: 600, // soft cap on concurrent enemies (spawns skip past this)
  maxParticles: 420, // cosmetic particle budget (oldest dropped past this)
  lodEnemyCount: 220, // beyond this, the renderer drops per-enemy embellishments
};

// Cosmetic combat particles (pooled). Counts kept modest to stay within budget.
export const PARTICLE = {
  death: { count: 6, speed: 70, life: 0.5, size: 2.6 },
  shred: { count: 10, speed: 130, life: 0.45, size: 2.2, color: '#fff066' },
  breach: { count: 8, speed: 90, life: 0.5, size: 2.4, color: '#ff5d73' },
  heroHit: { count: 5, speed: 110, life: 0.3, size: 2.2, color: '#ffe39a' },
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

// Waves introduce the archetypes one at a time, then remix them so each demands a
// different answer (Fast→front coverage, Tank/Shielded→focus fire, Splitter→AoE,
// Regen→sustained/DoT, Ranged→protect the hero).
export const WAVES: WaveDef[] = [
  // 1 — Skitterling intro
  [{ kind: 'runner', count: 8, spacing: 0.9, delay: 0.5 }],
  // 2 — first Razor Sprinters (Fast)
  [
    { kind: 'runner', count: 10, spacing: 0.75, delay: 0.5 },
    { kind: 'rusher', count: 3, spacing: 1.0, delay: 2.2 },
  ],
  // 3 — fast pressure
  [
    { kind: 'rusher', count: 6, spacing: 0.6, delay: 0.4 },
    { kind: 'runner', count: 10, spacing: 0.6, delay: 1.6 },
  ],
  // 4 — first Carapace Warden (Shielded) behind brutes
  [
    { kind: 'brute', count: 3, spacing: 1.4, delay: 0.5 },
    { kind: 'warden', count: 1, spacing: 1, delay: 3.0 },
    { kind: 'runner', count: 8, spacing: 0.6, delay: 4.5 },
  ],
  // 5 — Knit Crawlers (Regen) in a swarm
  [
    { kind: 'runner', count: 16, spacing: 0.45, delay: 0.4 },
    { kind: 'mender', count: 2, spacing: 2.0, delay: 2.5 },
  ],
  // 6 — Brood Sacs (Splitter) + fast
  [
    { kind: 'rusher', count: 6, spacing: 0.6, delay: 0.4 },
    { kind: 'splitter', count: 2, spacing: 2.6, delay: 2.0 },
    { kind: 'runner', count: 8, spacing: 0.6, delay: 3.0 },
  ],
  // 7 — Bile Spitters (Ranged) behind a brute screen
  [
    { kind: 'brute', count: 5, spacing: 1.1, delay: 0.5 },
    { kind: 'spitter', count: 3, spacing: 1.4, delay: 2.2 },
  ],
  // 8 — Wardens + swarm + fast
  [
    { kind: 'warden', count: 2, spacing: 2.2, delay: 0.5 },
    { kind: 'runner', count: 14, spacing: 0.42, delay: 1.5 },
    { kind: 'rusher', count: 4, spacing: 0.7, delay: 3.2 },
  ],
  // 9 — Menders + brutes + fast
  [
    { kind: 'mender', count: 3, spacing: 1.7, delay: 0.5 },
    { kind: 'brute', count: 5, spacing: 1.0, delay: 2.0 },
    { kind: 'rusher', count: 5, spacing: 0.6, delay: 3.6 },
  ],
  // 10 — Splitter wave
  [
    { kind: 'splitter', count: 4, spacing: 1.7, delay: 0.5 },
    { kind: 'runner', count: 16, spacing: 0.4, delay: 2.2 },
  ],
  // 11 — Ranged + Shielded + brutes
  [
    { kind: 'spitter', count: 4, spacing: 1.3, delay: 0.5 },
    { kind: 'warden', count: 2, spacing: 2.4, delay: 1.8 },
    { kind: 'brute', count: 6, spacing: 0.9, delay: 3.2 },
  ],
  // 12 — Brood Tyrant finale + a taste of everything
  [
    { kind: 'tyrant', count: 1, spacing: 1, delay: 1.0 },
    { kind: 'warden', count: 2, spacing: 2.0, delay: 2.0 },
    { kind: 'splitter', count: 2, spacing: 2.6, delay: 3.5 },
    { kind: 'spitter', count: 3, spacing: 1.5, delay: 5.0 },
    { kind: 'runner', count: 16, spacing: 0.45, delay: 6.0 },
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

// ── Card-effect tunables (behavioral Gene Cards read these at their hook points) ──
export const CARD_FX = {
  needleBounceRange: 95, // ricochet search radius
  corrosionSpreadRange: 72, // Viral Bloom splash on corroded death
  deathPoolRadius: 26, // Acidic Remains pool size
  deathPoolDps: 6,
  deathPoolDuration: 2.5,
  deathBurstRadius: 48, // Volatile Decay
  deathBurstDamage: 12,
  shredExplosionRadius: 58, // Detonation Cascade
  shredExplosionDamage: 24,
};

// ── Heroes ──────────────────────────────────────────────────────────────────
// Data-driven roster. The active hero's stats are read through `HERO` (the
// default), so a stat-variant hero is one HEROES entry — no engine changes (see
// docs/CONTENT-GUIDE.md §Heroes). Numbers below are the Ravager's, unchanged.
export interface HeroAbilityDef {
  name: string;
  cooldown: number;
  radius: number;
  damage: number;
  fracture: number;
}
export interface HeroDef {
  id: HeroId;
  name: string;
  combatClass: CombatClass;
  maxHp: number;
  speed: number;
  attackRange: number;
  attackInterval: number;
  attackDamage: number;
  attackFracture: number;
  aggroRange: number; // effectively the whole arena — heroes roam freely to intercept
  contactRange: number; // enemies this close damage the hero
  respawnTime: number;
  // Targeting / movement intelligence:
  threatPerDamage: number; // weight an enemy's integrity-damage adds to its hunt priority
  lead: number; // seconds to lead a moving target (intercept ahead of its path)
  turnRate: number; // facing smoothing toward the target/movement direction
  // Light melee cleave — clears chaff around the target so the hero feels like a
  // battlefield unit, but stays melee-bound + fractional so it never out-clears towers.
  cleaveRadius: number;
  cleaveFraction: number;
  swingTime: number; // attack animation window (renderer lunge + slash)
  ability: HeroAbilityDef;
}

export const HEROES: Record<HeroId, HeroDef> = {
  ravager: {
    id: 'ravager',
    name: 'The Ravager',
    combatClass: 'Kinetic',
    maxHp: 230,
    speed: 122,
    attackRange: 34,
    attackInterval: 0.5,
    attackDamage: 19,
    attackFracture: 1,
    aggroRange: 1400,
    contactRange: 26,
    respawnTime: 8,
    threatPerDamage: 7,
    lead: 0.32,
    turnRate: 14,
    cleaveRadius: 42,
    cleaveFraction: 0.5,
    swingTime: 0.18,
    ability: { name: 'Apex Leap', cooldown: 8, radius: 72, damage: 62, fracture: 2 },
  },
};

export const DEFAULT_HERO_ID: HeroId = 'ravager';

/** The active hero's tunables. Aliased to the default so every existing call site
 *  (game.ts reads HERO.*) is unchanged; hero selection just rebinds this later. */
export const HERO: HeroDef = HEROES[DEFAULT_HERO_ID];

// ── Economy ───────────────────────────────────────────────────────────────
export const ECON = {
  startingBiomass: 220,
  reactorBiomassPerSec: 6,
  overchargeDamage: 0.35, // +35% damage to adjacent towers
  overchargeRate: 0.25, // +25% fire rate to adjacent towers
  // Reactor weakening aura — its battlefield presence despite dealing no damage.
  reactorAuraRadius: 92,
  reactorAuraSlow: 0.2, // -20% speed to enemies in the aura
  reactorWeaken: 0.2, // +20% damage taken by enemies in the aura
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

// ── Meta upgrades (permanent, capped) — data-driven, multi-currency ───────────
// Four parallel tracks, each fed by a DIFFERENT mode's currency so each mode has
// its own progression and no earned currency is a dead end: Shards (Stage/Classic
// → power), Essence (Endless → mastery), Components (Stage → equipment), Catalyst
// (Endless depth → prestige, the slow "forever" lean). Adding a node is one entry:
// id, costs, and an apply(mods, level) that folds into the permanent bucket.
// Costs/coefficients are the canonical balance values — tune here, see
// docs/BALANCE-LOG.md.
export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costMult: number;
  currency: Currency;
  track: 'core' | 'mastery' | 'equipment' | 'prestige';
  apply: (m: MetaModifiers, level: number) => void;
}

export function defaultMetaModifiers(): MetaModifiers {
  return {
    towerDamageMult: 1,
    towerFireRateMult: 1,
    splashMult: 1,
    biomassMult: 1,
    heroDamageMult: 1,
    heroSpeedMult: 1,
    integrityBonus: 0,
    startBiomass: 0,
  };
}

// Core power track — bought with Shards (the Stage/Classic currency).
export const META_UPGRADES: UpgradeDef[] = [
  { id: 'lethality', name: 'Lethal Spores', description: '+8% tower damage per level', maxLevel: 10, baseCost: 30, costMult: 1.5, currency: 'shards', track: 'core', apply: (m, l) => { m.towerDamageMult *= 1 + 0.08 * l; } },
  { id: 'metabolism', name: 'Rich Biomass', description: '+10% in-run biomass income per level', maxLevel: 10, baseCost: 30, costMult: 1.5, currency: 'shards', track: 'core', apply: (m, l) => { m.biomassMult *= 1 + 0.1 * l; } },
  { id: 'nucleus', name: 'Reinforced Nucleus', description: '+25 max Integrity per level', maxLevel: 10, baseCost: 25, costMult: 1.45, currency: 'shards', track: 'core', apply: (m, l) => { m.integrityBonus += 25 * l; } },
  { id: 'apex', name: 'Apex Genome', description: '+10% hero damage per level', maxLevel: 10, baseCost: 35, costMult: 1.5, currency: 'shards', track: 'core', apply: (m, l) => { m.heroDamageMult *= 1 + 0.1 * l; } },
];

// Mastery track — bought with Essence (the Endless currency). Utility/tempo lean,
// so endless progression FEELS different from the Shards damage tree.
export const MASTERY_UPGRADES: UpgradeDef[] = [
  { id: 'overclock', name: 'Overclock', description: '+6% tower fire rate per level', maxLevel: 8, baseCost: 40, costMult: 1.5, currency: 'essence', track: 'mastery', apply: (m, l) => { m.towerFireRateMult *= 1 + 0.06 * l; } },
  { id: 'swift_genes', name: 'Swift Genes', description: '+8% hero move speed per level', maxLevel: 6, baseCost: 35, costMult: 1.5, currency: 'essence', track: 'mastery', apply: (m, l) => { m.heroSpeedMult *= 1 + 0.08 * l; } },
  { id: 'jumpstart', name: 'Jumpstart', description: '+40 starting biomass per level', maxLevel: 6, baseCost: 30, costMult: 1.5, currency: 'essence', track: 'mastery', apply: (m, l) => { m.startBiomass += 40 * l; } },
];

// Equipment track — bought with Components (dropped by clearing Stages). Gear-like
// defensive/AoE relics, distinct from both other trees.
export const EQUIPMENT_UPGRADES: UpgradeDef[] = [
  { id: 'carapace', name: 'Carapace Plating', description: '+20 max Integrity per level', maxLevel: 8, baseCost: 25, costMult: 1.45, currency: 'components', track: 'equipment', apply: (m, l) => { m.integrityBonus += 20 * l; } },
  { id: 'payload', name: 'Volatile Payload', description: '+8% splash radius per level', maxLevel: 6, baseCost: 30, costMult: 1.5, currency: 'components', track: 'equipment', apply: (m, l) => { m.splashMult *= 1 + 0.08 * l; } },
  { id: 'symbiote', name: 'Symbiote Core', description: '+8% biomass income per level', maxLevel: 6, baseCost: 30, costMult: 1.5, currency: 'components', track: 'equipment', apply: (m, l) => { m.biomassMult *= 1 + 0.08 * l; } },
];

// Prestige track — bought with Catalyst (minted by Endless DEPTH, 1 per 10 waves).
// The premium "forever" lean: rare currency, low absolute costs but a long
// geometric climb, and global dual-stat nodes that compound EVERY mode. This is the
// sink that makes deep Endless runs matter long-term (closes the catalyst dead zone).
export const PRESTIGE_UPGRADES: UpgradeDef[] = [
  { id: 'viral_apex', name: 'Viral Apex', description: '+5% tower & hero damage per level', maxLevel: 10, baseCost: 2, costMult: 1.35, currency: 'catalyst', track: 'prestige', apply: (m, l) => { m.towerDamageMult *= 1 + 0.05 * l; m.heroDamageMult *= 1 + 0.05 * l; } },
  { id: 'living_bastion', name: 'Living Bastion', description: '+35 max Integrity per level', maxLevel: 10, baseCost: 2, costMult: 1.35, currency: 'catalyst', track: 'prestige', apply: (m, l) => { m.integrityBonus += 35 * l; } },
  { id: 'hypermetabolism', name: 'Hypermetabolism', description: '+12% biomass income per level', maxLevel: 8, baseCost: 2, costMult: 1.35, currency: 'catalyst', track: 'prestige', apply: (m, l) => { m.biomassMult *= 1 + 0.12 * l; } },
];

/** Every upgrade across all tracks (meta.ts derives MetaModifiers from this). */
export const ALL_UPGRADES: UpgradeDef[] = [...META_UPGRADES, ...MASTERY_UPGRADES, ...EQUIPMENT_UPGRADES, ...PRESTIGE_UPGRADES];
