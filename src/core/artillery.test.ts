// Artillery (siege) enemies must COMMIT down the lane before bombarding — they may not
// snipe the Nucleus from the spawn edge. Regression guard for the unit-mismatch bug where
// the engagement gate compared a cell-unit path cost against a pixel range (≈ always true),
// so green Acid Spitters / Siege Maws shelled the core from outside any defensible range.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, ENEMY_DEFS } from './config';
import { HEIGHT, DEFENSE_TOP_Y } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0 };

describe('artillery standoff (siege enemies)', () => {
  it('does NOT shell the Nucleus from the spawn edge — only from ≥ 2/3 down the lane', () => {
    const game = new Game(3, NO_META);
    game.startWave();
    game.debugSpawn('spitter', 1);
    const e = game.enemies[game.enemies.length - 1];
    expect(e.kind).toBe('spitter');

    // Pinned high near the spawn membrane → above the standoff line → must not bombard.
    const before = game.integrity;
    for (let i = 0; i < 90; i++) { e.y = 80; game.advance(SIM_DT); }
    expect(game.integrity).toBe(before); // no snipe-from-nowhere

    // Committed past the standoff (≥ 2/3 down) → now in a defensible band → it bombards.
    const standoff = Math.max(HEIGHT * (2 / 3), DEFENSE_TOP_Y - ENEMY_DEFS.spitter.siege!.range);
    expect(standoff).toBeGreaterThanOrEqual(HEIGHT * (2 / 3)); // the 2/3 floor holds
    for (let i = 0; i < 180 && e.alive; i++) { e.y = standoff + 10; game.advance(SIM_DT); }
    expect(game.integrity).toBeLessThan(before); // standoff bombardment lands
  });
});
