// Central balance config — ALL tunables live here (CLAUDE.md: centralize tunables;
// ARCHITECTURE.md §6.2). Systems read these; they never inline magic numbers.
// Every value is an illustrative starting point for the vertical slice.

import type { CombatClass, Currency, EnemyKind, GearItem, GearSlot, HeroId, MetaModifiers, TowerKind } from './types';
import type { RunModifiers } from './cards'; // type-only (no runtime cycle: cards never imports config)
import { defineEnemy, MOVEMENT, ability, tune } from './archetypes';
import type { EnemyDef, EnemyBehavior, StatBlock, EnemyRole, AbilityModule, MovementId } from './archetypes';
// Re-export the archetype kit so existing `from './config'` import paths keep working.
export { defineEnemy, MOVEMENT, ability, tune };
export type { EnemyDef, EnemyBehavior, StatBlock, EnemyRole, AbilityModule, MovementId };

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
// Every enemy is COMPOSED from reusable archetypes (src/core/archetypes.ts):
// a StatBlock + a MOVEMENT profile (the movement AI) + a VisualSpec + zero-or-more
// ability modules. No bespoke per-enemy code — a new enemy is one defineEnemy call
// combining existing parts (see docs/ENEMIES.md §Archetypes, CONTENT-GUIDE).
export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  // ── Core trio (authored waves) ──
  runner: defineEnemy('runner', {
    name: 'Skitterling', role: 'chaff',
    stats: { hp: 36, armor: 0, speed: 72, bounty: 11, damage: 4, radius: 10 },
    movement: MOVEMENT.swarmer, visual: { color: '#d98cff' },
  }),
  brute: defineEnemy('brute', {
    name: 'Carrion Brute', role: 'standard',
    stats: { hp: 150, armor: 8, speed: 42, bounty: 26, damage: 9, radius: 14 },
    movement: MOVEMENT.bruiser, visual: { color: '#7b9cff' },
  }),
  tyrant: defineEnemy('tyrant', {
    name: 'Brood Tyrant', role: 'boss', isBoss: true,
    stats: { hp: 900, armor: 14, speed: 32, bounty: 180, damage: 45, radius: 26 },
    movement: MOVEMENT.juggernaut, visual: { color: '#ff4d6d' },
  }),
  // ── Mobility archetypes ──
  rusher: defineEnemy('rusher', {
    name: 'Razor Sprinter', role: 'chaff',
    stats: { hp: 28, armor: 0, speed: 132, bounty: 9, damage: 5, radius: 8 },
    movement: MOVEMENT.charger, visual: { color: '#ff5db0' }, // beelines, ignores defenses
  }),
  tank: defineEnemy('tank', {
    name: 'Carapace Hauler', role: 'tank',
    stats: { hp: 430, armor: 18, speed: 30, bounty: 60, damage: 14, radius: 18 },
    movement: MOVEMENT.behemoth, visual: { color: '#5fd0c6' }, // soaks, unbothered
  }),
  flyer: defineEnemy('flyer', {
    name: 'Spore Drifter', role: 'standard',
    stats: { hp: 60, armor: 2, speed: 64, bounty: 18, damage: 7, radius: 11 },
    movement: MOVEMENT.floater, visual: { color: '#c0a3ff' }, // over obstacles
  }),
  burrower: defineEnemy('burrower', {
    name: 'Gut Tunneler', role: 'standard',
    stats: { hp: 90, armor: 6, speed: 58, bounty: 22, damage: 8, radius: 12 },
    movement: MOVEMENT.tunneler, visual: { color: '#e8a04a' }, // tunnels gaps
  }),
  // ── Combat archetypes — a movement profile + one ability module each ──
  // Splitter: a fat sac that bursts into Skitterlings — punish single-target overkill.
  splitter: defineEnemy('splitter', {
    name: 'Brood Sac', role: 'standard',
    stats: { hp: 130, armor: 4, speed: 44, bounty: 26, damage: 9, radius: 16 },
    movement: MOVEMENT.brooder, visual: { color: '#c7e04a' },
    abilities: [ability.splitsInto('runner', 3)],
  }),
  // Ranged: hangs back and shoots the hero — towers must reach it; keep the hero clear.
  spitter: defineEnemy('spitter', {
    name: 'Bile Spitter', role: 'standard',
    stats: { hp: 72, armor: 2, speed: 50, bounty: 24, damage: 6, radius: 12 },
    movement: MOVEMENT.kiter, visual: { color: '#ff5db0' },
    abilities: [ability.ranged(190, 16, 1.9, 230)],
  }),
  // Regenerating: heals fast unless kept under pressure — counter with Corrosion DoT.
  mender: defineEnemy('mender', {
    name: 'Knit Crawler', role: 'support',
    stats: { hp: 165, armor: 6, speed: 40, bounty: 32, damage: 8, radius: 14 },
    movement: MOVEMENT.knitter, visual: { color: '#3fe08a' },
    abilities: [ability.regenerating(16, 1.6)],
  }),
  // Shielded: a hard shield soaks the first hits — crack it with sustained fire/splash.
  warden: defineEnemy('warden', {
    name: 'Carapace Warden', role: 'tank',
    stats: { hp: 150, armor: 8, speed: 38, bounty: 36, damage: 11, radius: 16 },
    movement: MOVEMENT.bulwark, visual: { color: '#6e9bff' },
    abilities: [ability.shielded(130)],
  }),
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

