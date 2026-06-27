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
  // Range is identity (docs/RANGE.md): each class owns a distinct vertical engagement
  // band on the ~920px-tall lane, traded against DPS / cadence / cost. Long reach pays
  // it back with low sustained DPS and/or slow cadence — never a free stat.
  needle: {
    kind: 'needle',
    name: 'Needle Spitter',
    combatClass: 'Kinetic',
    firing: 'homing',
    cost: 100,
    range: 700, // MARKSMAN — very long; opens fire shortly after enemies spawn
    fireInterval: 0.4, // fast cadence = fast Fracture stacking over the long approach
    damage: 3, // low per-shot: it CHIPS + tags the whole lane, it does not burst
    projectileSpeed: 640, // snappy enough to connect across its long reach
    splash: 0,
    color: '#5ad1ff',
    blurb: 'Very long range — peppers from afar, stacking Fracture (armor shred).',
  },
  mortar: {
    kind: 'mortar',
    name: 'Bone Mortar',
    combatClass: 'Caustic',
    firing: 'splash',
    cost: 170, // premium: full-map area denial
    range: 960, // ARTILLERY — essentially full-map; suppresses from the spawn line
    fireInterval: 2.1, // very slow cadence is the balance for unlimited reach
    damage: 8, // softens clusters from afar — it suppresses, the kill happens down-lane
    projectileSpeed: 420, // arcs across the lane in a few seconds
    splash: 60,
    color: '#b6e84a',
    blurb: 'Full-map artillery. Slow, arcing AoE; leaves Corrosion pools (DoT + slow).',
  },
  reactor: {
    kind: 'reactor',
    name: 'Flesh Reactor',
    combatClass: 'Vital',
    firing: 'support',
    cost: 120,
    range: 90, // SUPPORT — very short; this IS the overcharge SUPPORT RADIUS (towers whose
    // centre lies within it are overcharged). 90px catches orthogonal lattice neighbours
    // (80px) and excludes diagonals (≈113px); the "+support radius" mastery widens it.
    fireInterval: 0,
    damage: 0,
    projectileSpeed: 0,
    splash: 0,
    color: '#ff7a59',
    blurb: 'Generates biomass; overcharges NEARBY towers (+dmg, +rate).',
  },
  parasite: {
    kind: 'parasite',
    name: 'Parasite Nest',
    combatClass: 'Viral',
    firing: 'infest', // homing parasite that seeds ramping, armor-ignoring Infection
    cost: 130,
    range: 280, // SKIRMISHER — medium; only reaches the mid-field when placed FORWARD
    fireInterval: 0.85,
    damage: 6, // low on impact — the ramping Infection DoT + spread is the payoff
    projectileSpeed: 360,
    splash: 0,
    color: '#e24dff',
    blurb: 'Medium range — place forward. Seeds Infection: ramping armor-ignoring DoT.',
  },
  obelisk: {
    kind: 'obelisk',
    name: 'Neural Obelisk',
    combatClass: 'Neural',
    firing: 'field', // periodic psionic pulse — no projectile; debuffs in range
    cost: 165, // premium control anchor
    range: 360, // CONTROL — very large support radius; the widest footprint in the game
    fireInterval: 1.1, // pulse cadence
    damage: 5, // token chip; its value is the Disruption (slow + vulnerability)
    projectileSpeed: 0,
    splash: 0,
    color: '#6e7bff',
    blurb: 'Wide control field — slows + makes enemies take more from ALL sources.',
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
  // ── Role traits (all OPTIONAL; absent = a baseline melee-at-the-line enemy). Each is read
  //    by exactly ONE gated hook in the sim, so a new enemy is pure data — and the historical
  //    seven, which set none of these, are byte-identical (the golden invariant). ──
  shieldHp?: number; // Shielded: a front shield soaked before HP
  regenPerSec?: number; // Regenerating: HP/sec self-heal while alive
  summon?: { kind: EnemyKind; count: number; interval: number }; // Summoner: periodic adds
  auraRadius?: number; // Support: aura reach (px)
  auraRegenPerSec?: number; // Support: heal allies inside the aura
  auraShield?: number; // Support: top up allies' shields inside the aura
  explodeRadius?: number; // Suicide: blast reach at the line (px)
  explodeDamage?: number; // Suicide: blast damage to the Nucleus + the hero
  siege?: { range: number; damage: number; interval: number }; // Artillery: standoff bombard
}

