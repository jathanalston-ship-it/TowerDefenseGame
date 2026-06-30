// Generic ability-component system. A tower or hero's combat behavior is DATA — a
// list of reusable AbilityComponents — interpreted by ONE shared executor, instead of
// bespoke per-unit code. A future tower or hero composes its kit from these blocks
// (projectile, aura, explosion, chain, status, pierce, crit, heal, shield, buff,
// debuff, summon) with NO new sim code; the executor for each block already exists.
//
// Boundary: the Game implements `AbilityContext` (the sim primitives executors call) —
// executors never touch Game internals, so abilities compose without coupling. This
// module is pure (no Game/DOM import), keeping it testable and cycle-free.

import type { Enemy, ProjectileBehavior, StatusType } from './types';

// ── The component vocabulary ─────────────────────────────────────────────────
// Discriminated by `type`. Damage values are BASE; the caster's damage multiplier is
// applied at cast time, so the same component scales with stars / cards / overcharge.

/** Fire one or more homing/splash/parasite projectiles at picked target(s). */
export interface ProjectileAbility {
  type: 'projectile';
  behavior: ProjectileBehavior;
  damage: number;
  speed: number;
  range: number;
  splash?: number; // splash radius for 'splash' (0/undefined = single target)
  count?: number; // distinct targets (default 1); homing also honors mods.extraProjectiles
}
/** A periodic in-range pulse: chip damage and/or a status to everything in radius. */
export interface AuraAbility {
  type: 'aura';
  radius: number;
  damage?: number;
  status?: StatusApplication;
  react?: boolean; // whether damage can trigger reactions (e.g. Shred). Default false.
  particle?: ParticleKind;
}
/** An instant AoE burst centered at the cast point (hero leaps, bloom, override). */
export interface ExplosionAbility {
  type: 'explosion';
  radius: number;
  damage?: number;
  status?: StatusApplication;
  react?: boolean; // default true (burst hits trigger reactions)
  particle?: ParticleKind;
}
/** Bounce a diminishing hit between nearby enemies. */
export interface ChainAbility {
  type: 'chain';
  jumps: number;
  range: number;
  damage: number;
  falloff?: number; // per-jump damage multiplier (default 0.7)
}
/** Apply a status to the cast's primary target. */
export interface StatusAbility {
  type: 'status';
  status: StatusApplication;
}
/** Modifier: make the accompanying projectile pierce N extra enemies (framework hook). */
export interface PierceAbility {
  type: 'pierce';
  extra: number;
}
/** Modifier: chance to multiply the primary target's hit (rolls the gameplay rng). */
export interface CritAbility {
  type: 'crit';
  chance: number;
  mult: number;
  damage: number; // base damage the crit applies
}
/** Restore Nucleus integrity and/or heal the caster (hero). */
export interface HealAbility {
  type: 'heal';
  nucleus?: number;
  self?: number;
}
/** Grant the caster a damage-absorbing shield: an absorb pool soaked before HP for
 *  `seconds`. Live for heroes (Game.grantShield → Hero.shield/shieldTime; Shepherd's Bloom). */
export interface ShieldAbility {
  type: 'shield';
  amount: number;
  seconds: number;
}
/** A timed, run-wide friendly buff: scales `stat` by `amount` (a multiplier, 1.2 = +20%)
 *  for `seconds`. Live via Game.grantBuff → the run-buff stack (the Overseer's Mass Override
 *  empowers your towers). A fold point reads each stat key; an unknown stat is simply inert. */
export interface BuffAbility {
  type: 'buff';
  stat: string;
  amount: number;
  seconds: number;
}
/** Apply a negative status to enemies in range. */
export interface DebuffAbility {
  type: 'debuff';
  status: StatusApplication;
  radius: number;
}
/** Summon `count` friendly units of type `unit` (a MINION_DEFS key) at the cast point.
 *  Live via Game.summon → time-limited Minions that seek and strike nearby enemies. */
export interface SummonAbility {
  type: 'summon';
  unit: string;
  count: number;
}

export type AbilityComponent =
  | ProjectileAbility
  | AuraAbility
  | ExplosionAbility
  | ChainAbility
  | StatusAbility
  | PierceAbility
  | CritAbility
  | HealAbility
  | ShieldAbility
  | BuffAbility
  | DebuffAbility
  | SummonAbility;

/** A status applied by a component. `kind` names the effect; `amount` is stacks (for
 * stacking statuses like Fracture/Infection) or seconds (for timed ones). Concrete
 * effects are owned by the status framework; this is just the request. */
export interface StatusApplication {
  kind: StatusType;
  amount: number;
}

