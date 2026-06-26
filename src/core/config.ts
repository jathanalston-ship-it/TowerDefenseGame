// Central balance config — ALL tunables live here (CLAUDE.md: centralize tunables;
// ARCHITECTURE.md §6.2). Systems read these; they never inline magic numbers.
// Every value is an illustrative starting point for the vertical slice.

import type { CombatClass, EnemyKind, HeroKind, MetaModifiers, TowerFiring, TowerKind } from './types';
import { Registry } from './registry';
import type { AbilityComponent, AuraAbility } from './ability';
import type { TargetingProfile } from './targeting';

export const SIM_DT = 1 / 60; // fixed simulation timestep (seconds)

// ── Sim tuning (movement / combat / fx) — gameplay constants, not magic numbers ──
export const MOVE = {
  separationRadius: 36, // px (was CELL*0.9); enemy spacing radius
  jitterIdScale: 0.137, // per-enemy phase offset for organic wander noise
  jitterPhase: 1.31, // y-axis noise phase multiplier
};
export const COMBAT = {
  projectileHitEpsilon: 4, // px slop for a projectile counting as "arrived"
  heroContactMargin: 28, // added to hero contactRange for the proximity query (~max enemy radius)
};
export const FX = {
  particleDrag: 0.92, // per-tick velocity damping on cosmetic particles
  floatRiseSpeed: 18, // px/sec floating-text drift
  hitFlash: 0.09, // seconds of white flash when an enemy takes a discrete hit
  dmgFloatInterval: 0.4, // min seconds between aggregated damage-number pops per enemy
};

// ── Towers ────────────────────────────────────────────────────────────────
export interface TowerDef {
  kind: TowerKind;
  name: string;
  combatClass: CombatClass;
  firing: TowerFiring; // how it attacks — drives the sim dispatch (data, not code)
  cost: number;
  range: number;
  fireInterval: number; // seconds between actions
  damage: number;
  projectileSpeed: number; // px/sec (0 = no projectile)
  splash: number; // splash radius (0 = single target)
  color: string;
  blurb: string;
  /** Optional explicit ability kit. When omitted, it's derived from `firing` + stats
   * (see TOWER_ABILITIES) — so a NEW tower can instead compose reusable AbilityComponents
   * directly (projectile + chain + poison, …) with no sim code. */
  abilities?: AbilityComponent[];
  /** Targeting profile (data-driven). Omitted ⇒ 'closestToBase' (historical default). */
  targeting?: TargetingProfile;
}

export const TOWER_DEFS: Record<TowerKind, TowerDef> = {
  needle: {
    kind: 'needle',
    name: 'Needle Spitter',
    combatClass: 'Kinetic',
    firing: 'homing',
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
    firing: 'splash',
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
    firing: 'support',
    cost: 120,
    range: 0,
    fireInterval: 0,
    damage: 0,
    projectileSpeed: 0,
    splash: 0,
    color: '#ff7a59',
    blurb: 'Generates biomass; overcharges ADJACENT towers (+dmg, +rate).',
  },
  parasite: {
    kind: 'parasite',
    name: 'Parasite Nest',
    combatClass: 'Viral',
    firing: 'infest', // homing parasite that seeds ramping, armor-ignoring Infection
    cost: 130,
    range: 150,
    fireInterval: 0.85,
    damage: 6, // low on impact — the ramping Infection DoT + spread is the payoff
    projectileSpeed: 360,
    splash: 0,
    color: '#e24dff',
    blurb: 'Seeds Infection — ramping DoT that ignores armor and spreads on death.',
  },
  obelisk: {
    kind: 'obelisk',
    name: 'Neural Obelisk',
    combatClass: 'Neural',
    firing: 'field', // periodic psionic pulse — no projectile; debuffs in range
    cost: 140,
    range: 120, // psionic field radius
    fireInterval: 1.0, // pulse cadence
    damage: 5, // token chip; its value is the Disruption (slow + vulnerability)
    projectileSpeed: 0,
    splash: 0,
    color: '#6e7bff',
    blurb: 'Pulses Disruption — slows enemies and makes them take more from ALL sources.',
  },
};

