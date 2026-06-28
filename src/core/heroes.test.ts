// Headless characterization for the two heroes added after the Ravager. Pins each
// one's distinct, autonomous identity (golden.test already guards the Ravager's exact
// combat). Heroes are fielded WITHOUT towers so the behavior under test is unambiguous.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { DEFENSE_TOP_Y } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

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

describe('Shepherd self-shield (Bloom)', () => {
  it('grants an absorb-shield that soaks contact damage before any HP is lost', () => {
    const game = new Game(11, NO_META, undefined, 'shepherd');
    game.startWave();
    const h = game.heroes[0];

    // Cast Bloom with the field clear → its AoE hits nothing; the protector self-shields.
    game.armAbility();
    game.click(h.x, h.y);
    expect(h.shield).toBeGreaterThan(0); // Bloom minted the absorb pool
    expect(h.hp).toBe(h.maxHp); // full HP at the moment of casting

    // One heavy, durable body pinned onto the Shepherd each tick → guaranteed, sustained
    // contact with no separation scatter (a single enemy has no neighbors to push off).
    // The duel is held in the open defense zone: the Shepherd's natural guard spot is the
    // nucleus, where any contacting enemy would instead register as a breach.
    game.debugSpawn('colossus', 1);
    const brute = game.enemies[game.enemies.length - 1];
    const fy = DEFENSE_TOP_Y + 40; // mid-zone: in the open, clear of the nucleus (no breach)

    let absorbedWhileFull = false;
    let hpChippedWhileShielded = false;
    let hpDroppedAfterShield = false;
    for (let i = 0; i < 60 * 8 && game.phase === 'wave'; i++) {
      h.y = fy; brute.x = h.x; brute.y = fy; // hold the duel in the open; attacker pinned on the hero
      const shieldBefore = h.shield;
      game.advance(SIM_DT);
      if (h.shield < shieldBefore && h.shieldTime > 0.1 && h.hp === h.maxHp) absorbedWhileFull = true;
      if (h.hp < h.maxHp) {
        hpDroppedAfterShield = true;
        if (h.shield > 0) hpChippedWhileShielded = true; // invariant violation
        break; // HP started dropping → the shield must already be spent
      }
    }
    expect(absorbedWhileFull).toBe(true); // the shield ate contact damage while HP stayed full…
    expect(hpChippedWhileShielded).toBe(false); // …HP was never chipped while the shield held…
    expect(hpDroppedAfterShield).toBe(true); // …and once it ran dry, the overflow reached HP
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
