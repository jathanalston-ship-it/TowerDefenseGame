// VITRIOL (Caustic siege hero) — the ranged / area-denial avatar. Pins its two signatures:
//   • bombardment: siege shells splash + leave lingering Corrosion pools (area denial);
//   • Corrosive Cataclysm ult: an AoE blast that corrodes + drops a wide acid pool.
// Golden-safe: only Vitriol drops pools this way, and the golden Ravager run never does (the
// last test is the control — the default hero pools nothing).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { WIDTH } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

function castUlt(game: Game, px: number, py: number): void {
  game.armAbility();
  game.click(px, py);
}

describe('Vitriol siege bombardment (the ranged area-denial hero)', () => {
  it('lobs corrosive shells that damage enemies AND leave Corrosion pools', () => {
    const g = new Game(5, NO_META, undefined, 'vitriol');
    g.startWave();
    g.debugSpawn('colossus', 3); // heavy HP — survive long enough to be bombarded and corroded
    expect(g.pools.length).toBe(0);
    // Pin the pack inside the siege reach so the hero opens fire (shells fly + impact + pool),
    // and latch corrosion across the loop (it decays each tick, so sample it live).
    let sawCorrosion = false;
    for (let i = 0; i < 220; i++) {
      for (const e of g.enemies) { e.x = WIDTH / 2; e.y = 500; }
      g.advance(SIM_DT);
      if (g.enemies.some((e) => e.corrosion > 0)) sawCorrosion = true;
    }
    expect(g.pools.length).toBeGreaterThan(0); // impacts seeded corrosion pools
    expect(g.getRunStats().damageDealt).toBeGreaterThan(0); // the shells actually landed
    expect(sawCorrosion).toBe(true); // …and applied Corrosion (the Caustic signature)
  });
});

describe('Vitriol Corrosive Cataclysm ult', () => {
  it('blasts the zone (AoE damage + heavy Corrosion) and drops a lingering acid pool', () => {
    const g = new Game(7, NO_META, undefined, 'vitriol');
    g.startWave();
    g.debugSpawn('colossus', 1);
    const e = g.enemies.find((x) => x.kind === 'colossus')!;
    const P = { x: WIDTH / 2, y: 500 };
    // Advance a few ticks with the target pinned so the spatial grid (rebuilt each advance)
    // registers it at P — the AoE queries the grid, so it must be current before the cast.
    for (let i = 0; i < 5; i++) { e.x = P.x; e.y = P.y; g.advance(SIM_DT); }
    e.x = P.x; e.y = P.y;
    castUlt(g, P.x, P.y);
    expect(g.getRunStats().damageDealt).toBeGreaterThan(0); // the blast hit
    expect(e.corrosion).toBeGreaterThan(0); // …and corroded the target
    expect(g.pools.length).toBeGreaterThan(0); // …and left a wide acid pool
  });

  it("the Ravager's ult drops NO pool (control of the golden default)", () => {
    const g = new Game(7, NO_META); // defaults to the Ravager
    g.startWave();
    g.debugSpawn('colossus', 1);
    const e = g.enemies.find((x) => x.kind === 'colossus')!;
    const P = { x: WIDTH / 2, y: 500 };
    for (let i = 0; i < 5; i++) { e.x = P.x; e.y = P.y; g.advance(SIM_DT); }
    castUlt(g, P.x, P.y);
    expect(g.pools.length).toBe(0); // the Ravager leaves no corrosion pools
  });
});
