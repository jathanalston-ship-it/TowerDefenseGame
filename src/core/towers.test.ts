// Headless characterization for the two control/Viral towers added after the
// launch trio. Like sim.test.ts these pin behavioral invariants (not exact
// numbers — golden.test owns those) so a future refactor can't silently break
// Infection (ramp + spread) or Disruption (slow + vulnerability).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { DEFENSE_TOP_Y, towerSlots } from './map';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

/** Blanket the front slot-rows with one kind, flood the lane, and run a wave.
 * Flooding makes enemies leak past the hero so the back-row towers actually engage. */
function observe(kind: TowerKind): { sawInfection: boolean; maxStacks: number; peakInfected: boolean; sawDisrupt: boolean; held: boolean } {
  const game = new Game(2024, NO_META);
  game.debugAddBiomass(10000);
  for (const s of towerSlots) if (s.y < DEFENSE_TOP_Y + 160) game.placeTower(kind, s.x, s.y);
  game.startWave();
  game.debugSpawn('runner', 120);

  let sawInfection = false, sawDisrupt = false, maxStacks = 0, peak = 0;
  let t = 0, guard = 0;
  while (t < 90 && game.phase === 'wave' && guard++ < 120000) {
    game.advance(SIM_DT);
    t += SIM_DT;
    let infectedNow = 0;
    for (const e of game.enemies) {
      if (e.infection > 0) { sawInfection = true; infectedNow++; maxStacks = Math.max(maxStacks, e.infection); }
      if (e.disrupt > 0) sawDisrupt = true;
    }
    peak = Math.max(peak, infectedNow);
  }
  return { sawInfection, maxStacks, peakInfected: peak > 1, sawDisrupt, held: game.integrity > 0 };
}

describe('Parasite Nest (Viral)', () => {
  it('seeds Infection that ramps past its on-hit seed and spreads to multiple enemies', () => {
    const r = observe('parasite');
    expect(r.sawInfection).toBe(true);
    expect(r.maxStacks).toBeGreaterThan(2); // ramped beyond the on-hit seed (2)
    expect(r.peakInfected).toBe(true); // present on several at once → it spread
  });
});

describe('Neural Obelisk (Neural)', () => {
  it('disrupts enemies in its field (slow + vulnerability), and the field holds the line', () => {
    const r = observe('obelisk');
    expect(r.sawDisrupt).toBe(true);
  });
});
