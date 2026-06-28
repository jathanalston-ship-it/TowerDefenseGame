// The `buff` ability primitive: a timed, run-wide friendly modifier (Game.grantBuff).
// The Overseer's "Mass Override" grants +20% tower damage for 5s. This pins the grant,
// the HUD surfacing + expiry, and that it actually amplifies tower output. Golden-safe:
// only the Overseer ult carries a buff, and the golden Ravager run never grants one.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { towerSlots, WIDTH } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const hasTowerBuff = (g: Game): boolean => g.getSnapshot().buffs.some((b) => /tower dmg/.test(b));

function castUlt(game: Game, px: number, py: number): void {
  game.armAbility();
  game.click(px, py);
}

describe('Overseer Mass Override run buff (the buff ability primitive)', () => {
  it('grants a timed tower-damage buff surfaced in the HUD, which then expires', () => {
    const game = new Game(7, NO_META, undefined, 'overseer');
    expect(hasTowerBuff(game)).toBe(false); // none before the cast
    castUlt(game, WIDTH / 2, 1); // cast into an empty corner — the buff is run-wide regardless
    expect(hasTowerBuff(game)).toBe(true);
    // Let it lapse (buffSeconds = 5; the buff ticks every frame, even in prep) and confirm
    // it drops out of the build panel.
    for (let i = 0; i < 60 * 6; i++) game.advance(SIM_DT);
    expect(hasTowerBuff(game)).toBe(false);
  });

  it('amplifies tower damage while active (the run-buff fold)', () => {
    // Two seed-identical runs; the only difference is whether Mass Override's tower buff is
    // up. A zero-armor target (so the needle's low per-hit damage isn't floored by armor) is
    // pinned in the needle's reach; every other enemy is parked out of range so the only
    // damage measured is the buffed/unbuffed needle hitting that one target. The Overseer
    // sits in a far corner so its Disruption pulse never amplifies the target either.
    const towerDamageDealt = (withBuff: boolean): { dmg: number; alive: boolean } => {
      const g = new Game(11, NO_META, undefined, 'overseer');
      g.debugAddBiomass(1000);
      g.placeTower('needle', towerSlots[0].x, towerSlots[0].y);
      g.startWave();
      g.debugSpawn('lasher', 1); // armor 0 — the needle's damage lands in full, so ×1.2 shows
      const target = g.enemies.find((e) => e.kind === 'lasher')!;
      const h = g.heroes[0];
      h.x = WIDTH / 2; h.y = 1; h.rally = { x: WIDTH / 2, y: 1 };
      if (withBuff) castUlt(g, WIDTH / 2, 1); // +20% tower dmg; Disruption lands on nothing
      for (let i = 0; i < 90; i++) {
        h.x = WIDTH / 2; h.y = 1; // hold the controller far from the target
        for (const e of g.enemies) if (e !== target) { e.x = 0; e.y = 0; } // park others out of reach
        target.x = towerSlots[0].x + 40; target.y = towerSlots[0].y - 40; // pinned in range, off the line
        g.advance(SIM_DT);
      }
      return { dmg: g.getRunStats().damageDealt, alive: target.alive };
    };
    const base = towerDamageDealt(false);
    const buffed = towerDamageDealt(true);
    expect(base.alive && buffed.alive).toBe(true); // the target survived both (a fair comparison)
    expect(base.dmg).toBeGreaterThan(0); // the needle actually landed hits
    expect(buffed.dmg).toBeGreaterThan(base.dmg); // …and the buff made them hit harder
  });
});