// Wave composition (groups, themes, injections, difficulty, scripted encounters)
// lives in wavecomposer.ts — the data-driven Wave Composer framework. config.ts
// keeps only the per-spawn ELITE buff, since it's applied at spawn time (game.ts).

// ── Elites ────────────────────────────────────────────────────────────────
// An elite is a normal enemy spawned with buffed stats (the Wave Composer flags
// which spawns are elite; these multipliers are applied in Game.makeEnemyAt).
export const ELITE = {
  hpMult: 2.4,
  damageMult: 1.5,
  bountyMult: 2.5,
  radiusMult: 1.25, // bigger silhouette so elites read at a glance
};

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

// ── Automatic wave flow ─────────────────────────────────────────────────────
// The Build Phase runs a countdown that auto-starts the next wave; the player can
// start early for a small biomass bonus. These are the canonical durations — the
// EFFECTIVE countdown is `buildSeconds × RunModifiers.buildCountdownMult`, so cards,
// upgrades, and difficulty settings can shorten/extend it later (a single hook).
export const WAVE_FLOW = {
  buildSeconds: 5, // countdown of the Build Phase (run start after 1st tower, + between waves)
  earlyStartBonus: 25, // biomass granted for manually starting a wave early ("small")
};

// ── Persistent Loot Meter ───────────────────────────────────────────────────
// A forever meter (saved, never reset between runs/modes) that fills from kills +
// wave completions; each fill awards one loot box and rolls the overflow into the
// next. All tunables here — `meterFor(boxesEarned)` lets the cost curve scale with
// boxes already earned, so balancing is a one-function change.
export const LOOT = {
  perKill: 1, // meter progress per enemy killed
  perWave: 18, // meter progress per completed wave
  meterBase: 240, // progress to fill the first meter (one loot box)
  meterGrowth: 0, // +progress required per box already earned (0 = flat; future-proof)
};

/** Progress required to fill the meter, given how many boxes are already earned. */
export function lootMeterSize(boxesEarned: number): number {
  return LOOT.meterBase + LOOT.meterGrowth * Math.max(0, boxesEarned);
}

// ── Loot boxes (rarity + contents) ──────────────────────────────────────────
// A box's rarity is DETERMINISTIC by its 1-based earned index, so the meter can
// PREVIEW the next box (anticipation) and color itself to match. Opening rolls a
// currency cache within the rarity's bands — reuses existing currencies, no new
// economy. Tune cadence + payouts here.
export type LootRarity = 'common' | 'rare' | 'epic';

export interface LootRarityDef {
  label: string;
  color: string; // a CSS rarity token (shared palette)
  shards: [number, number];
  essence: [number, number];
  components: [number, number];
  genomeShards: [number, number]; // feeds Tower Stars — the loot→stars payoff
}

export const LOOT_RARITY: Record<LootRarity, LootRarityDef> = {
  common: { label: 'Common', color: 'var(--r-common)', shards: [40, 80], essence: [0, 0], components: [0, 0], genomeShards: [12, 22] },
  rare: { label: 'Rare', color: 'var(--r-rare)', shards: [90, 160], essence: [20, 40], components: [0, 0], genomeShards: [30, 55] },
  epic: { label: 'Epic', color: 'var(--r-epic)', shards: [220, 360], essence: [50, 90], components: [25, 50], genomeShards: [80, 140] },
};

/** Rarity of the box at a given 1-based earned index. Every 25th is Epic, every
 *  5th is Rare, the rest Common — a legible cadence the player learns to chase. */
