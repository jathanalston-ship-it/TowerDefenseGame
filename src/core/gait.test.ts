// GAITS (docs/ENEMIES.md §gaits) — the enemy LOCOMOTION layer over the steering blend.
// Two lanes: a CONTENT GUARDRAIL that sweeps every authored gait (scales to the 100-kind
// target — a new enemy's gait is validated automatically), and SIM probes that prove the
// three mechanisms actually shape movement: pulse (rhythm), weave (coherent snaking),
// flank (edge-running entry) — all deterministic, no gameplay rng.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { ENEMY_DEFS, SIM_DT } from './config';
import { WIDTH, nucleusPoint } from './map';
import type { Enemy, MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

type Guts = {
  enemies: Enemy[];
  heroes: { down: boolean; respawn: number }[];
  spawnQueue: unknown[];
  spawnedAll: boolean;
};
const guts = (g: Game): Guts => g as unknown as Guts;

/** A bare combat arena: wave started, the scripted spawns flushed, the hero parked — the
 *  only bodies moving are the ones the probe plants (their steering is undisturbed). */
function arena(seed: number): Game {
  const g = new Game(seed, NO_META);
  g.god = true;
  g.startWave();
  guts(g).spawnQueue.length = 0;
  guts(g).spawnedAll = true;
  guts(g).heroes[0].down = true;
  guts(g).heroes[0].respawn = 1e9;
  return g;
}

describe('content guardrail — every authored gait stays inside the contract', () => {
  it('pulses average ×1 (±2%): the RHYTHM changes, the arrival clock does not', () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      const p = def.behavior.gait?.pulse;
      if (!p) continue;
      const avg = p.duty * p.burst + (1 - p.duty) * p.rest;
      expect(avg, `${def.kind}: pulse must average ~1 (got ${avg.toFixed(3)})`).toBeGreaterThan(0.98);
      expect(avg, `${def.kind}: pulse must average ~1 (got ${avg.toFixed(3)})`).toBeLessThan(1.02);
      expect(p.period, `${def.kind}: pulse needs a positive period`).toBeGreaterThan(0);
      expect(p.duty, `${def.kind}: duty must sit in (0,1)`).toBeGreaterThan(0);
      expect(p.duty, `${def.kind}: duty must sit in (0,1)`).toBeLessThan(1);
    }
  });

  it('weave amps stay ≤ 0.6 (net advance cost bounded) and flanks stay on the field', () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      const gt = def.behavior.gait;
      if (!gt) continue;
      if (gt.weave) {
        expect(gt.weave.amp, `${def.kind}: weave amp`).toBeGreaterThan(0);
        expect(gt.weave.amp, `${def.kind}: weave amp ≤ 0.6`).toBeLessThanOrEqual(0.6);
        expect(gt.weave.freq, `${def.kind}: weave freq`).toBeGreaterThan(0);
      }
      if (gt.flank) {
        expect(gt.flank.pull, `${def.kind}: flank pull ≤ 1`).toBeLessThanOrEqual(1);
        expect(gt.flank.untilY, `${def.kind}: flank untilY on the field`).toBeGreaterThan(100);
        expect(gt.flank.untilY, `${def.kind}: flank cuts in before the line`).toBeLessThan(700);
      }
    }
  });

  it('a healthy spread of the roster carries a gait — and the walls deliberately do not', () => {
    const gaited = Object.values(ENEMY_DEFS).filter((d) => d.behavior.gait !== undefined);
    expect(gaited.length).toBeGreaterThanOrEqual(20); // the variety mandate
    for (const wall of ['mold', 'tank', 'golem', 'colossus', 'cataclyst', 'tyrant'] as const) {
      expect(ENEMY_DEFS[wall].behavior.gait, `${wall} marches — restraint IS its read`).toBeUndefined();
    }
  });
});

describe('sim probes — the three mechanisms shape real movement', () => {
  it('PULSE: a Razor Sprinter moves in bursts; a Carapace Hauler holds one pace', () => {
    const g = arena(3);
    g.debugSpawn('rusher', 1);
    g.debugSpawn('tank', 1);
    const [rusher, tank] = guts(g).enemies;
    rusher.x = 200; rusher.y = 120;
    tank.x = 520; tank.y = 120;
    // Displacement per 0.25s WINDOW (per-tick sampling aliases against the fixed-timestep
    // accumulator — a call can run 0 or 2 sim steps): the rhythm shows at window scale.
    const steps = { rusher: [] as number[], tank: [] as number[] };
    let px = rusher.x, py = rusher.y, qx = tank.x, qy = tank.y;
    for (let w = 0; w < 12; w++) {
      for (let i = 0; i < 15; i++) g.advance(SIM_DT);
      steps.rusher.push(Math.hypot(rusher.x - px, rusher.y - py));
      steps.tank.push(Math.hypot(tank.x - qx, tank.y - qy));
      px = rusher.x; py = rusher.y; qx = tank.x; qy = tank.y;
    }
    const ratio = (a: number[]) => Math.max(...a) / Math.max(1e-9, Math.min(...a));
    expect(ratio(steps.rusher)).toBeGreaterThan(1.8); // sprint-skid-sprint
    expect(ratio(steps.tank)).toBeLessThan(1.25); // the wall holds one pace (± tick jitter)
  });

  it('WEAVE: a Mind Wisp snakes around its straight line to the Core', () => {
    const g = arena(5);
    g.debugSpawn('wisp', 1);
    const wisp = guts(g).enemies[0];
    wisp.x = 360; wisp.y = 100;
    const x0 = wisp.x, y0 = wisp.y;
    let maxDev = 0;
    for (let i = 0; i < 60 * 4; i++) {
      g.advance(SIM_DT);
      // Perpendicular deviation from the spawn→Core chord (flying seek is a straight line).
      const cx = nucleusPoint.x - x0, cy = nucleusPoint.y - y0;
      const cl = Math.hypot(cx, cy);
      const dev = Math.abs(((wisp.x - x0) * cy - (wisp.y - y0) * cx) / cl);
      if (dev > maxDev) maxDev = dev;
    }
    expect(maxDev).toBeGreaterThan(8); // a real snake, not jitter fuzz
  });

  it('FLANK: a Cinder Sapper brood splits — id parity sends them down OPPOSITE edges', () => {
    const g = arena(7);
    g.debugSpawn('sapper', 2);
    const [a, b] = guts(g).enemies;
    a.x = WIDTH / 2; a.y = 90;
    b.x = WIDTH / 2; b.y = 90;
    for (let i = 0; i < 60 * 4; i++) g.advance(SIM_DT);
    const xs = [a.x, b.x].sort((l, r) => l - r);
    expect(xs[0]).toBeLessThan(WIDTH / 2 - 60); // one ran the left flank
    expect(xs[1]).toBeGreaterThan(WIDTH / 2 + 60); // the other ran the right
  });

  it('gaits are fully deterministic for a fixed seed (no gameplay rng anywhere)', () => {
    const run = (): string => {
      const g = arena(11);
      g.debugSpawn('darter', 2);
      g.debugSpawn('wisp', 1);
      g.debugSpawn('apex', 1);
      for (let i = 0; i < 60 * 3; i++) g.advance(SIM_DT);
      return guts(g).enemies.map((e) => `${e.kind}:${e.x.toFixed(4)},${e.y.toFixed(4)}`).join('|');
    };
    expect(run()).toBe(run());
  });
});
