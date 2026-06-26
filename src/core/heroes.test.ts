// Headless characterization for the two heroes added after the Ravager. Pins each
// one's distinct, autonomous identity (golden.test already guards the Ravager's exact
// combat). Heroes are fielded WITHOUT towers so the behavior under test is unambiguous.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { DEFENSE_TOP_Y } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0 };

describe('Shepherd (Vital guard)', () => {
  it('regenerates Nucleus integrity over time and holds the defensive zone', () => {
    const game = new Game(7, NO_META, undefined, 'shepherd');
    game.integrity = 40; // simulate a wounded core
    const before = game.integrity;
    // Advance ~5s of prep (no enemies): the Shepherd should mend the core.
    for (let i = 0; i < 300; i++) game.advance(SIM_DT);
    expect(game.integrity).toBeGreaterThan(before);
    // It guards near the core — never wanders up into the spawn half.
    expect(game.heroes[0].y).toBeGreaterThan(DEFENSE_TOP_Y - 80);
    expect(game.heroes[0].kind).toBe('shepherd');
  });
});

describe('Overseer (Neural control)', () => {
  it('disrupts enemies with its own field — no Obelisk required', () => {
    const game = new Game(7, NO_META, undefined, 'overseer');
    game.startWave();
    game.debugSpawn('runner', 60); // a crowd for the controller to blanket
    let sawDisrupt = false;
    for (let i = 0; i < 60 * 40 && game.phase === 'wave'; i++) {
      game.advance(SIM_DT);
      for (const e of game.enemies) if (e.disrupt > 0) { sawDisrupt = true; break; }
      if (sawDisrupt) break;
    }
    expect(sawDisrupt).toBe(true);
  });
});

describe('hero roster scalability', () => {
  it('defaults to a single Ravager (the slot-1 seam), unchanged base game', () => {
    const game = new Game(1, NO_META);
    expect(game.heroes).toHaveLength(1);
    expect(game.heroes[0].kind).toBe('ravager');
  });
});
