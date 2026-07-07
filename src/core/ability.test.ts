// Guards the ability-component framework in isolation: each executor calls the right
// context primitives, the cooldown-gating "acted" signal is correct, and dispatch is
// data-driven. The sim integration (towers/heroes built from components) is covered by
// golden.test / towers.test / heroes.test.

import { describe, it, expect } from 'vitest';
import { runAbility, runAbilities } from './ability';
import type { AbilityComponent, AbilityContext, AbilityCast, StatusApplication } from './ability';
import type { Enemy } from './types';

function fakeEnemy(id: number, x = 0, y = 0): Enemy {
  return {
    id, kind: 'runner', x, y, hp: 100, maxHp: 100, baseArmor: 0, speed: 10, bounty: 1, damage: 1,
    fracture: 0, corrosion: 0, infection: 0, disrupt: 0, shredFlash: 0, hitFlash: 0,
    dmgAccum: 0, dmgTimer: 0, alive: true, sieging: false, ring: 0, attackCd: 0, windup: -1,
    attackInterval: 1, attackWindup: 0.3, lastHitKind: null, boss: null, elite: false,
  };
}

interface Log {
  projectiles: number;
  damage: { id: number; raw: number }[];
  statuses: { id: number; status: StatusApplication }[];
  reactions: number;
  healNucleus: number;
  healCaster: number;
  buffs: { stat: string; amount: number; seconds: number }[];
  summons: { unit: string; count: number; x: number; y: number }[];
  pools: { x: number; y: number; radius: number; dps: number; seconds: number }[];
  particles: string[];
}

function recorder(enemies: Enemy[]): { ctx: AbilityContext; log: Log; rollValue: { v: number } } {
  const log: Log = { projectiles: 0, damage: [], statuses: [], reactions: 0, healNucleus: 0, healCaster: 0, buffs: [], summons: [], pools: [], particles: [] };
  const rollValue = { v: 0.5 };
  const ctx: AbilityContext = {
    pickTargets: (_x, _y, _r, n) => enemies.slice(0, n),
    forEnemiesInRadius: (_x, _y, _r, fn) => { for (const e of enemies) fn(e); },
    nearestEnemy: (_x, _y, _r, exclude) => enemies.find((e) => e.alive && !exclude.has(e.id)) ?? null,
    fireProjectile: () => { log.projectiles++; },
    dealDamage: (e, raw) => { log.damage.push({ id: e.id, raw }); return raw; },
    applyStatus: (e, status) => { log.statuses.push({ id: e.id, status }); },
    reactOnHit: () => { log.reactions++; },
    healNucleus: (n) => { log.healNucleus += n; },
    healCaster: (n) => { log.healCaster += n; },
    grantShield: () => {},
    grantBuff: (stat, amount, seconds) => { log.buffs.push({ stat, amount, seconds }); },
    summon: (unit, count, x, y) => { log.summons.push({ unit, count, x, y }); },
    spawnPool: (x, y, radius, dps, seconds) => { log.pools.push({ x, y, radius, dps, seconds }); },
    extraProjectiles: 0,
    splashMult: 1,
    rangeMult: 1,
    particles: (_x, _y, kind) => { log.particles.push(kind); },
    sfx: () => {},
    roll: () => rollValue.v,
  };
  return { ctx, log, rollValue };
}

const cast = (over: Partial<AbilityCast> = {}): AbilityCast => ({ x: 0, y: 0, damageMult: 2, target: null, ...over });