/** Per-def invariants (shared by validate.ts and the registry's own `validate()`). */
export function towerProblems(d: TowerDef): string[] {
  const out: string[] = [];
  if (d.cost < 0) out.push('cost must be >= 0');
  // Projectile firings need somewhere to aim + something to fly; 'field' pulses
  // in-range (range only); 'support' needs neither.
  const projectileBased = d.firing === 'homing' || d.firing === 'splash' || d.firing === 'infest';
  if (projectileBased) {
    if (d.range <= 0) out.push('a projectile tower needs range > 0');
    if (d.projectileSpeed <= 0) out.push('a projectile tower needs projectileSpeed > 0');
  }
  if (d.firing === 'field' && d.range <= 0) out.push('a field tower needs range > 0');
  return out;
}

// Towers self-register here; the iteration list is DERIVED (no hardcoded order array).
export const towerRegistry = new Registry<TowerDef>('tower', { idOf: (d) => d.kind, validate: towerProblems });
towerRegistry.registerAll(Object.values(TOWER_DEFS));
export const TOWER_ORDER = towerRegistry.ids() as TowerKind[];

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
    behavior: { seek: 1, avoidTowers: 0.05, avoidHero: 0, separation: 0.18, jitter: 0 },
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
};

export function enemyProblems(d: EnemyDef): string[] {
  const out: string[] = [];
  if (d.hp <= 0) out.push('hp must be > 0');
  if (d.speed <= 0) out.push('speed must be > 0');
  if (d.radius <= 0) out.push('radius must be > 0');
  if (d.armor < 0) out.push('armor must be >= 0');
  return out;
}

// Enemies self-register; the canonical kind list to iterate (stats, spawns, …) is derived.
export const enemyRegistry = new Registry<EnemyDef>('enemy', { idOf: (d) => d.kind, validate: enemyProblems });
enemyRegistry.registerAll(Object.values(ENEMY_DEFS));
export const ENEMY_KINDS = enemyRegistry.ids() as EnemyKind[];

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
  mote: { count: 4, life: 0.7, size: 2.2, color: '#b6e84a' }, // biomass motes drifting up off a kill
  infect: { count: 7, speed: 60, life: 0.55, size: 2.3, color: '#e24dff' }, // spores burst from an infected death (the spread)
  disrupt: { count: 5, speed: 40, life: 0.4, size: 2.0, color: '#9aa6ff' }, // psionic static off an obelisk pulse
  bloom: { count: 8, speed: 80, life: 0.5, size: 2.4, color: '#ffcaa0' }, // vital spores off the Shepherd's pulse
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