// ~30 archetypes across 12 ROLES. Every entry trades on a distinct battlefield identity that
// forces a DIFFERENT placement decision (coverage geometry, focus vs spread, intercept timing),
// not a stat slide. The historical seven (runner/brute/tyrant/rusher/tank/flyer/burrower) keep
// their EXACT values — they carry no traits, so the golden run is byte-identical. Roles are
// documented in docs/ENEMIES.md. Colors are placeholder art (the renderer draws by color/radius).
export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  // ── SWARM — many, weak, spread; demand AoE/splash over single-target ──
  runner: {
    kind: 'runner', name: 'Skitterling', hp: 36, armor: 0, speed: 72, bounty: 11, damage: 4, radius: 10, color: '#d98cff',
    behavior: { seek: 1, avoidTowers: 0.28, avoidHero: 0.5, separation: 0.55, jitter: 0.16 },
  },
  mite: {
    kind: 'mite', name: 'Gnat Mite', hp: 14, armor: 0, speed: 96, bounty: 5, damage: 2, radius: 6, color: '#f0a0d8',
    behavior: { seek: 1.1, avoidTowers: 0.1, avoidHero: 0.6, separation: 0.7, jitter: 0.28 }, // a fragile cloud → splash-or-die
  },
  larva: {
    kind: 'larva', name: 'Writhing Larva', hp: 24, armor: 0, speed: 40, bounty: 4, damage: 3, radius: 9, color: '#c8e0a0',
    behavior: { seek: 1, avoidTowers: 0.05, avoidHero: 0.1, separation: 0.5, jitter: 0.1 }, // slow chaff that clogs the lane
  },
  // ── FAST — high speed, beeline; need front-loaded DPS / static coverage ──
  rusher: {
    kind: 'rusher', name: 'Razor Sprinter', hp: 28, armor: 0, speed: 132, bounty: 9, damage: 5, radius: 8, color: '#ff5db0',
    behavior: { seek: 1.2, avoidTowers: 0, avoidHero: 0, separation: 0.2, jitter: 0.04 }, // beelines, ignores defenses
  },
  darter: {
    kind: 'darter', name: 'Synapse Darter', hp: 30, armor: 0, speed: 150, bounty: 11, damage: 5, radius: 8, color: '#ff79c0',
    behavior: { seek: 1.25, avoidTowers: 0.1, avoidHero: 0.9, separation: 0.2, jitter: 0.2 }, // slips PAST the hero → static front
  },
  lasher: {
    kind: 'lasher', name: 'Whip Lasher', hp: 44, armor: 0, speed: 118, bounty: 13, damage: 7, radius: 10, color: '#ff6088',
    behavior: { seek: 1.3, avoidTowers: 0, avoidHero: 0, separation: 0.15, jitter: 0.03 }, // shortest-line charge → punishes gaps
  },
  // ── HEAVY — high HP/armor, slow; lean on shred + sustained focus ──
  brute: {
    kind: 'brute', name: 'Carrion Brute', hp: 150, armor: 8, speed: 42, bounty: 26, damage: 9, radius: 14, color: '#7b9cff',
    behavior: { seek: 1, avoidTowers: 0.16, avoidHero: 0.22, separation: 0.4, jitter: 0.06 },
  },
  tank: {
    kind: 'tank', name: 'Carapace Hauler', hp: 430, armor: 18, speed: 30, bounty: 60, damage: 14, radius: 18, color: '#5fd0c6',
    behavior: { seek: 1, avoidTowers: 0.08, avoidHero: 0, separation: 0.3, jitter: 0.02 }, // soaks, unbothered
  },
  golem: {
    kind: 'golem', name: 'Calcified Golem', hp: 360, armor: 26, speed: 28, bounty: 55, damage: 16, radius: 17, color: '#9aa6b8',
    behavior: { seek: 1, avoidTowers: 0.06, avoidHero: 0, separation: 0.25, jitter: 0.02 }, // walking armor → Fracture/Corrosion
  },
  colossus: {
    kind: 'colossus', name: 'Bonecrusher Colossus', hp: 1100, armor: 12, speed: 22, bounty: 140, damage: 40, radius: 24, color: '#6b7a55',
    behavior: { seek: 1, avoidTowers: 0.03, avoidHero: 0, separation: 0.12, jitter: 0 }, // an HP mountain → concentrated fire
  },
  // ── SHIELDED — a front shield soaks before HP; burst to crack, then finish ──
  bulwark: {
    kind: 'bulwark', name: 'Aegis Drone', hp: 90, armor: 4, speed: 46, bounty: 30, damage: 8, radius: 13, color: '#7fd0ff', shieldHp: 120,
    behavior: { seek: 1, avoidTowers: 0.1, avoidHero: 0.1, separation: 0.3, jitter: 0.05 }, // 120 shield first → reward burst
  },
  warden: {
    kind: 'warden', name: 'Bastion Warden', hp: 260, armor: 12, speed: 30, bounty: 70, damage: 16, radius: 18, color: '#5fa8d0', shieldHp: 200,
    behavior: { seek: 1, avoidTowers: 0.06, avoidHero: 0, separation: 0.25, jitter: 0.02 }, // shield + armor + HP = a triple wall
  },
  // ── REGENERATING — heals over time; out-DPS / burst or it never dies ──
  knitter: {
    kind: 'knitter', name: 'Flesh Knitter', hp: 130, armor: 4, speed: 60, bounty: 34, damage: 9, radius: 13, color: '#7ce0a0', regenPerSec: 26,
    behavior: { seek: 1, avoidTowers: 0.12, avoidHero: 0.2, separation: 0.3, jitter: 0.08 }, // mends 26/s → needs burst DPS
  },
  revenant: {
    kind: 'revenant', name: 'Bog Revenant', hp: 320, armor: 8, speed: 34, bounty: 70, damage: 14, radius: 16, color: '#4fb87a', regenPerSec: 48,
    behavior: { seek: 1, avoidTowers: 0.06, avoidHero: 0, separation: 0.2, jitter: 0.03 }, // mends 48/s → a focused kill-lane
  },
  // ── BURROWING — ignores obstacles, hunts gaps; demands even coverage ──
  burrower: {
    kind: 'burrower', name: 'Gut Tunneler', hp: 90, armor: 6, speed: 58, bounty: 22, damage: 8, radius: 12, color: '#e8a04a',
    behavior: { seek: 1, avoidTowers: 0.55, avoidHero: 0.4, separation: 0.3, jitter: 0.1, burrowing: true }, // tunnels gaps
  },
  molerat: {
    kind: 'molerat', name: 'Sand Stalker', hp: 70, armor: 4, speed: 78, bounty: 20, damage: 8, radius: 11, color: '#d8a850',
    behavior: { seek: 1.1, avoidTowers: 0.7, avoidHero: 0.4, separation: 0.3, jitter: 0.12, burrowing: true }, // fast gap-hunter
  },
  // ── FLYING — over all obstacles; need anti-air / wide coverage ──
  flyer: {
    kind: 'flyer', name: 'Spore Drifter', hp: 60, armor: 2, speed: 64, bounty: 18, damage: 7, radius: 11, color: '#c0a3ff',
    behavior: { seek: 1, avoidTowers: 0.12, avoidHero: 0.35, separation: 0.3, jitter: 0.12, flying: true }, // over obstacles
  },
  wisp: {
    kind: 'wisp', name: 'Mind Wisp', hp: 40, armor: 0, speed: 92, bounty: 16, damage: 6, radius: 9, color: '#b0c8ff',
    behavior: { seek: 1.1, avoidTowers: 0.15, avoidHero: 0.4, separation: 0.3, jitter: 0.18, flying: true }, // fast air → anti-air
  },
  gargoyle: {
    kind: 'gargoyle', name: 'Bone Gargoyle', hp: 180, armor: 14, speed: 48, bounty: 48, damage: 13, radius: 15, color: '#8898b0',
    behavior: { seek: 1, avoidTowers: 0.08, avoidHero: 0.1, separation: 0.25, jitter: 0.06, flying: true }, // armored air → shred AA
  },
  // ── SUMMONER — spawns adds on a timer; priority-kill or drown in swarm ──
  broodmother: {
    kind: 'broodmother', name: 'Brood Matron', hp: 200, armor: 6, speed: 38, bounty: 80, damage: 10, radius: 17, color: '#e070c0',
    summon: { kind: 'mite', count: 2, interval: 3.5 },
    behavior: { seek: 1, avoidTowers: 0.1, avoidHero: 0.15, separation: 0.25, jitter: 0.06 }, // births mites → focus it down
  },
  hivecaller: {
    kind: 'hivecaller', name: 'Hive Caller', hp: 170, armor: 4, speed: 34, bounty: 85, damage: 9, radius: 16, color: '#c060a0', shieldHp: 90,
    summon: { kind: 'larva', count: 3, interval: 5 },
    behavior: { seek: 1, avoidTowers: 0.08, avoidHero: 0.1, separation: 0.25, jitter: 0.05 }, // shielded caller → crack then silence
  },
  // ── SUPPORT — auras that heal/shield allies; kill the support FIRST ──
  mender: {
    kind: 'mender', name: 'Vital Mender', hp: 110, armor: 2, speed: 48, bounty: 60, damage: 5, radius: 12, color: '#7cf0b0',
    auraRadius: 96, auraRegenPerSec: 18,
    behavior: { seek: 1, avoidTowers: 0.2, avoidHero: 0.5, separation: 0.35, jitter: 0.1 }, // heals the pack 18/s → kill the healer
  },
  cantor: {
    kind: 'cantor', name: 'Aegis Cantor', hp: 120, armor: 4, speed: 44, bounty: 64, damage: 5, radius: 13, color: '#7cb0f0',
    auraRadius: 104, auraShield: 60,
    behavior: { seek: 1, avoidTowers: 0.2, avoidHero: 0.45, separation: 0.35, jitter: 0.08 }, // shields the pack 60 → silence it
  },
  // ── SUICIDE — fragile bombs that detonate at the line; intercept early ──
  bomber: {
    kind: 'bomber', name: 'Bile Bomber', hp: 50, armor: 0, speed: 104, bounty: 18, damage: 28, radius: 11, color: '#ff9a3d',
    explodeRadius: 70, explodeDamage: 28,
    behavior: { seek: 1.25, avoidTowers: 0.05, avoidHero: 0, separation: 0.2, jitter: 0.06 }, // fast bomb → kill it BEFORE the line
  },
  popper: {
    kind: 'popper', name: 'Spore Popper', hp: 90, armor: 2, speed: 40, bounty: 22, damage: 36, radius: 14, color: '#ffb84d',
    explodeRadius: 96, explodeDamage: 40,
    behavior: { seek: 1, avoidTowers: 0.1, avoidHero: 0.1, separation: 0.25, jitter: 0.05 }, // a slow walking mine → kill it clear
  },
  // ── ARTILLERY — halt short of the line and bombard the Nucleus from range ──
  siegeworm: {
    kind: 'siegeworm', name: 'Siege Maw', hp: 240, armor: 8, speed: 30, bounty: 75, damage: 6, radius: 17, color: '#c0d080',
    siege: { range: 220, damage: 6, interval: 1.6 },
    behavior: { seek: 1, avoidTowers: 0.05, avoidHero: 0, separation: 0.2, jitter: 0.02 }, // shells from 220px → reach it mid-field
  },
  spitter: {
    kind: 'spitter', name: 'Acid Spitter', hp: 110, armor: 2, speed: 44, bounty: 40, damage: 4, radius: 12, color: '#a0d060',
    siege: { range: 180, damage: 4, interval: 1.2 },
    behavior: { seek: 1.05, avoidTowers: 0.1, avoidHero: 0.2, separation: 0.25, jitter: 0.08 }, // nimble standoff → mid-field DPS
  },
  // ── ELITE / APEX — premium multi-threats that fuse several roles ──
  apex: {
    kind: 'apex', name: 'Apex Predator', hp: 280, armor: 10, speed: 86, bounty: 120, damage: 18, radius: 16, color: '#ffcf5a', regenPerSec: 20,
    behavior: { seek: 1.1, avoidTowers: 0.1, avoidHero: -0.6, separation: 0.2, jitter: 0.06 }, // regenerates AND hunts the hero
  },
  dreadnought: {
    kind: 'dreadnought', name: 'Dread Nought', hp: 520, armor: 16, speed: 26, bounty: 160, damage: 22, radius: 20, color: '#b85a5a', shieldHp: 260,
    summon: { kind: 'larva', count: 2, interval: 6 },
    behavior: { seek: 1, avoidTowers: 0.04, avoidHero: 0, separation: 0.18, jitter: 0.01 }, // shielded, larva-spewing capstone
  },
  tyrant: {
    kind: 'tyrant', name: 'Brood Tyrant', hp: 900, armor: 14, speed: 32, bounty: 180, damage: 45, radius: 26, color: '#ff4d6d',
    behavior: { seek: 1, avoidTowers: 0.05, avoidHero: 0, separation: 0.18, jitter: 0 },
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
  // ── Reward-moment spectacle (cosmetic; never affects the pinned sim outcomes) ──
  bossfall: { count: 30, speed: 190, life: 0.95, size: 3.6, color: '#ffd24d' }, // a boss detonating into biomass
  celebrate: { count: 22, speed: 150, life: 1.1, size: 3.0, color: '#b6e84a' }, // wave-clear / extraction bloom
};