export function lootBoxRarity(index: number): LootRarity {
  if (index > 0 && index % 25 === 0) return 'epic';
  if (index > 0 && index % 5 === 0) return 'rare';
  return 'common';
}

// ── Tower Stars (per-unit permanent progression) ────────────────────────────
// Each tower has a Star ladder (★0 = baseline, so an un-starred tower is unchanged).
// Stars are bought with Genome Shards (from loot boxes + runs). Most steps are modest
// stat steps; the ★3 and ★5 steps unlock a real MECHANIC by setting an existing run
// hook (the same flags Gene Cards use) — so a star is a *verb*, not just a number, and
// no new simulation code is required. Data-driven: a new step is one array entry.
export const STAR_MAX = 5;
export const GENOME_SHARDS_PER_WAVE = 1.2; // small run trickle so stars progress even without opening boxes

export interface StarStat {
  damageMult: number;
  fireRateMult: number;
  rangeMult: number;
  splashMult: number;
}
export function defaultStarStat(): StarStat {
  return { damageMult: 1, fireRateMult: 1, rangeMult: 1, splashMult: 1 };
}

export interface StarNode {
  cost: number; // Genome Shards to buy this star (from the level below)
  desc: string; // short UI description of what the star grants
  stat?: Partial<StarStat>; // per-kind stat step (towerSystem applies these)
  apply?: (m: RunModifiers) => void; // behavioral unlock — reuses an existing run hook
  unlock?: string; // names the mechanic (★3/★5) for the "new ability" reveal
}

export const STAR_TRACKS: Record<TowerKind, StarNode[]> = {
  needle: [
    { cost: 20, desc: '+8% damage', stat: { damageMult: 1.08 } },
    { cost: 35, desc: '+8% fire rate', stat: { fireRateMult: 1.08 } },
    { cost: 60, desc: 'needles bounce to another target on hit', apply: (m) => { m.needleBounce += 1; }, unlock: 'Ricochet' },
    { cost: 100, desc: '+10% damage', stat: { damageMult: 1.1 } },
    { cost: 160, desc: 'fire an extra needle', apply: (m) => { m.needleExtraProjectiles += 1; }, unlock: 'Twin Fang' },
  ],
  mortar: [
    { cost: 20, desc: '+8% damage', stat: { damageMult: 1.08 } },
    { cost: 35, desc: '+12% splash radius', stat: { splashMult: 1.12 } },
    { cost: 60, desc: 'lob a second shell at another cluster', apply: (m) => { m.mortarExtraShell += 1; }, unlock: 'Twin Mortars' },
    { cost: 100, desc: '+10% damage', stat: { damageMult: 1.1 } },
    { cost: 160, desc: 'deadlier, longer-lasting Corrosion pools', apply: (m) => { m.poolDpsMult *= 1.3; m.mortarPoolDurationMult *= 1.4; }, unlock: 'Lingering Acid' },
  ],
  reactor: [
    { cost: 20, desc: '+12% reactor biomass', apply: (m) => { m.reactorBiomassMult *= 1.12; } },
    { cost: 35, desc: '+20% aura radius', apply: (m) => { m.reactorAuraRadiusMult *= 1.2; } },
    { cost: 60, desc: 'overcharges neighbors harder', apply: (m) => { m.reactorOverchargeBonus += 0.2; }, unlock: 'Overcharged Veins' },
    { cost: 100, desc: '+12% reactor biomass', apply: (m) => { m.reactorBiomassMult *= 1.12; } },
    { cost: 160, desc: 'a surge of aura radius & overcharge', apply: (m) => { m.reactorAuraRadiusMult *= 1.25; m.reactorOverchargeBonus += 0.15; }, unlock: 'Apotheosis' },
  ],
};

/** Genome-Shard cost to buy the next star, or null if maxed. */
export function starCost(kind: TowerKind, currentLevel: number): number | null {
  const track = STAR_TRACKS[kind];
  return currentLevel >= track.length ? null : track[currentLevel].cost;
}

/** Fold a tower's owned stars into its per-kind stat block (towerSystem reads this). */
export function starStatFor(kind: TowerKind, level: number): StarStat {
  const s = defaultStarStat();
  const track = STAR_TRACKS[kind];
  for (let i = 0; i < Math.min(level, track.length); i++) {
    const st = track[i].stat;
    if (!st) continue;
    if (st.damageMult) s.damageMult *= st.damageMult;
    if (st.fireRateMult) s.fireRateMult *= st.fireRateMult;
    if (st.rangeMult) s.rangeMult *= st.rangeMult;
    if (st.splashMult) s.splashMult *= st.splashMult;
  }
  return s;
}

