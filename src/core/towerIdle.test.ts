// Tower idle postures (docs/TOWER-IDLE.md) — the three-state contract: registry laws (every
// kind carries exactly one bounded behavior row), the posture scalar, and each sim verb's
// payoff (windup opener, reserve burst, ranging suppression, preheat floor, trickle mend,
// choir song). `disableIdle` must reproduce the legacy sim (the isolation contract the
// golden re-pin leans on).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, TOWER_DEFS } from './config';
import { towerSlots } from './map';
import { IDLE_BEHAVIORS, towerIdleProblems, towerIdleState } from './towerIdle';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

/** Bottom-most slot — maximal distance from the top-corner "holding pen" the tests pin
 *  wave spawns into (keeps the wave alive without engaging a short-reach tower). */
const bottom = towerSlots.reduce((a, b) => (b.y > a.y ? b : a));

function pinAll(game: Game, except?: { x: number; y: number }): void {
  for (const e of game.enemies) {
    if (!e.alive) continue;
    if (except !== undefined && e.x === except.x && e.y === except.y) continue;
    e.x = 30;
    e.y = 60;
  }
}

/** Build a one-tower arena in combat phase with every spawn penned far away. */
function arena(kind: keyof typeof TOWER_DEFS, disableIdle = false): Game {
  const game = new Game(3, NO_META, undefined, undefined, undefined, { disableIdle });
  game.biomass = 999;
  expect(game.placeTower(kind, bottom.x, bottom.y)).toBe(true);
  game.startWave();
  return game;
}

function idleFor(game: Game, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    pinAll(game);
    game.advance(SIM_DT);
  }
}

describe('the registry laws', () => {
  it('every tower kind carries exactly one bounded behavior row', () => {
    expect(towerIdleProblems()).toEqual([]);
    for (const kind of Object.keys(TOWER_DEFS)) expect(IDLE_BEHAVIORS[kind as keyof typeof TOWER_DEFS]).toBeDefined();
  });

  it('the posture scalar maps to the three states', () => {
    expect(towerIdleState(0)).toBe('combat');
    expect(towerIdleState(0.4)).toBe('transition');
    expect(towerIdleState(1)).toBe('preparation');
  });
});

describe('windup (Salivating Gape — the maw lunge)', () => {
  it('banks charge while unengaged, releases an amplified opener, and consumes the bank', () => {
    const charged = arena('maw');
    const control = arena('maw', true);
    for (const g of [charged, control]) idleFor(g, 5);
    const t = charged.towers[0];
    expect(t.prep).toBeGreaterThan(0.9); // full PREPARATION posture
    expect(t.idleCharge).toBeGreaterThan(0.9); // the gape is loaded (chargeTime 3.5s)
    expect(control.towers[0].prep).toBe(0); // disableIdle: the legacy sim never postures
    expect(control.towers[0].idleCharge).toBe(0);
    // Walk the same victim into both jaws — the charged bite must land ~×2 the control's.
    const dealt: number[] = [];
    for (const g of [charged, control]) {
      g.debugSpawn('brute', 1);
      const victim = g.enemies[g.enemies.length - 1];
      victim.x = g.towers[0].x;
      victim.y = g.towers[0].y - 10;
      const before = victim.hp;
      pinAll(g, victim);
      g.advance(SIM_DT);
      dealt.push(before - victim.hp);
    }
    expect(dealt[0]).toBeGreaterThan(dealt[1] * 1.6); // the lunge (×2 dmg at full charge)
    expect(charged.towers[0].idleCharge).toBe(0); // consumed by the opener
    expect(charged.idleOpeners).toBeGreaterThanOrEqual(1);
    expect(control.idleOpeners).toBe(0);
  });
});