// Each wave introduces or combines an archetype with a CLEAR role, telegraphed in
// the prep phase (Toolbar "Incoming"). The escalating mix — speed (rusher), armor
// (tank), air (flyer), tunnelling (burrower) — keeps combat varied and makes the
// towers' differences matter, instead of an undifferentiated runner/brute grind.
export const WAVES: WaveDef[] = [
  // 1 — soft intro: a trickle of Skitterlings.
  [{ kind: 'runner', count: 8, spacing: 0.9, delay: 0.5 }],
  // 2 — a bigger swarm to establish baseline DPS.
  [{ kind: 'runner', count: 12, spacing: 0.75, delay: 0.5 }],
  // 3 — first ARMOR: Carrion Brutes mixed in (rewards focus fire / shred).
  [
    { kind: 'runner', count: 10, spacing: 0.7, delay: 0.4 },
    { kind: 'brute', count: 3, spacing: 1.6, delay: 3.0 },
  ],
  // 4 — first SPEED: Razor Sprinters beeline the line, testing gap coverage.
  [
    { kind: 'rusher', count: 6, spacing: 0.7, delay: 0.5 },
    { kind: 'runner', count: 10, spacing: 0.6, delay: 2.0 },
  ],
  // 5 — first SOAK: Carapace Haulers (heavy armor → leans on Fracture+Corrosion).
  [
    { kind: 'tank', count: 3, spacing: 1.8, delay: 0.6 },
    { kind: 'runner', count: 12, spacing: 0.55, delay: 1.5 },
  ],
  // 6 — first AIR: Spore Drifters float over obstacles, demanding wide coverage.
  [
    { kind: 'flyer', count: 5, spacing: 1.1, delay: 0.5 },
    { kind: 'brute', count: 4, spacing: 1.4, delay: 2.5 },
  ],
  // 7 — speed swarm: overlapping Razor Sprinters + runners.
  [
    { kind: 'rusher', count: 10, spacing: 0.5, delay: 0.4 },
    { kind: 'runner', count: 12, spacing: 0.5, delay: 2.0 },
  ],
  // 8 — first TUNNELLERS: Gut Tunnelers slip through gaps, plus brute weight.
  [
    { kind: 'burrower', count: 5, spacing: 1.1, delay: 0.5 },
    { kind: 'brute', count: 5, spacing: 1.2, delay: 2.5 },
  ],
  // 9 — armor + air pressure together.
  [
    { kind: 'tank', count: 4, spacing: 1.6, delay: 0.5 },
    { kind: 'flyer', count: 6, spacing: 1.0, delay: 2.0 },
    { kind: 'runner', count: 12, spacing: 0.5, delay: 3.5 },
  ],
  // 10 — combined arms: speed + weight + tunnelling.
  [
    { kind: 'rusher', count: 8, spacing: 0.5, delay: 0.4 },
    { kind: 'brute', count: 6, spacing: 1.0, delay: 2.0 },
    { kind: 'burrower', count: 5, spacing: 1.0, delay: 4.0 },
  ],
  // 11 — penetration gauntlet before the boss.
  [
    { kind: 'tank', count: 5, spacing: 1.3, delay: 0.5 },
    { kind: 'rusher', count: 10, spacing: 0.45, delay: 2.0 },
    { kind: 'flyer', count: 6, spacing: 0.9, delay: 4.0 },
  ],
  // 12 — the Brood Tyrant, escorted by a mixed host.
  [
    { kind: 'tyrant', count: 1, spacing: 1, delay: 1.0 },
    { kind: 'brute', count: 8, spacing: 0.9, delay: 2.0 },
    { kind: 'flyer', count: 6, spacing: 0.9, delay: 4.0 },
    { kind: 'runner', count: 14, spacing: 0.45, delay: 6.0 },
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

  // ── Infection (Viral — Parasite Nest) ──────────────────────────────────────
  // A ramping, armor-IGNORING DoT that spreads from the dying to the living, so it
  // scales with crowd density and wave length. Distinct from Corrosion (fixed
  // pool DoT + slow): Infection grows, persists on the body, and is contagious.
  infectionOnHit: 2, // stacks applied by a parasite on impact
  infectionMaxStacks: 8, // ramp/spread cap per enemy
  infectionRampPerSec: 1, // +stacks/sec while infected (the "ramp")
  infectionDpsPerStack: 2.0, // armor-ignoring DoT per stack per second
  infectionSpreadStacks: 2, // stacks seeded onto neighbours when an infected enemy dies
  infectionSpreadTargets: 3, // how many nearby enemies the plague jumps to on death
  infectionSpreadRadius: 72, // px reach of the death-spread

  // ── Disruption (Neural — Neural Obelisk) ────────────────────────────────────
  // Control + force-multiplier: slows enemies AND marks them Vulnerable (+% damage
  // taken from EVERY source — towers, hero, pools, infection, reactions). Low direct
  // damage by design; its value is amplifying the rest of the build.
  disruptDuration: 1.6, // seconds, refreshed each pulse while in the field
  disruptSlow: 0.35, // -35% speed while disrupted
  disruptVulnerability: 0.25, // +25% damage taken from all sources while disrupted
};

// ── Tower ability kits (Part 2: towers built from reusable ability components) ──
// Each launch tower's attack is expressed as AbilityComponents executed by the shared
// ability executor (game.ts), replacing the per-firing branches. For the launch roster
// the kit is DERIVED from `firing` + stats (so behavior is byte-identical); a new tower
// may instead set `def.abilities` directly and compose blocks freely.
function deriveTowerAbilities(d: TowerDef): AbilityComponent[] {
  if (d.abilities) return d.abilities;
  switch (d.firing) {
    case 'homing':
      return [{ type: 'projectile', behavior: 'homing', damage: d.damage, speed: d.projectileSpeed, range: d.range }];
    case 'splash':
      return [{ type: 'projectile', behavior: 'splash', damage: d.damage, speed: d.projectileSpeed, range: d.range, splash: d.splash }];
    case 'infest':
      return [{ type: 'projectile', behavior: 'parasite', damage: d.damage, speed: d.projectileSpeed, range: d.range }];
    case 'field':
      // Psionic pulse: chip damage + Disruption to everything in range (no reaction —
      // matches the original field pulse). Particle only emits when it catches a target.
      return [{
        type: 'aura', radius: d.range, damage: d.damage,
        status: { kind: 'Disruption', amount: STATUS.disruptDuration }, particle: 'disrupt',
      }];
    case 'support':
      return []; // economy/aura only — no attack
  }
}

export const TOWER_ABILITIES: Record<TowerKind, AbilityComponent[]> = Object.fromEntries(
  TOWER_ORDER.map((k) => [k, deriveTowerAbilities(TOWER_DEFS[k])]),
) as Record<TowerKind, AbilityComponent[]>;

// ── Heroes (autonomous battlefield units) ───────────────────────────────────
// Data-driven roster (mirrors TOWER_DEFS). Each hero is a distinct AI profile:
//   • 'dive'    — Ravager: charges the deepest threat, melee + Fracture (Kinetic).
//   • 'guard'   — Shepherd: holds the core, regenerates Integrity + vital pulse (Vital).
//   • 'control' — Overseer: floats to the densest crowd, Disruption field (Neural).
// The Ravager's numbers are unchanged from the original single-hero build, so the
// base game (and the golden tests) play identically.
export type HeroBehavior = 'dive' | 'guard' | 'control';

export interface HeroAbilityDef {
  name: string;
  blurb: string;
  cooldown: number;
  radius: number;
  damage: number; // AoE damage at the cast point (0 = pure utility)
  fracture: number; // Kinetic stacks applied (Ravager)
  disrupt: number; // Disruption seconds applied (Overseer)
  heal: number; // Nucleus + self heal granted (Shepherd)
}

export interface HeroDef {
  kind: HeroKind;
  name: string;
  combatClass: CombatClass;
  behavior: HeroBehavior;
  color: string;
  maxHp: number;
  speed: number; // px/sec
  attackRange: number; // 0 = no auto-attack (support/controller)
  attackInterval: number;
  attackDamage: number;
  attackFracture: number;
  aggroRange: number; // effectively the whole arena — heroes roam freely
  contactRange: number; // enemies this close damage the hero
  respawnTime: number;
  // Role pulse — 'guard'/'control' emit a periodic AoE; 'dive' leaves these at 0.
  pulseInterval: number; // seconds between pulses (0 = none)
  pulseRadius: number; // AoE / field radius
  pulseDamage: number; // direct damage per pulse
  pulseDisrupt: number; // Disruption seconds applied per pulse (control)
  nucleusRegen: number; // Integrity/sec restored while alive (guard)
  ability: HeroAbilityDef;
}

export const HERO_DEFS: Record<HeroKind, HeroDef> = {
  ravager: {
    kind: 'ravager', name: 'Ravager', combatClass: 'Kinetic', behavior: 'dive', color: '#ffd24d',
    maxHp: 230, speed: 115, attackRange: 32, attackInterval: 0.55, attackDamage: 19, attackFracture: 1,
    aggroRange: 1400, contactRange: 26, respawnTime: 8,
    pulseInterval: 0, pulseRadius: 0, pulseDamage: 0, pulseDisrupt: 0, nucleusRegen: 0,
    ability: { name: 'Apex Leap', blurb: 'AoE leap that fractures enemies.', cooldown: 8, radius: 72, damage: 62, fracture: 2, disrupt: 0, heal: 0 },
  },
  shepherd: {
    kind: 'shepherd', name: 'Shepherd', combatClass: 'Vital', behavior: 'guard', color: '#ff9f6b',
    // Tanky, slower, NO auto-attack. Guards the Nucleus, mends Integrity, and pulses
    // a short vital wave that chips enemies pressing the line.
    maxHp: 300, speed: 95, attackRange: 0, attackInterval: 0, attackDamage: 0, attackFracture: 0,
    aggroRange: 1400, contactRange: 24, respawnTime: 8,
    pulseInterval: 1.2, pulseRadius: 92, pulseDamage: 8, pulseDisrupt: 0, nucleusRegen: 1.2,
    ability: { name: 'Bloom', blurb: 'A vital bloom: heals the Nucleus + AoE burst.', cooldown: 12, radius: 110, damage: 40, fracture: 0, disrupt: 0, heal: 40 },
  },
  overseer: {
    kind: 'overseer', name: 'Overseer', combatClass: 'Neural', behavior: 'control', color: '#8a93ff',
    // Floats to the densest crowd. NO real damage — emits a fast Disruption field
    // (slow + vulnerability) that amplifies the rest of your build.
    maxHp: 200, speed: 108, attackRange: 0, attackInterval: 0, attackDamage: 0, attackFracture: 0,
    aggroRange: 1400, contactRange: 22, respawnTime: 9,
    pulseInterval: 0.6, pulseRadius: 110, pulseDamage: 3, pulseDisrupt: STATUS.disruptDuration, nucleusRegen: 0,
    ability: { name: 'Mass Override', blurb: 'Floods an area with deep Disruption: slow + heavy vulnerability.', cooldown: 11, radius: 132, damage: 0, fracture: 0, disrupt: 3.0, heal: 0 },
  },
};

export function heroProblems(d: HeroDef): string[] {
  const out: string[] = [];
  if (d.maxHp <= 0) out.push('maxHp must be > 0');
  if (d.speed < 0) out.push('speed must be >= 0');
  if (d.ability.cooldown < 0) out.push('ability cooldown must be >= 0');
  return out;
}

// Heroes self-register; the roster list is derived (no hardcoded order array).
export const heroRegistry = new Registry<HeroDef>('hero', { idOf: (d) => d.kind, validate: heroProblems });
heroRegistry.registerAll(Object.values(HERO_DEFS));
export const HERO_ORDER = heroRegistry.ids() as HeroKind[];

// ── Hero ability kits (Part 2: heroes built from reusable ability components) ──
// The role pulse (guard/control) and the signature ability are AbilityComponents run
// by the shared executor — derived from the HeroDef fields so behavior is unchanged.
function heroPulseAbility(d: HeroDef): AuraAbility | null {
  if (d.pulseInterval <= 0) return null;
  return {
    type: 'aura',
    radius: d.pulseRadius,
    damage: d.pulseDamage > 0 ? d.pulseDamage : undefined,
    status: d.pulseDisrupt > 0 ? { kind: 'Disruption', amount: d.pulseDisrupt } : undefined,
    react: true,
    particle: d.behavior === 'control' ? 'disrupt' : 'bloom',
  };
}
function heroUltAbility(d: HeroDef): AbilityComponent[] {
  const ab = d.ability;
  const out: AbilityComponent[] = [];
  if (ab.heal > 0) out.push({ type: 'heal', nucleus: ab.heal, self: ab.heal });
  if (ab.damage > 0) {
    out.push({
      type: 'explosion', radius: ab.radius, damage: ab.damage,
      status: ab.fracture > 0 ? { kind: 'Fracture', amount: ab.fracture } : undefined, react: true,
    });
  } else if (ab.disrupt > 0) {
    // Pure control ult (Overseer Mass Override): flood Disruption, no damage/reaction.
    out.push({ type: 'debuff', radius: ab.radius, status: { kind: 'Disruption', amount: ab.disrupt } });
  }
  return out;
}

export const HERO_PULSE: Record<HeroKind, AuraAbility | null> = Object.fromEntries(
  HERO_ORDER.map((k) => [k, heroPulseAbility(HERO_DEFS[k])]),
) as Record<HeroKind, AuraAbility | null>;
export const HERO_ULT: Record<HeroKind, AbilityComponent[]> = Object.fromEntries(
  HERO_ORDER.map((k) => [k, heroUltAbility(HERO_DEFS[k])]),
) as Record<HeroKind, AbilityComponent[]>;

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
  /** Data-driven effect: each level adds `perLevel` to `stat` of MetaModifiers.
   * (Multiplier stats start at 1, flat stats at 0 — see metaModifiers().) */
  effect: { stat: keyof MetaModifiers; perLevel: number };
}

