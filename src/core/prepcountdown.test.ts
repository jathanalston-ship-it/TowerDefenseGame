// Auto-start prep countdown is REAL-TIME (docs/GAME-SPEED): game speed must not burn the build
// phase faster. At 5× the sim takes ~5× more STEPS but the SAME wall time (advance calls) to fire.
import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { towerSlots } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 } as MetaModifiers;

/** Frames (real-dt advance calls) until the armed auto-start fires the wave at a given time scale. */
function framesToAutoStart(scale: number): number {
  const game = new Game(1, NO_META);
  game.debugAddBiomass(100000);
  game.placeTower('needle', towerSlots[0].x, towerSlots[0].y); // arms autoStartReady
  game.setAutoStart(true); // (re)sets a fresh prepCountdown
  game.timeScale = scale;
  let frames = 0;
  while (game.phase === 'prep' && frames < 100000) { game.advance(SIM_DT); frames++; }
  return frames;
}

describe('auto-start prep countdown is real-time', () => {
  it('consumes the same WALL time at 1× and 5× (speed does not skip the build phase)', () => {
    const at1 = framesToAutoStart(1);
    const at5 = framesToAutoStart(5);
    expect(at1).toBeGreaterThan(5); // sanity: a real countdown elapsed
    // Equal real time ⇒ nearly equal frame counts (a couple frames of slack for the mid-advance flip).
    expect(Math.abs(at5 - at1)).toBeLessThanOrEqual(2);
    // Guard against a regression to sim-time ticking (which would make 5× fire ~5× sooner).
    expect(at5).toBeGreaterThan(at1 * 0.6);
  });
});