describe('reserve (Belt Feed — the spitfang burst)', () => {
  it('gestates volleys while idle and dumps them at burst tempo on re-engagement', () => {
    const game = arena('spitfang');
    idleFor(game, 6); // chargeTime 4.5s → the 3-round belt is full
    expect(game.towers[0].idleCharge).toBeGreaterThanOrEqual(2.9);
    game.debugSpawn('tank', 1);
    const victim = game.enemies[game.enemies.length - 1];
    for (let i = 0; i < Math.round(0.8 / SIM_DT); i++) {
      victim.x = game.towers[0].x;
      victim.y = game.towers[0].y - 60;
      victim.hp = victim.maxHp; // keep it standing — we count shots, not the kill
      pinAll(game, victim);
      game.advance(SIM_DT);
    }
    // Base cadence 0.6s would land ~2 shots in 0.8s; the belt dump lands the reserve too.
    expect(game.idleOpeners).toBeGreaterThanOrEqual(2);
    expect(game.towers[0].idleCharge).toBeLessThan(1); // the belt was spent
  });
});

describe('ranging (Spore Drift — the parasite suppression lob)', () => {
  it('fires weak infectious spores at targets far beyond nesting reach while unengaged', () => {
    const game = arena('parasite');
    game.debugSpawn('tank', 1);
    const victim = game.enemies[game.enemies.length - 1];
    const t = game.towers[0];
    for (let i = 0; i < Math.round(6 / SIM_DT); i++) {
      victim.x = t.x;
      victim.y = t.y - 400; // outside the 280 nest reach, inside the ×2 drift reach
      victim.hp = victim.maxHp;
      pinAll(game, victim);
      game.advance(SIM_DT);
    }
    expect(game.idleRangingShots).toBeGreaterThanOrEqual(1);
    expect(victim.infection).toBeGreaterThan(0); // the epidemic started before the wave arrived
    expect(t.prep).toBeGreaterThan(0.6); // ranging is still PREPARATION, not combat
  });
});

describe('preheat (Harmonic Reserve — the coil floor)', () => {
  it('heat drifts to the floor while unengaged instead of bleeding to zero', () => {
    const game = arena('coil');
    idleFor(game, 5);
    const floor = IDLE_BEHAVIORS.coil.preheat!.floor;
    expect(game.towers[0].beamHeat).toBeCloseTo(floor, 1);
    const control = arena('coil', true);
    idleFor(control, 5);
    expect(control.towers[0].beamHeat).toBe(0); // legacy: cold start
  });
});

describe('trickle (Systolic Reserve — the reactor mend)', () => {
  it('mends the Nucleus while the neighborhood is calm; disableIdle never does', () => {
    const game = arena('reactor');
    game.integrity -= 30;
    const before = game.integrity;
    idleFor(game, 10);
    expect(game.integrity - before).toBeGreaterThan(4); // ~0.55/s
    expect(game.idleMended).toBeGreaterThan(4);
    const control = arena('reactor', true);
    control.integrity -= 30;
    const cBefore = control.integrity;
    idleFor(control, 10);
    expect(control.integrity).toBe(cBefore);
  });
});

describe('choir (Sepulchral Chorus — the ossuary song)', () => {
  it('an unengaged choir grants nearby towers its damage bonus; the song decays in combat', () => {
    const game = new Game(3, NO_META);
    game.biomass = 999;
    expect(game.placeTower('ossuary', bottom.x, bottom.y)).toBe(true);
    // The nearest OTHER slot inside the 250px song.
    const near = towerSlots
      .filter((s) => s.index !== bottom.index)
      .reduce((a, b) => (((a.x - bottom.x) ** 2 + (a.y - bottom.y) ** 2) < ((b.x - bottom.x) ** 2 + (b.y - bottom.y) ** 2) ? a : b));
    expect(game.placeTower('needle', near.x, near.y)).toBe(true);
    game.startWave();
    idleFor(game, 2);
    const needle = game.towers.find((x) => x.kind === 'needle')!;
    // Steady state sits one receiver decay-tick under the grant (sing → decay each frame).
    expect(needle.choirDmg).toBeGreaterThan(IDLE_BEHAVIORS.ossuary.choir!.dmgBonus * 0.9);
    expect(needle.choirDmg).toBeLessThanOrEqual(IDLE_BEHAVIORS.ossuary.choir!.dmgBonus);
  });
});