export const META_UPGRADES: UpgradeDef[] = [
  { id: 'lethality', name: 'Lethal Spores', description: '+8% tower damage per level', maxLevel: 10, baseCost: 30, costMult: 1.55, effect: { stat: 'towerDamageMult', perLevel: 0.08 } },
  { id: 'metabolism', name: 'Rich Biomass', description: '+10% in-run biomass income per level', maxLevel: 10, baseCost: 30, costMult: 1.55, effect: { stat: 'biomassMult', perLevel: 0.1 } },
  { id: 'nucleus', name: 'Reinforced Nucleus', description: '+25 max Integrity per level', maxLevel: 10, baseCost: 25, costMult: 1.5, effect: { stat: 'integrityBonus', perLevel: 25 } },
  { id: 'apex', name: 'Apex Genome', description: '+10% hero damage per level', maxLevel: 10, baseCost: 35, costMult: 1.55, effect: { stat: 'heroDamageMult', perLevel: 0.1 } },
];

export function upgradeProblems(d: UpgradeDef): string[] {
  const out: string[] = [];
  if (d.maxLevel <= 0) out.push('maxLevel must be > 0');
  if (d.baseCost <= 0) out.push('baseCost must be > 0');
  if (d.costMult < 1) out.push('costMult should be >= 1');
  return out;
}