/** Apply a tower's owned star MECHANIC unlocks into the run modifier bag (reuses card hooks). */
export function applyStarUnlocks(kind: TowerKind, level: number, m: RunModifiers): void {
  const track = STAR_TRACKS[kind];
  for (let i = 0; i < Math.min(level, track.length); i++) track[i].apply?.(m);
}

// ── Hero Equipment (gear) ───────────────────────────────────────────────────
// Three slots (Weapon / Armor / Relic). A gear item is a rarity + rolled affixes;
// each affix sets an EXISTING hero/run hook, so gear adds no new sim behavior — only
// new *loadout decisions*. Vertical power stays modest (bounded affix ranges); the
// depth is horizontal (which affixes/relics, which loadout). Data-driven: a new affix
// is one AFFIX_POOL entry. Gear drops from loot boxes (the loot→build chase).
export const GEAR_SLOTS: GearSlot[] = ['weapon', 'armor', 'relic'];

export interface AffixDef {
  id: string;
  label: string;
  slot: GearSlot;
  range: [number, number]; // rolled magnitude range
  pct?: boolean; // display as a percentage
  flag?: boolean; // a behavioral unlock (no magnitude) — shown as the label alone
  apply: (m: RunModifiers, value: number) => void; // reuses an existing run hook
}

// Pools per slot are intentionally uneven: Weapon is a 3-stat "stat stick" (an Epic
// weapon maxes hero offense), while Armor and Relic hold five each, so an Epic in
// those slots is a real 3-of-5 choice — that's where the horizontal build variety
// lives. Adding more is one entry; Epic stays a meaningful pick as the pools grow.
export const AFFIX_POOL: AffixDef[] = [
  // Weapon — the hero's offense.
  { id: 'w_dmg', label: 'Hero Damage', slot: 'weapon', range: [8, 20], pct: true, apply: (m, v) => { m.heroDamageMult *= 1 + v / 100; } },
  { id: 'w_atk', label: 'Hero Attack Speed', slot: 'weapon', range: [8, 18], pct: true, apply: (m, v) => { m.heroAttackRateMult *= 1 + v / 100; } },
  { id: 'w_cd', label: 'Ability Cooldown', slot: 'weapon', range: [6, 15], pct: true, apply: (m, v) => { m.heroCooldownMult *= 1 - v / 100; } },
  // Armor — survivability + auras/economy that reach the towers (the cross-layer lever).
  { id: 'a_spd', label: 'Hero Move Speed', slot: 'armor', range: [8, 18], pct: true, apply: (m, v) => { m.heroSpeedMult *= 1 + v / 100; } },
  { id: 'a_aura', label: 'Tower Damage Aura', slot: 'armor', range: [4, 10], pct: true, apply: (m, v) => { m.towerDamageMult *= 1 + v / 100; } },
  { id: 'a_bio', label: 'Biomass Income', slot: 'armor', range: [5, 12], pct: true, apply: (m, v) => { m.biomassMult *= 1 + v / 100; } },
  { id: 'a_haste', label: 'Tower Fire-Rate Aura', slot: 'armor', range: [3, 8], pct: true, apply: (m, v) => { m.towerFireRateMult *= 1 + v / 100; } },
  { id: 'a_reactor', label: 'Reactor Yield', slot: 'armor', range: [6, 14], pct: true, apply: (m, v) => { m.reactorBiomassMult *= 1 + v / 100; } },
  // Relic — rule-benders (flat counters + behavioral unlocks).
  { id: 'r_life', label: 'Lifesteal on Kill', slot: 'relic', range: [2, 6], apply: (m, v) => { m.heroLifestealOnKill += v; } },
  { id: 'r_strike', label: 'Extra Hero Strike', slot: 'relic', range: [1, 1], flag: true, apply: (m) => { m.heroExtraStrikes += 1; } },
  { id: 'r_apex', label: 'Apex Cooldown / Kill', slot: 'relic', range: [0.3, 0.8], apply: (m, v) => { m.apexKillReset += v; } },
  { id: 'r_pools', label: 'Acidic Remains', slot: 'relic', range: [1, 1], flag: true, apply: (m) => { m.deathPools = true; } },
  { id: 'r_burst', label: 'Volatile Decay', slot: 'relic', range: [1, 1], flag: true, apply: (m) => { m.deathBurst = true; } },
];

