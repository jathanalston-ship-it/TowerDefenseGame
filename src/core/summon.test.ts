// The `summon` ability primitive: a timed, friendly-unit system (Game.summon → Minions).
// The Shepherd's "Bloom" sprouts two Vital Wisps that seek and strike nearby enemies, then
// expire. Pins the grant, the seek-and-damage behavior, and the expiry. Golden-safe: only
// the Shepherd ult summons, and the golden Ravager run never does.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, MINION_DEFS } from './config';
import { WIDTH } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0 };

function castUlt(game: Game, px: number, py: number): void {
  game.armAbility();
  game.click(px, py);
}

describe('Shepherd Bloom summon (the summon ability primitive)', () => {
  it('sprouts Vital Wisps at the cast point', () => {
    const g = new Game(5, NO_META, undefined, 'shepherd');
    expect(g.minions.length).toBe(0);
    castUlt(g, WIDTH / 2, 500);
    expect(g.minions.length).toBe(2);
    expect(g.minions.every((m) => m.kind === 'wisp')).toBe(true);
  });

  it('the Wisps seek and damage enemies (isolated from Bloom’s own AoE/pulse)', () => {
    const g = new Game(5, NO_META, undefined, 'shepherd');
    const h = g.heroes[0];
    g.startWave();
    g.debugSpawn('lasher', 1); // armor 0 — Wisp hits land in full
    const target = g.enemies.find((e) => e.kind === 'lasher')!;
    const P = { x: WIDTH / 2, y: 500 };
    h.x = P.x; h.y = P.y; h.rally = { x: P.x, y: P.y };
    castUlt(g, P.x, P.y); // Bloom summons 2 Wisps at P (and heals/shields/bursts at P)
    expect(g.minions.length).toBe(2);
    for (let i = 0; i < 150; i++) {
      h.x = P.x; h.y = P.y; // hold the Shepherd at P so its pulse/AoE never reach the target
      for (const e of g.enemies) if (e !== target) { e.x = 0; e.y = 0; } // park others out of seek range
      target.x = WIDTH / 2; target.y = 320; // 180px from P: outside Bloom (110) + pulse (92), inside Wisp seek (300)
      g.advance(SIM_DT);
    }
    // Only the Wisps can reach the target, so any damage dealt is theirs.
    expect(g.getRunStats().damageDealt).toBeGreaterThan(0);
  });

  it('the Wisps expire after their lifetime', () => {
    const g = new Game(5, NO_META, undefined, 'shepherd');
    castUlt(g, WIDTH / 2, 500); // cast in prep: life decays every frame even with no enemies
    expect(g.minions.length).toBe(2);
    const ticks = Math.ceil((MINION_DEFS.wisp.life + 1) / SIM_DT);
    for (let i = 0; i < ticks; i++) g.advance(SIM_DT);
    expect(g.minions.length).toBe(0);
  });

  it("the Ravager's ult summons nothing (control of the golden default)", () => {
    const g = new Game(5, NO_META); // defaults to the Ravager
    castUlt(g, WIDTH / 2, 500);
    expect(g.minions.length).toBe(0);
  });
});