export const upgradeRegistry = new Registry<UpgradeDef>('upgrade', { idOf: (d) => d.id, validate: upgradeProblems });
upgradeRegistry.registerAll(META_UPGRADES);

// ── Tower progression: shards → stars, plus infinite mastery ────────────────
// Per-tower permanent growth, kept SEPARATE from the global Shards economy:
//   • Tower Shards (per kind)  — currency earned from run-end chests.
//   • Stars (per kind)         — bought with tower shards; small, capped buff.
//   • Mastery (per kind)       — earned by USE (kills/damage/uptime); INFINITE,
//                                ever-slower, tiny permanent buff per level.
// All numbers here are PLACEHOLDER starting points — the architecture is the
// deliverable, not the balance. Bonuses are identity at level/star 0 so a fresh
// save plays exactly like the base game (golden-test invariant).

/** Star upgrades: capped, shard-bought, modest per-star buff. */
export const STAR = {
  maxStars: 5, // ★0..★5 in the slice; the system itself is uncapped by design
  baseCost: 8, // tower shards for the 1st star
  costMult: 1.8, // each subsequent star costs more
  damagePerStar: 0.06, // +6% tower damage per star (placeholder)
  fireRatePerStar: 0.03, // +3% fire rate per star (placeholder)
};

/** Infinite mastery: signals → XP, an ever-growing requirement curve, tiny buff. */
export const MASTERY = {
  // XP earned per signal while a tower is deployed (placeholder weights).
  xpPerKill: 4,
  xpPerDamage: 0.02,
  xpPerActiveSecond: 1,
  // Requirement curve — XP for the (n+1)-th level grows geometrically, so levels
  // come ever more slowly but NEVER stop (supports "increase forever").
  baseReq: 100, // XP from level 0 → 1
  reqGrowth: 1.12, // +12% required per level (compounding)
  // Permanent reward per mastery level: small, unbounded (milestones come later).
  damagePerLevel: 0.004, // +0.4% tower damage per level
};