const AFFIX_BY_ID = new Map(AFFIX_POOL.map((a) => [a.id, a]));
export function affixDef(id: string): AffixDef | undefined {
  return AFFIX_BY_ID.get(id);
}

export const GEAR_RARITY_AFFIXES: Record<'common' | 'rare' | 'epic', number> = { common: 1, rare: 2, epic: 3 };
export const GEAR_DROP_CHANCE: Record<'common' | 'rare' | 'epic', number> = { common: 0.22, rare: 0.6, epic: 1 };
export const GEAR_INVENTORY_CAP = 60;
// Dismantling surplus gear refunds Genome Shards (the per-unit star currency), so even
// junk drops feed progression — values track the per-rarity genome-shard scale.
export const GEAR_DISMANTLE_GENOME: Record<'common' | 'rare' | 'epic', number> = { common: 20, rare: 50, epic: 120 };

/** Apply one equipped gear item's affixes into the run modifier bag (pure). */
export function applyGear(item: GearItem, m: RunModifiers): void {
  for (const a of item.affixes) affixDef(a.id)?.apply(m, a.value);
}

// ── Infinite Mastery (uncapped per-unit progression) ────────────────────────
// Every tower kind and the hero accrue Mastery XP from being FIELDED in runs. Unlike
// Stars (capped at ★5), Mastery has NO ceiling — there is always a next level — so a
// veteran always has a number going up (the fix for the "everything caps" cliff). Power
// is deliberately LOGARITHMIC: each level adds a diminishing damage sliver, so infinite
// levels can't break balance; a milestone every 10 levels adds a small rate step. Folds
// through the same RunFold path as Stars/gear (towers via the per-kind StarStat block,
// the hero via a run-mod apply) — so Mastery adds no new simulation behavior.
export type MasteryUnit = TowerKind | 'hero';
export const MASTERY_UNITS: MasteryUnit[] = ['needle', 'mortar', 'reactor', 'hero'];

export const MASTERY = {
  xpBase: 60, // cumulative XP to reach level 1 (scales as xpBase · level^xpPow)
  xpPow: 1.5, // super-linear level cost → levels slow but never stop
  dmgPerLevel: 0.02, // damage fraction per log2-doubling of level (the soft, infinite curve)
  milestoneEvery: 10, // a fire/attack-rate step every N levels …
  milestoneRate: 0.02,
  milestoneRateMax: 10, // … but capped: rate perks are front-loaded (max +20%), so only the
  //                       logarithmic DAMAGE is truly infinite — nothing runs away.
  // XP earned per run (towers: only a fielded kind; hero: always):
  xpPerWave: 8,
  xpPerKill: 0.5,
  xpPerExtraTower: 0.12, // small bonus for leaning into a kind (capped below)
  extraTowerCap: 5,
  xpPerApex: 3, // hero only
} as const;

/** Cumulative XP required to have reached a given mastery level (UI bars + inversion). */
export function masteryXpForLevel(level: number): number {
  return level <= 0 ? 0 : Math.ceil(MASTERY.xpBase * Math.pow(level, MASTERY.xpPow));
}

/** The (uncapped) mastery level for a cumulative XP total. */
export function masteryLevel(xp: number): number {
  if (xp <= 0) return 0;
  return Math.floor(Math.pow(xp / MASTERY.xpBase, 1 / MASTERY.xpPow));
}

/** Diminishing damage multiplier from a mastery level (logarithmic → never runs away). */
export function masteryDamageMult(level: number): number {
  return 1 + MASTERY.dmgPerLevel * Math.log2(1 + level);
}

/** Capped fire/attack-rate multiplier from a level's milestones (bounded — front-loaded perks). */
export function masteryRateMult(level: number): number {
  const milestones = Math.min(Math.floor(level / MASTERY.milestoneEvery), MASTERY.milestoneRateMax);
  return 1 + milestones * MASTERY.milestoneRate;
}

/** A unit's mastery folded into a per-kind stat block (merges with Stars in runFold). */
export function masteryStatFor(xp: number): StarStat {
  const lvl = masteryLevel(xp);
  return { damageMult: masteryDamageMult(lvl), fireRateMult: masteryRateMult(lvl), rangeMult: 1, splashMult: 1 };
}

/** Apply the hero's mastery into the run modifier bag (damage + capped milestone attack rate). */
export function applyHeroMastery(xp: number, m: RunModifiers): void {
  const lvl = masteryLevel(xp);
  m.heroDamageMult *= masteryDamageMult(lvl);
  m.heroAttackRateMult *= masteryRateMult(lvl);
}

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
