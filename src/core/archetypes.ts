// Enemy Archetypes — the composition kit that builds every enemy from reusable
// parts instead of a bespoke implementation. A new enemy is a `defineEnemy(...)`
// call that combines:
//
//   • STATS     — a StatBlock (hp/armor/speed/bounty/damage/radius)
//   • MOVEMENT  — a named steering profile (the movement AI: seek / avoid / etc.)
//   • ABILITIES — zero+ composable modules (shielded / regenerating / splitter /
//                 ranged) — the only things that add behavior to the sim
//   • VISUAL    — a colour (the renderer derives per-ability "tells" automatically)
//   • ROLE      — a semantic tier (chaff / standard / tank / support / boss)
//
// The simulation reads the resulting `EnemyDef` through fixed hooks, so combining
// archetypes never needs new engine code — only the four ability hooks already in
// game.ts. Scaling the bestiary = adding data (see docs/ENEMIES.md, CONTENT-GUIDE).

import type { EnemyKind } from './types';
import type { BossProfile } from './bosses'; // type-only (no runtime cycle: bosses imports this kit)

// ── AI / MOVEMENT ────────────────────────────────────────────────────────────
/** Steering profile — *how an enemy thinks*. Combined each tick into one movement
 *  vector (Game.enemyMoveSystem). This IS the per-enemy movement AI. */
export interface EnemyBehavior {
  seek: number; // pull toward the line (flow field)
  avoidTowers: number; // steer out of kill-zones → seek gaps (penetration)
  avoidHero: number; // >0 skirt the hero, <0 hunt it
  separation: number; // spread from neighbours
  jitter: number; // organic wander
  flying?: boolean; // ignore ground obstacles (drift straight)
  burrowing?: boolean; // ignore ground obstacles (tunnel under)
}

/** Reusable movement archetypes. New enemies pick one (or `tune` it); these are the
 *  canonical steering styles, not a per-enemy dumping ground. */
export const MOVEMENT = {
  swarmer: { seek: 1, avoidTowers: 0.28, avoidHero: 0.5, separation: 0.55, jitter: 0.16 }, // light, weaves & dodges
  charger: { seek: 1.2, avoidTowers: 0, avoidHero: 0, separation: 0.2, jitter: 0.04 }, // beelines, ignores defenses
  bruiser: { seek: 1, avoidTowers: 0.16, avoidHero: 0.22, separation: 0.4, jitter: 0.06 }, // steady melee advance
  behemoth: { seek: 1, avoidTowers: 0.08, avoidHero: 0, separation: 0.3, jitter: 0.02 }, // soaks, unbothered
  juggernaut: { seek: 1, avoidTowers: 0.05, avoidHero: 0, separation: 0.18, jitter: 0 }, // boss-grade, plows through
  floater: { seek: 1, avoidTowers: 0.12, avoidHero: 0.35, separation: 0.3, jitter: 0.12, flying: true }, // over obstacles
  tunneler: { seek: 1, avoidTowers: 0.55, avoidHero: 0.4, separation: 0.3, jitter: 0.1, burrowing: true }, // seeks gaps
  brooder: { seek: 1, avoidTowers: 0.1, avoidHero: 0.15, separation: 0.35, jitter: 0.05 }, // fat, slow sac
  kiter: { seek: 0.9, avoidTowers: 0.2, avoidHero: 0.75, separation: 0.3, jitter: 0.08 }, // hangs back, keeps range
  knitter: { seek: 1, avoidTowers: 0.16, avoidHero: 0.25, separation: 0.35, jitter: 0.06 }, // support advance
  bulwark: { seek: 1, avoidTowers: 0.1, avoidHero: 0.18, separation: 0.3, jitter: 0.03 }, // shielded front-liner
} satisfies Record<string, EnemyBehavior>;

export type MovementId = keyof typeof MOVEMENT;