// Per-wave HP/bounty growth so later waves bite (finite — slice ends at wave 12).
// These are the BASE escalation curve; the universal difficulty framework
// (difficulty.ts) layers global scalars on top of them, leaving these untouched.
export const WAVE_HP_GROWTH = 0.12; // +12% enemy HP per wave index
export const WAVE_BOUNTY_GROWTH = 0.05;

// Auto-start: when the player enables it, the next wave fires automatically after this many
// prep seconds (a visible countdown). Opt-in + off by default, so the golden run — which starts
// waves manually — is byte-identical.
export const AUTO_START_DELAY = 4; // seconds of prep before an auto-start fires the next wave
// The opening prep (before any wave) gets a longer window once the player places their first
// tower, so auto-start doesn't rush the initial build-out.
export const AUTO_START_FIRST_DELAY = 8; // seconds granted on the first tower of the opening prep

// ── Spawn scheduling (spawndirector.ts) ──────────────────────────────────────
// The Spawn Director owns the MECHANICS of emitting spawns (spacing/timing/pacing),
// decoupled from WHAT spawns (composition: WAVES / AI Director) and from enemy AI
// (movement). These were inline magic numbers in the spawn path; centralizing them
// here (CLAUDE.md: centralize tunables) keeps the scripted/endless queues byte-identical
// (the values equal the former literals) while making cadence a single tunable surface.
export const SPAWN = {
  // Endless (AI-Director-driven) cadence:
  endlessStartOffset: 0.5, // seconds before the first directed group spawns
  endlessIntraGroup: 0.5, // seconds between spawns WITHIN a directed group
  endlessInterGroup: 0.35, // extra offset added between consecutive groups
  // Swarm special-event burst (a mid-wave flood of chaff):
  swarmDelay: 3, // seconds into the wave the burst begins
  swarmSpacing: 0.18, // seconds between burst spawns
  swarmCount: 12, // burst size
  swarmKind: 'runner' as EnemyKind, // archetype the burst floods with
};

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