describe('ability executors', () => {
  it('projectile fires per target and reports "acted"; no target → no act (cooldown gate)', () => {
    const e = [fakeEnemy(1), fakeEnemy(2)];
    const r = recorder(e);
    const comp: AbilityComponent = { type: 'projectile', behavior: 'homing', damage: 5, speed: 100, range: 50, count: 2 };
    expect(runAbility(r.ctx, comp, cast())).toBe(true);
    expect(r.log.projectiles).toBe(2);
    // empty field → did not act → tower keeps its cooldown
    const empty = recorder([]);
    expect(runAbility(empty.ctx, comp, cast())).toBe(false);
    expect(empty.log.projectiles).toBe(0);
  });

  it('aura applies status + damage and scales damage by the cast multiplier', () => {
    const e = [fakeEnemy(1)];
    const r = recorder(e);
    const comp: AbilityComponent = { type: 'aura', radius: 80, damage: 5, status: { kind: 'Disruption', amount: 1.6 }, react: false };
    runAbility(r.ctx, comp, cast({ damageMult: 2 }));
    expect(r.log.statuses[0].status.kind).toBe('Disruption');
    expect(r.log.damage[0].raw).toBe(10); // 5 × damageMult 2
    expect(r.log.reactions).toBe(0); // react:false → no reaction
  });

  it('explosion reacts by default; heal restores nucleus + caster', () => {
    const e = [fakeEnemy(1)];
    const r = recorder(e);
    runAbilities(r.ctx, [
      { type: 'heal', nucleus: 40, self: 40 },
      { type: 'explosion', radius: 50, damage: 10 },
    ], cast({ damageMult: 1 }));
    expect(r.log.healNucleus).toBe(40);
    expect(r.log.healCaster).toBe(40);
    expect(r.log.reactions).toBe(1); // explosion default react = true
  });

  it('chain bounces with falloff between distinct enemies', () => {
    const e = [fakeEnemy(1), fakeEnemy(2), fakeEnemy(3)];
    const r = recorder(e);
    runAbility(r.ctx, { type: 'chain', jumps: 3, range: 100, damage: 10, falloff: 0.5 }, cast({ damageMult: 1 }));
    expect(r.log.damage.map((d) => d.raw)).toEqual([10, 5, 2.5]); // diminishing
    expect(new Set(r.log.damage.map((d) => d.id)).size).toBe(3); // distinct targets
  });

  it('crit multiplies on a successful roll and is deterministic via ctx.roll', () => {
    const e = [fakeEnemy(1)];
    const r = recorder(e);
    r.rollValue.v = 0.0; // below chance → crit
    runAbility(r.ctx, { type: 'crit', chance: 0.5, mult: 3, damage: 10 }, cast({ damageMult: 1, target: e[0] }));
    expect(r.log.damage[0].raw).toBe(30); // 10 × 3
    r.log.damage.length = 0;
    r.rollValue.v = 0.9; // above chance → no crit
    runAbility(r.ctx, { type: 'crit', chance: 0.5, mult: 3, damage: 10 }, cast({ damageMult: 1, target: e[0] }));
    expect(r.log.damage[0].raw).toBe(10);
  });

  it('pierce arms cast.pierce for the projectile system (additive across components)', () => {
    const r = recorder([]);
    const c = cast();
    expect(runAbility(r.ctx, { type: 'pierce', extra: 2 }, c)).toBe(true); // a modifier always "acts"
    expect(c.pierce).toBe(2);
    runAbility(r.ctx, { type: 'pierce', extra: 1 }, c); // stacks within a cast
    expect(c.pierce).toBe(3);
  });

  it('buff routes a timed run-wide modifier to ctx.grantBuff', () => {
    const r = recorder([]);
    expect(runAbility(r.ctx, { type: 'buff', stat: 'towerDamage', amount: 1.2, seconds: 5 }, cast())).toBe(true);
    expect(r.log.buffs).toEqual([{ stat: 'towerDamage', amount: 1.2, seconds: 5 }]);
  });

  it('summon routes friendly units to ctx.summon at the cast point', () => {
    const r = recorder([]);
    expect(runAbility(r.ctx, { type: 'summon', unit: 'wisp', count: 2 }, cast({ x: 50, y: 60 }))).toBe(true);
    expect(r.log.summons).toEqual([{ unit: 'wisp', count: 2, x: 50, y: 60 }]);
  });

  it('pool drops a corrosion pool at the cast point — dps scales with damageMult, radius with rangeMult', () => {
    const r = recorder([]);
    // cast() sets damageMult 2; the recorder's rangeMult is 1.
    expect(runAbility(r.ctx, { type: 'pool', radius: 100, dps: 20, seconds: 5 }, cast({ x: 30, y: 40 }))).toBe(true);
    expect(r.log.pools).toEqual([{ x: 30, y: 40, radius: 100, dps: 40, seconds: 5 }]);
  });
});
