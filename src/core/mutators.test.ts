import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { applyMutators, mutatorRegistry } from './mutators';
import { SIM_DT, TOWER_ORDER } from './config';
import { DEFENSE_TOP_Y, towerSlots } from './map';
import type { MetaModifiers, Projectile, TowerProgress } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0 };

function freshProjectile(): Projectile {
  return { id: 1, x: 0, y: 0, tx: 0, ty: 0, speed: 1, targetId: -1, damage: 1, behavior: 'homing', splash: 0, alive: true, sourceKind: 'needle' };
}

describe('projectile mutators', () => {
  it('pierce mutators add pass-throughs and arm the hit list', () => {
    const p = freshProjectile();
    applyMutators(['pierce2'], p);
    expect(p.pierce).toBe(2);
    expect(p.hitIds).toEqual([]);
  });

  it('stacks multiple mutators and skips unknown ids', () => {
    const p = freshProjectile();
    applyMutators(['pierce1', 'nope', 'pierce2'], p);
    expect(p.pierce).toBe(3);
  });

  it('registers the core pierce mutators', () => {
    expect(mutatorRegistry.has('pierce1')).toBe(true);
    expect(mutatorRegistry.has('pierce3')).toBe(true);
  });
});

function neutralProgress(): TowerProgress {
  const r = {} as TowerProgress;
  for (const k of TOWER_ORDER) r[k] = { damageMult: 1, fireRateMult: 1 };
  return r;
}

/** One needle tower, god-mode, saturated lane, fixed window → projectile reach is the
 * bottleneck. A piercing needle hits multiple foes per shot, so it kills more. */
function needleKills(progress: TowerProgress, secs: number): number {
  const game = new Game(2024, NO_META, progress);
  game.god = true;
  game.debugAddBiomass(100000);
  for (const s of towerSlots) if (s.y < DEFENSE_TOP_Y + 120) game.placeTower('needle', s.x, s.y);
  game.startWave();
  game.debugSpawn('runner', 600);
  let t = 0;
  let guard = 0;
  while (t < secs && game.phase === 'wave' && guard++ < 40000) {
    game.advance(SIM_DT);
    t += SIM_DT;
  }
  return game.getSnapshot().kills;
}

describe('pierce changes combat', () => {
  it('a piercing needle kills more than the base tower (same seed)', () => {
    const base = neutralProgress();
    const pierced = neutralProgress();
    pierced.needle = { damageMult: 1, fireRateMult: 1, projectileMutators: ['pierce3'] };
    expect(needleKills(pierced, 12)).toBeGreaterThan(needleKills(base, 12));
  });
});