// ── Reaction matrix (reactions.ts) — co-present statuses combust ──────────────
// Generalizes the original Shred into the 6 pairings of the 4 statuses. Shred itself keeps
// the STATUS.shred* numbers (unchanged); the other five reactions are new. All placeholder
// starting points. Reactions only ever involve Infection/Disruption beyond Shred, so a run
// without Parasite/Obelisk (e.g. the golden run) only ever produces Shred — byte-identical.
export const REACTIONS = {
  virulenceBase: 14, // Fracture+Infection: wounds feed the plague (true burst)
  virulencePerStack: 4,
  detonateBase: 30, // Fracture+Disruption: the destabilized shell detonates (burst)
  detonatePerStack: 12,
  putrefyBase: 26, // Corrosion+Infection: acid rot + plague acceleration (true)
  putrefyInfectAdd: 3,
  dissolveBase: 22, // Corrosion+Disruption: armor fully melts (+ a true tick)
  dissolveBreak: 3.0, // seconds of zero armor
  plagueBase: 18, // Infection+Disruption: vulnerable plague blooms + leaps
  plaguePerStack: 5,
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

// The Final Defense Zone — the red last-stand band nearest the Hive Core (the inner
// part of the defensive region). An enemy inside it puts the Hive into Emergency Defense
// Mode: every offensive tower gains unlimited targeting range against in-zone enemies,
// prioritising the breach nearest the core. See docs/RANGE.md §4.
export const FINAL_DEFENSE = {
  fraction: 0.14, // bottom 14% of the arena (≈4 rows, y ≥ 800) is the Final Defense Zone
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
/** Reveal flare tiers (shared with equipment's Rarity literals). */
export type LootRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'exotic';
export type MaterialKind = 'mutagen' | 'scrap' | 'catalyst';

/** One reward pool a chest roll can land in — DATA-DRIVEN so a new reward system is
 * added here, not in roller code. Future pools (cosmetic/relic/event) are real
 * shapes; a chest simply gives them weight once that content exists. */
export type PoolSpec =
  | { pool: 'tower'; range: [number, number] }
  | { pool: 'hero'; range: [number, number] }
  | { pool: 'material'; mats: MaterialKind[]; range: [number, number] }
  | { pool: 'equipment'; wave: number } // equipment quality scales with `wave`
  | { pool: 'cosmetic'; ids: string[] } // future seam
  | { pool: 'relic'; ids: string[] } // future seam
  | { pool: 'event'; currency: string; range: [number, number] }; // future seam

/** A weighted entry in a chest's loot table. `rarity` = the reveal flare for items
 * from this pool (equipment overrides with its own rolled rarity). */
export interface WeightedPool {
  weight: number;
  rarity?: LootRarity;
  spec: PoolSpec;
}

export interface ChestDef {
  id: string;
  name: string;
  rarity: string; // chest tier id (standard → rich → prime)
  rolls: number; // independent reward pulls revealed in sequence
  pools: WeightedPool[]; // weighted reward table — tiers emphasize different pools
}

// Each tier emphasizes different reward pools (the rarity → reward-pool mapping):
//   standard = tower-shard floor; rich = adds equipment + materials; prime = leans
//   hard into equipment + hero + premium materials. Pools are data — retuning the
//   reward economy is a weight edit, and a new reward system is a new pool entry.
export const CHESTS: Record<string, ChestDef> = {
  standard: {
    id: 'standard',
    name: 'Biomass Cache',
    rarity: 'standard',
    rolls: 4,
    pools: [
      { weight: 6, rarity: 'common', spec: { pool: 'tower', range: [2, 5] } },
      { weight: 2, rarity: 'rare', spec: { pool: 'hero', range: [1, 1] } },
      { weight: 3, rarity: 'common', spec: { pool: 'material', mats: ['scrap', 'mutagen'], range: [1, 2] } },
    ],
  },
  rich: {
    id: 'rich',
    name: 'Mutagen Vault',
    rarity: 'rich',
    rolls: 5,
    pools: [
      { weight: 4, rarity: 'rare', spec: { pool: 'tower', range: [3, 7] } },
      { weight: 3, rarity: 'rare', spec: { pool: 'hero', range: [1, 2] } },
      { weight: 3, rarity: 'rare', spec: { pool: 'material', mats: ['scrap', 'mutagen', 'catalyst'], range: [1, 3] } },
      { weight: 2, spec: { pool: 'equipment', wave: 7 } },
    ],
  },
  prime: {
    id: 'prime',
    name: 'Apex Reliquary',
    rarity: 'prime',
    rolls: 6,
    pools: [
      { weight: 3, rarity: 'epic', spec: { pool: 'tower', range: [5, 10] } },
      { weight: 3, rarity: 'epic', spec: { pool: 'hero', range: [1, 2] } },
      { weight: 2, rarity: 'epic', spec: { pool: 'material', mats: ['catalyst', 'mutagen'], range: [2, 4] } },
      { weight: 4, spec: { pool: 'equipment', wave: 12 } },
    ],
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
  chargeSpeedMult: 2.6, // charger module: movement multiplier during a telegraphed dash
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
  // threat cost per archetype (cheaper = more of them in a wave). New roles cost more so the
  // Director fields fewer of them; anything omitted falls back to 2 (see Director.spend).
  cost: {
    runner: 1, mite: 0.6, larva: 0.7,
    rusher: 1.2, darter: 1.4, lasher: 1.5,
    brute: 3, tank: 4, golem: 4.5, colossus: 14,
    bulwark: 3.5, warden: 6,
    knitter: 3, revenant: 5,
    burrower: 2.4, molerat: 2.6,
    flyer: 2.2, wisp: 2, gargoyle: 4.5,
    broodmother: 7, hivecaller: 7,
    mender: 5, cantor: 5,
    bomber: 2.5, popper: 2.8,
    siegeworm: 6, spitter: 3.5,
    apex: 10, dreadnought: 16, tyrant: 20,
  } as Record<string, number>,
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
