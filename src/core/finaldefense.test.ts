// Final Defense Zone / Emergency Defense Mode (docs/RANGE.md §4). Pins the new
// last-stand targeting override: an enemy in the zone puts the Hive into emergency, and
// every offensive tower gains UNLIMITED range against in-zone enemies, prioritising the
// breach nearest the Hive Core. Enemies outside the zone keep normal targeting.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { FINAL_DEFENSE_TOP_Y, nucleusPoint, towerSlots } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const IN_ZONE_Y = FINAL_DEFENSE_TOP_Y + 20; // safely inside the Final Defense Zone
const OUT_ZONE_Y = FINAL_DEFENSE_TOP_Y - 200; // safely above it

describe('Final Defense Zone — emergency activation', () => {
  // In 'prep' the sim runs emergencySystem but not enemyMoveSystem, so positions we set
  // stay put — a clean, deterministic way to drive the zone-detection logic.
  it('activates only while an enemy is inside the zone', () => {
    const game = new Game(123, NO_META);
    game.debugSpawn('runner');
    const e = game.enemies[game.enemies.length - 1];

    e.x = nucleusPoint.x;
    e.y = IN_ZONE_Y;
    game.advance(SIM_DT);
    expect(game.getRenderState().emergency).toBe(true);

    e.y = OUT_ZONE_Y;
    game.advance(SIM_DT);
    expect(game.getRenderState().emergency).toBe(false);
  });

  it('focuses the in-zone enemy NEAREST the Hive Core (priority 2)', () => {
    const game = new Game(123, NO_META);
    game.debugSpawn('runner');
    game.debugSpawn('runner');
    const a = game.enemies[game.enemies.length - 2];
    const b = game.enemies[game.enemies.length - 1];
    // a: right at the core. b: in-zone but off to the far side (much farther from core).
    a.x = nucleusPoint.x;
    a.y = nucleusPoint.y - 20;
    b.x = 60;
    b.y = FINAL_DEFENSE_TOP_Y + 5;
    game.advance(SIM_DT);

    const rs = game.getRenderState();
    expect(rs.emergency).toBe(true);
    expect(rs.emergencyFocusX).toBe(a.x);
    expect(rs.emergencyFocusY).toBe(a.y);
  });
});

describe('Final Defense Zone — range override', () => {
  // A Parasite at the forward-left slot (range 280) cannot normally reach the far side of
  // the zone (~600px away). Pin a tank there: only the emergency override can make the
  // parasite target — and thus Infect — it. Infection is parasite-only, isolating the proof.
  function parasiteReaches(targetY: number): boolean {
    const game = new Game(123, NO_META);
    game.debugAddBiomass(10000);
    game.placeTower('parasite', towerSlots[0].x, towerSlots[0].y); // forward-left ≈ (60, 780)
    game.startWave();
    game.debugSpawn('tank'); // high HP so it survives long enough to observe
    const tank = game.enemies[game.enemies.length - 1];

    for (let i = 0; i < 360; i++) {
      tank.x = 660; // far from the parasite (~600px > its 280 range)
      tank.y = targetY;
      if (!tank.alive) break;
      game.advance(SIM_DT);
      if (tank.infection > 0) return true;
    }
    return false;
  }

  it('lets an offensive tower hit an in-zone enemy that is OUT of its normal range', () => {
    expect(parasiteReaches(IN_ZONE_Y)).toBe(true);
  });

  it('does NOT override range for an enemy OUTSIDE the zone (normal targeting holds)', () => {
    expect(parasiteReaches(OUT_ZONE_Y)).toBe(false);
  });
});