// Cosmetic particle vocabulary. The first five are shared with statuses/heroes; the rest are
// per-BRANCH attack signatures (TOWER-BRANCHES.md) so a mutated tower throws a different spray
// of matter every shot. Every kind MUST have a matching `PARTICLE[kind]` spec (config.ts).
export type ParticleKind =
  | 'disrupt' | 'bloom' | 'infect' | 'shred' | 'death'
  | 'barb' // needle Hivemind Swarm — chitinous venom barbs
  | 'spark' // needle Apex Railspike / obelisk Mindrender — electric discharge
  | 'ember' // mortar Necrotic Siege — burning cinders + bone shrapnel
  | 'acid' // mortar Corrosive Cauldron / reactor Acid Glands — caustic droplets
  | 'vital' // reactor Symbiotic Heart — warm biomass motes
  | 'spore' // reactor Brood Spire — drifting brood spores
  | 'gore' // parasite Ravager Strain — viscera spray
  // ── Branch APEX signatures (BRANCH-EVOLUTION.md §5): denser/recoloured siblings a branch
  //    matures INTO at its high tiers, so a maxed path reads differently from a fresh splice. ──
  | 'venom' // Hivemind Swarm T3+ — venom-slick caustic mist
  | 'barbstorm' // Hivemind Swarm T5 — a shredding barb storm
  | 'railburst' // Railspike / Mindrender apex — electric detonation
  | 'shrapnel' // Necrotic Siege apex — bone shrapnel burst
  | 'dissolve' // Corrosive Cauldron apex — fungal melt bloom
  | 'pandemic' // Viral Apex T5 — an outbreak spore burst
  | 'vitalcore'; // Symbiotic Heart T5 — vital-nova motes

// ── The world API executors are given (implemented by the Game) ──────────────

/** A single ability cast: origin, damage multiplier, and an optional primary target
 * (e.g. a projectile/status that needs a specific enemy). */
export interface AbilityCast {
  x: number;
  y: number;
  damageMult: number;
  target?: Enemy | null;
  pierce?: number; // pending pierce a 'pierce' component adds to projectiles fired this cast
}

export interface AbilityContext {
  pickTargets(x: number, y: number, range: number, n: number): Enemy[];
  forEnemiesInRadius(x: number, y: number, r: number, fn: (e: Enemy) => void): void;
  nearestEnemy(x: number, y: number, range: number, exclude: Set<number>): Enemy | null;
  fireProjectile(
    x: number, y: number, target: Enemy | null, tx: number, ty: number,
    behavior: ProjectileBehavior, damage: number, speed: number, splash: number,
  ): void;
  dealDamage(e: Enemy, raw: number, flash: boolean): number;
  applyStatus(e: Enemy, status: StatusApplication): void;
  reactOnHit(e: Enemy): void; // trigger reactions (e.g. Shred) after a hit
  healNucleus(amount: number): void;
  healCaster(amount: number): void;
  grantShield(amount: number, seconds: number): void;
  grantBuff(stat: string, amount: number, seconds: number): void; // timed run-wide friendly buff
  summon(unit: string, count: number, x: number, y: number): void; // spawn friendly units at (x,y)
  readonly extraProjectiles: number; // adds to a homing projectile's `count`
  readonly splashMult: number; // scales a projectile's splash radius
  readonly rangeMult: number; // identity-range: scales targeting range + aura/field radius (1 = base)
  particles(x: number, y: number, kind: ParticleKind): void;
  sfx(k: string): void;
  roll(): number; // deterministic gameplay rng (crit etc.)
}

// ── Executors (one per component type) — return whether they DID something, which
//    the tower loop uses to gate cooldown (a projectile with no target must not reset).

type Executor<C extends AbilityComponent> = (ctx: AbilityContext, comp: C, cast: AbilityCast) => boolean;

function execProjectile(ctx: AbilityContext, comp: ProjectileAbility, cast: AbilityCast): boolean {
  const dmg = comp.damage * cast.damageMult;
  const range = comp.range * ctx.rangeMult; // identity-range upgrade (needle engagement)
  if (comp.behavior === 'splash') {
    const target = cast.target ?? ctx.pickTargets(cast.x, cast.y, range, 1)[0];
    if (!target) return false;
    ctx.fireProjectile(cast.x, cast.y, null, target.x, target.y, 'splash', dmg, comp.speed, (comp.splash ?? 0) * ctx.splashMult);
    return true;
  }
  const count = (comp.count ?? 1) + (comp.behavior === 'homing' ? ctx.extraProjectiles : 0);
  const targets = cast.target ? [cast.target] : ctx.pickTargets(cast.x, cast.y, range, count);
  if (targets.length === 0) return false;
  for (const e of targets) ctx.fireProjectile(cast.x, cast.y, e, e.x, e.y, comp.behavior, dmg, comp.speed, 0);
  return true;
}

function execAura(ctx: AbilityContext, comp: AuraAbility, cast: AbilityCast): boolean {
  let hit = false;
  ctx.forEnemiesInRadius(cast.x, cast.y, comp.radius * ctx.rangeMult, (e) => { // identity-range (obelisk pulse radius)
    if (comp.status) ctx.applyStatus(e, comp.status);
    if (comp.damage) {
      ctx.dealDamage(e, comp.damage * cast.damageMult, true);
      if (comp.react) ctx.reactOnHit(e);
    }
    hit = true;
  });
  if (hit && comp.particle) ctx.particles(cast.x, cast.y, comp.particle);
  return true; // a pulse cycles on its rhythm whether or not it caught anything
}