/** Derive a movement profile from a base archetype + overrides (compose, don't copy). */
export function tune(base: MovementId, overrides: Partial<EnemyBehavior>): EnemyBehavior {
  return { ...MOVEMENT[base], ...overrides };
}

// ── STATS ────────────────────────────────────────────────────────────────────
export interface StatBlock {
  hp: number;
  armor: number;
  speed: number; // px/sec
  bounty: number; // biomass on death
  damage: number; // integrity damage at the line (the baseline "attack")
  radius: number;
}

/** Semantic tier — documentation + future systems (codex/rewards) key off it. */
export type EnemyRole = 'chaff' | 'standard' | 'tank' | 'support' | 'boss';

// ── ABILITIES (composable modules) ───────────────────────────────────────────
// Each module is one optional field the sim already hooks. `ability.*` factories
// keep call-sites readable and reusable; merge() folds several onto one enemy.
export interface AbilityModule {
  shield?: number; // Shielded — soaks this much before HP
  regen?: { perSec: number; delay: number }; // Regenerating — heals after `delay`s unhurt
  split?: { kind: EnemyKind; count: number }; // Splitter — bursts into these on death
  ranged?: { range: number; damage: number; interval: number; speed: number }; // Ranged attack vs the hero
}

export const ability = {
  shielded: (amount: number): AbilityModule => ({ shield: amount }),
  regenerating: (perSec: number, delay: number): AbilityModule => ({ regen: { perSec, delay } }),
  splitsInto: (kind: EnemyKind, count: number): AbilityModule => ({ split: { kind, count } }),
  ranged: (range: number, damage: number, interval: number, speed: number): AbilityModule => ({
    ranged: { range, damage, interval, speed },
  }),
};

function mergeAbilities(modules: AbilityModule[]): AbilityModule {
  return Object.assign({}, ...modules) as AbilityModule;
}

// ── VISUAL ───────────────────────────────────────────────────────────────────
/** Visual archetype. Colour is the base; the renderer derives ability "tells"
 *  (shield arc, regen cross, splitter seams, ranged maw) from the ability modules,
 *  so visuals stay in lockstep with behaviour automatically. */
export interface VisualSpec {
  color: string;
}

// ── The composed enemy definition (consumed by the sim) ──────────────────────
export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  armor: number;
  speed: number;
  bounty: number;
  damage: number;
  radius: number;
  color: string;
  behavior: EnemyBehavior;
  role: EnemyRole;
  isBoss?: boolean;
  boss?: BossProfile; // present on bosses — phases/abilities/weakness/silhouette (bosses.ts)
  // Ability hooks (flattened from the modules so existing sim reads are unchanged).
  shield?: number;
  regen?: { perSec: number; delay: number };
  split?: { kind: EnemyKind; count: number };
  ranged?: { range: number; damage: number; interval: number; speed: number };
}

/** A new enemy's recipe — combine archetypes; nothing here is bespoke code. */
export interface EnemyBlueprint {
  name: string;
  role: EnemyRole;
  stats: StatBlock;
  movement: EnemyBehavior; // a MOVEMENT profile or tune(...)
  visual: VisualSpec;
  abilities?: AbilityModule[];
  isBoss?: boolean;
  boss?: BossProfile; // bosses only — the phase/ability/weakness/silhouette profile
}

/** Compose a blueprint into the flat EnemyDef the simulation consumes. */
export function defineEnemy(kind: EnemyKind, bp: EnemyBlueprint): EnemyDef {
  const abilities = mergeAbilities(bp.abilities ?? []);
  return {
    kind,
    name: bp.name,
    role: bp.role,
    hp: bp.stats.hp,
    armor: bp.stats.armor,
    speed: bp.stats.speed,
    bounty: bp.stats.bounty,
    damage: bp.stats.damage,
    radius: bp.stats.radius,
    color: bp.visual.color,
    behavior: bp.movement,
    ...(bp.isBoss ? { isBoss: true } : {}),
    ...(bp.boss ? { boss: bp.boss } : {}),
    ...abilities,
  };
}
