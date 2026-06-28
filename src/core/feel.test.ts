// Presentation "feel" hooks must keep firing during combat (VISUAL-AUDIT C3/M4).
// These are view-only signals (no gameplay effect — golden.test guards outcomes),
// so this test pins that they actually occur, which a screenshot can only catch by
// luck. Deterministic: fixed seed + the shared autoplay strategy.

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { towerSlots } from './map';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const KINDS: TowerKind[] = ['needle', 'mortar', 'reactor'];
const MOTE = '#b6e84a'; // PARTICLE.mote.color — uniquely identifies a biomass mote

describe('combat feel hooks (presentation)', () => {
  it('emits damage numbers, hit-flash, and biomass motes during a wave', () => {
    const game = new Game(12345, NO_META);
    let sawNumber = false;
    let sawFlash = false;
    let sawMote = false;
    let t = 0;
    let guard = 0;

    while (t < 120 && game.phase !== 'won' && game.phase !== 'lost' && guard++ < 200000) {
      if (game.phase === 'draft') {
        game.chooseCard(game.getSnapshot().draft![0].id);
        continue;
      }
      if (game.phase === 'prep') {
        let placed = 0;
        for (let i = 0; i < towerSlots.length && placed < 3; i++) {
          if (game.placeTower(KINDS[i % 3], towerSlots[i].x, towerSlots[i].y)) placed++;
        }
        game.startWave();
      }
      game.advance(SIM_DT);
      t += SIM_DT;

      for (const f of game.floats) if (/^\d+$/.test(f.text)) sawNumber = true; // aggregated damage number
      for (const e of game.enemies) if (e.hitFlash > 0) sawFlash = true; // white hit-flash
      for (const p of game.particles) if (p.color === MOTE) sawMote = true; // kill mote
      if (sawNumber && sawFlash && sawMote) break;
    }

    expect(sawNumber).toBe(true);
    expect(sawFlash).toBe(true);
    expect(sawMote).toBe(true);
  });
});
