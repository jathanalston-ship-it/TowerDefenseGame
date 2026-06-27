// Proves the EQUIPMENT-PHILOSOPHY seam: armor authors HOW the hero plays (its AI), not
// just its numbers. A "wary" behavior profile (heroRetreatThreshold) makes the Ravager
// disengage toward the nucleus instead of hunting — so it deals far less than its base AI.
// Neutral defaults keep a gear-less run byte-identical (covered by golden).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { affixDef } from './equipment';
import type { CardEffect } from './cards';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0 };

/** Run the Ravager (dive AI) against a flood with the given run-start behavior effects;
 * return the hero damage it accrued. Deterministic (fixed seed, no rng in the profile). */
function ravagerDamage(runEffects: CardEffect[], secs: number): number {
  const game = new Game(2024, NO_META, undefined, 'ravager', undefined, { runEffects });
  game.startWave();
  game.debugSpawn('runner', 60);
  let t = 0;
  let guard = 0;
  while (t < secs && game.phase === 'wave' && guard++ < 20000) {
    game.advance(SIM_DT);
    t += SIM_DT;
  }
  return game.getHeroMasteryAccrual().ravager.damage;
}

describe('equipment changes hero behavior (armor → AI)', () => {
  it('the behavioral armor affixes target the hero behavior profile', () => {
    expect(affixDef('vigilant')?.effects[0]).toMatchObject({ field: 'heroAggroRangeMult' });
    expect(affixDef('wary')?.effects[0]).toMatchObject({ field: 'heroRetreatThreshold' });
  });

  it('a "wary" profile disengages the hero, so it deals far less than its base AI', () => {
    const base = ravagerDamage([], 8);
    const wary = ravagerDamage([{ op: 'add', field: 'heroRetreatThreshold', value: 2 }], 8);
    expect(base).toBeGreaterThan(0); // the base dive AI hunts and deals damage
    expect(wary).toBeLessThan(base); // the wary profile pulls it back to the nucleus
  });
});