// ── Loot boxes (run-end reward chests) ──────────────────────────────────────
// Expandable to multiple chest rarities later; one is defined today. A chest is a
// number of independent reward "rolls"; each roll grants tower shards, or (small
// chance) hero shards. Duplicate protection is intentionally not modelled yet.
export interface ChestDef {
  id: string;
  name: string;
  rarity: string; // chest rarity tier (expandable: standard → rare → prime …)
  rolls: number; // independent reward slots opened in sequence
  towerShardRange: [number, number]; // shards granted to a random tower per roll
  heroShardChance: number; // chance a roll yields hero shards instead
  heroShardRange: [number, number];
}

export const CHESTS: Record<string, ChestDef> = {
  standard: {
    id: 'standard',
    name: 'Biomass Cache',
    rarity: 'standard',
    rolls: 3,
    towerShardRange: [2, 5],
    heroShardChance: 0.12,
    heroShardRange: [1, 1],
  },
  rich: {
    id: 'rich',
    name: 'Mutagen Vault',
    rarity: 'rich',
    rolls: 4,
    towerShardRange: [3, 7],
    heroShardChance: 0.2,
    heroShardRange: [1, 2],
  },
  prime: {
    id: 'prime',
    name: 'Apex Reliquary',
    rarity: 'prime',
    rolls: 5,
    towerShardRange: [5, 10],
    heroShardChance: 0.32,
    heroShardRange: [1, 2],
  },
};

