import { describe, it, expect } from 'vitest';
import { defineEnemy, MOVEMENT, ability, tune } from './archetypes';
import { ENEMY_DEFS } from './config';

describe('enemy archetypes', () => {
  it('composes a flat EnemyDef from stat / movement / visual / ability parts', () => {
    const def = defineEnemy('runner', {
      name: 'Test', role: 'standard',
      stats: { hp: 100, armor: 5, speed: 50, bounty: 10, damage: 3, radius: 12 },
      movement: MOVEMENT.bruiser,
      visual: { color: '#abcdef' },
    });
    expect(def).toMatchObject({ kind: 'runner', name: 'Test', hp: 100, armor: 5, speed: 50, color: '#abcdef', role: 'standard' });
    expect(def.behavior).toEqual(MOVEMENT.bruiser);
    expect(def.shield).toBeUndefined();
  });

  it('combines MULTIPLE ability modules onto one enemy (no bespoke code)', () => {
    // A hypothetical "combine archetypes" enemy: a shielded, regenerating kiter that
    // splits — four abilities + a tuned movement profile, all from existing parts.
    const hybrid = defineEnemy('warden', {
      name: 'Chimera', role: 'tank',
      stats: { hp: 300, armor: 10, speed: 36, bounty: 80, damage: 12, radius: 18 },
      movement: tune('kiter', { avoidHero: 0.9 }),
      visual: { color: '#ffffff' },
      abilities: [ability.shielded(150), ability.regenerating(10, 2), ability.ranged(200, 12, 2, 240), ability.splitsInto('runner', 2)],
    });
    expect(hybrid.shield).toBe(150);
    expect(hybrid.regen).toEqual({ perSec: 10, delay: 2 });
    expect(hybrid.ranged).toMatchObject({ range: 200, damage: 12 });
    expect(hybrid.split).toEqual({ kind: 'runner', count: 2 });
    expect(hybrid.behavior.avoidHero).toBe(0.9); // tuned override
    expect(hybrid.behavior.seek).toBe(MOVEMENT.kiter.seek); // base preserved
  });

  it('tune() overrides a base movement profile without mutating it', () => {
    const before = { ...MOVEMENT.charger };
    const t = tune('charger', { jitter: 0.5 });
    expect(t.jitter).toBe(0.5);
    expect(t.seek).toBe(MOVEMENT.charger.seek);
    expect(MOVEMENT.charger).toEqual(before); // base untouched
  });

  it('preserves the shipped bestiary exactly (behavior-preserving refactor)', () => {
    // Spot-check that composition reproduced the canonical stats + abilities.
    expect(ENEMY_DEFS.runner).toMatchObject({ hp: 36, speed: 72, bounty: 11, color: '#d98cff' });
    expect(ENEMY_DEFS.runner.behavior).toEqual({ seek: 1, avoidTowers: 0.28, avoidHero: 0.5, separation: 0.55, jitter: 0.16 });
    expect(ENEMY_DEFS.warden.shield).toBe(130);
    expect(ENEMY_DEFS.mender.regen).toEqual({ perSec: 16, delay: 1.6 });
    expect(ENEMY_DEFS.spitter.ranged).toEqual({ range: 190, damage: 16, interval: 1.9, speed: 230 });
    expect(ENEMY_DEFS.splitter.split).toEqual({ kind: 'runner', count: 3 });
    expect(ENEMY_DEFS.tyrant.isBoss).toBe(true);
    expect(ENEMY_DEFS.tyrant.role).toBe('boss');
  });

  it('every enemy carries a role and a movement profile', () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      expect(def.role).toBeTruthy();
      expect(typeof def.behavior.seek).toBe('number');
    }
  });
});