function execExplosion(ctx: AbilityContext, comp: ExplosionAbility, cast: AbilityCast): boolean {
  const react = comp.react ?? true;
  ctx.forEnemiesInRadius(cast.x, cast.y, comp.radius * ctx.rangeMult, (e) => { // identity/ability-range (hero ability radius)
    if (comp.damage) ctx.dealDamage(e, comp.damage * cast.damageMult, true);
    if (comp.status) ctx.applyStatus(e, comp.status);
    if (react) ctx.reactOnHit(e);
  });
  if (comp.particle) ctx.particles(cast.x, cast.y, comp.particle);
  return true;
}

function execChain(ctx: AbilityContext, comp: ChainAbility, cast: AbilityCast): boolean {
  const falloff = comp.falloff ?? 0.7;
  const hit = new Set<number>();
  let from = cast.target ?? ctx.nearestEnemy(cast.x, cast.y, comp.range, hit);
  let dmg = comp.damage * cast.damageMult;
  let any = false;
  for (let j = 0; j < comp.jumps && from; j++) {
    hit.add(from.id);
    ctx.dealDamage(from, dmg, true);
    ctx.reactOnHit(from);
    any = true;
    dmg *= falloff;
    from = ctx.nearestEnemy(from.x, from.y, comp.range, hit);
  }
  return any;
}

function execStatus(ctx: AbilityContext, comp: StatusAbility, cast: AbilityCast): boolean {
  if (!cast.target) return false;
  ctx.applyStatus(cast.target, comp.status);
  return true;
}

function execCrit(ctx: AbilityContext, comp: CritAbility, cast: AbilityCast): boolean {
  if (!cast.target) return false;
  const mult = ctx.roll() < comp.chance ? comp.mult : 1;
  ctx.dealDamage(cast.target, comp.damage * cast.damageMult * mult, true);
  ctx.reactOnHit(cast.target);
  return true;
}

function execHeal(ctx: AbilityContext, comp: HealAbility, _cast: AbilityCast): boolean {
  if (comp.nucleus) ctx.healNucleus(comp.nucleus);
  if (comp.self) ctx.healCaster(comp.self);
  return true;
}

function execShield(ctx: AbilityContext, comp: ShieldAbility, _cast: AbilityCast): boolean {
  ctx.grantShield(comp.amount, comp.seconds);
  return true;
}

function execDebuff(ctx: AbilityContext, comp: DebuffAbility, cast: AbilityCast): boolean {
  ctx.forEnemiesInRadius(cast.x, cast.y, comp.radius, (e) => ctx.applyStatus(e, comp.status));
  return true;
}

// `buff` applies a timed run-wide modifier (Game.grantBuff); `summon` spawns time-limited
// friendly units at the cast point (Game.summon). With these, every component type in the
// vocabulary is live — no reserved executors remain.
function execBuff(ctx: AbilityContext, comp: BuffAbility, _cast: AbilityCast): boolean {
  ctx.grantBuff(comp.stat, comp.amount, comp.seconds);
  return true;
}
function execSummon(ctx: AbilityContext, comp: SummonAbility, cast: AbilityCast): boolean {
  ctx.summon(comp.unit, comp.count, cast.x, cast.y);
  return true;
}
function execPierce(_ctx: AbilityContext, comp: PierceAbility, cast: AbilityCast): boolean {
  // Modifier: projectiles fired LATER in this cast pass through `extra` more enemies. The
  // sim reads `cast.pierce` at spawn (see Game.spawnProjectile) and applies it to the shot.
  cast.pierce = (cast.pierce ?? 0) + comp.extra;
  return true;
}

/** The executor registry — the one place a component type maps to its behavior. A new
 * component type is a union member + one entry here (no scattered switch in the sim). */
const EXECUTORS: { [K in AbilityComponent['type']]: Executor<Extract<AbilityComponent, { type: K }>> } = {
  projectile: execProjectile,
  aura: execAura,
  explosion: execExplosion,
  chain: execChain,
  status: execStatus,
  pierce: execPierce,
  crit: execCrit,
  heal: execHeal,
  shield: execShield,
  buff: execBuff,
  debuff: execDebuff,
  summon: execSummon,
};

/** Run one component; returns whether it acted (fired / pulsed / healed …). */
export function runAbility(ctx: AbilityContext, comp: AbilityComponent, cast: AbilityCast): boolean {
  return (EXECUTORS[comp.type] as Executor<AbilityComponent>)(ctx, comp, cast);
}

/** Run a kit (list of components) for one cast — how a tower/hero "does its thing".
 * Returns whether ANY component acted (the tower loop gates cooldown on this). */
export function runAbilities(ctx: AbilityContext, comps: readonly AbilityComponent[], cast: AbilityCast): boolean {
  let acted = false;
  for (const c of comps) acted = runAbility(ctx, c, cast) || acted;
  return acted;
}