// Chests self-register; lookups (rollChest, chestForWave) resolve by id via the registry.
export const chestRegistry = new Registry<ChestDef>('chest', {
  idOf: (d) => d.id,
  validate: (d) => (d.rolls > 0 ? [] : ['rolls must be > 0']),
});
chestRegistry.registerAll(Object.values(CHESTS));

/** Default chest (debug / fallback). */
export const RUN_CHEST = 'standard';

/** Reward pacing: deeper runs earn a better chest, pulling "one more run". */
export function chestForWave(wave: number): string {
  if (wave >= 12) return 'prime'; // full extraction
  if (wave >= 7) return 'rich'; // cleared the mid-game
  return 'standard';
}

// Heroes that can receive hero shards — derived from the registry, not hand-listed.
export const HERO_IDS: string[] = heroRegistry.ids();
export const HERO_LABELS: Record<string, string> = Object.fromEntries(
  heroRegistry.all().map((d) => [d.kind, d.name]),
);

// ── Boss framework (boss.ts) ────────────────────────────────────────────────
export const BOSS = {
  baseHp: 1600, // × BossDef.hpMult → boss HP
  addCap: 28, // fairness cap on a spawner boss's concurrent adds (uses the global maxEnemies too)
};

// ── AI Director / run modes (director.ts) ───────────────────────────────────
// The Director generates Endless waves from a threat budget; Stage mode stays the
// authored WAVES (so the golden run is untouched). Tunables are illustrative.
export const DIRECTOR = {
  baseBudget: 12, // threat points spent on wave 1 of endless
  budgetGrowth: 0.16, // +16% budget per depth (the difficulty frontier)
  eliteChanceBase: 0.08, // elite promotion chance, rises with depth
  eliteChancePerDepth: 0.015,
  bossEvery: 5, // a (mini)boss caps every N endless waves
  swarmEvery: 4, // a swarm-event wave every N waves
  eliteHpMult: 3, // an elite-promoted enemy's HP / damage / bounty multipliers
  eliteDmgMult: 1.5,
  eliteBountyMult: 3,
  // threat cost per archetype (cheaper = more of them in a wave)
  cost: { runner: 1, rusher: 1.2, brute: 3, burrower: 2.4, flyer: 2.2, tank: 4, tyrant: 20 } as Record<string, number>,
};

// ── Future content registry: biomes (framework only — no content yet) ────────
// Towers/enemies/heroes/cards/upgrades/chests self-register above; bosses + equipment
// own registries in their modules (boss.ts / equipment.ts). Biomes have no content yet,
// so their registry stands ready for self-registration (STAGES.md / LIVING-HIVE.md).
export interface BiomeDef {
  id: string;
  name: string;
}
export const biomeRegistry = new Registry<BiomeDef>('biome', { idOf: (d) => d.id });
