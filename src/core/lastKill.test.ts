// The sim half of the LAST-KILL beat (docs/SIGNATURE-MOMENTS.md §1): `waveLastKill` is a pure
// presentation event — once per wave, the tick the field empties — and listening to it changes
// nothing about the run (golden-safe).

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { towerSlots } from './map';
import type { GameEventMap } from './events';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const KINDS: TowerKind[] = ['needle', 'mortar', 'reactor'];
type LastKill = GameEventMap['waveLastKill'];

/** sim.testutil's autoplay strategy, optionally listening; returns the outcome + what was heard. */
function play(seed: number, listen: boolean): { out: string; heard: LastKill[]; clearedAtSameStep: boolean[] } {
  const g = new Game(seed, NO_META);
  const bus = g.isolateEvents();
  const heard: LastKill[] = [];
  const clearedAtSameStep: boolean[] = [];
  let lastKillStep = -1;
  if (listen) {
    bus.on('waveLastKill', (e) => { heard.push(e); lastKillStep = g.stepCount; });
    bus.on('waveCompleted', () => clearedAtSameStep.push(lastKillStep === g.stepCount));
  }
  for (let guard = 0, t = 0; t < 600 && g.phase !== 'won' && g.phase !== 'lost' && guard < 500000; guard++) {
    if (g.phase === 'draft') { g.chooseCard(g.getSnapshot().draft![0].id); continue; }
    if (g.phase === 'prep') {
      let placed = 0;
      for (let i = 0; i < towerSlots.length && placed < 3; i++) if (g.placeTower(KINDS[i % 3], towerSlots[i].x, towerSlots[i].y)) placed++;
      g.startWave();
    }
    g.advance(SIM_DT);
    t += SIM_DT;
  }
  return { out: JSON.stringify([g.waveIndex, g.kills, g.integrity, g.biomass, g.phase, g.stepCount]), heard, clearedAtSameStep };
}

/** Start wave 1 and run until everything has spawned (the field still holds enemies). */
function midWave(seed: number): { g: Game; heard: LastKill[] } {
  const g = new Game(seed, NO_META);
  g.god = true;
  const heard: LastKill[] = [];
  g.isolateEvents().on('waveLastKill', (e) => heard.push(e));
  g.startWave();
  for (let i = 0; i < 60 * 120 && !(g as unknown as { spawnedAll: boolean }).spawnedAll; i++) g.advance(SIM_DT);
  expect(g.enemies.length).toBeGreaterThan(1);
  return { g, heard };
}

describe('waveLastKill — the sim side of the last-kill beat', () => {
  it('fires ONCE per cleared wave, on the very tick the wave clears, at a board position', () => {
    const { heard, clearedAtSameStep } = play(7, true);
    expect(heard.length).toBe(12); // the stage's 12 waves, one beat each
    expect(clearedAtSameStep).toHaveLength(12);
    expect(clearedAtSameStep.every(Boolean)).toBe(true);
    expect(heard.map((e) => e.wave)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const e of heard) {
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.x).toBeLessThanOrEqual(720);
      expect(e.y).toBeGreaterThanOrEqual(0);
      expect(e.y).toBeLessThanOrEqual(960);
      expect(e.mega).toBe(false);
    }
    expect(heard.filter((e) => e.final).map((e) => e.wave)).toEqual([12]); // only the run-winning clear
  });

  it('listening changes NOTHING about the run (presentation only — goldens stay byte-identical)', () => {
    for (const seed of [1, 7, 12345]) expect(play(seed, true).out).toBe(play(seed, false).out);
  });

  it('a wave that ENDS on a breach reports kill:false; a kill on the same tick wins over a breach', () => {
    const a = midWave(3);
    for (const e of a.g.enemies) e.hp = 0;
    const last = a.g.enemies[0];
    last.hp = 10;
    last.alive = false; // evicted without an hp-death — the breach / devour path
    a.g.advance(SIM_DT);
    expect(a.heard).toHaveLength(1);
    expect(a.heard[0].kill).toBe(true); // the same tick also held real kills → the kill wins

    const c = midWave(4);
    for (let i = 1; i < c.g.enemies.length; i++) c.g.enemies[i].hp = 0;
    c.g.advance(SIM_DT); // the kills land first…
    expect(c.heard).toHaveLength(0); // …the field is not empty yet
    const leaker = c.g.enemies[0];
    leaker.alive = false; // …then the last one breaches on a LATER tick
    c.g.advance(SIM_DT);
    expect(c.heard).toHaveLength(1);
    expect(c.heard[0].kill).toBe(false);
    expect(c.heard[0].x).toBeCloseTo(leaker.x, 5);
  });

  it('a boss falling marks the wave a boss wave', () => {
    const { g, heard } = midWave(5);
    g.debugSpawnBoss();
    for (const e of g.enemies) e.hp = 0;
    g.advance(SIM_DT);
    for (let i = 0; i < 60 * 3 && heard.length === 0; i++) { for (const e of g.enemies) e.hp = 0; g.advance(SIM_DT); }
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ kill: true, boss: true, mega: false });
  });

  it('a raid: the Mega’s FALL is the last kill — the beat fires during its collapse, not 3.5 s later', () => {
    const g = new Game(5, NO_META, undefined, 'ravager', undefined, { megaDaily: { defId: 'voraxis', tier: 1 } });
    g.god = true;
    const heard: LastKill[] = [];
    g.isolateEvents().on('waveLastKill', (e) => heard.push(e));
    g.startWave();
    g.debugDamageMega(1e9); // its phase shifts surge adds on the way down — the towers' job; kill them here
    for (let i = 0; i < 30 && heard.length === 0; i++) { for (const e of g.enemies) e.hp = 0; g.advance(SIM_DT); }
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ kill: true, mega: true, final: true });
    expect(g.phase).toBe('wave'); // the body is still collapsing
    expect(g.getRenderState().megaBoss).not.toBeNull();
    for (let i = 0; i < 60 * 5; i++) g.advance(SIM_DT);
    expect(g.phase).toBe('won');
    expect(heard).toHaveLength(1); // never twice
  });

  it('nobody listening ⇒ nothing emitted (hasListeners-gated)', () => {
    const g = new Game(2, NO_META);
    const bus = g.isolateEvents();
    g.startWave();
    for (let i = 0; i < 60 * 30; i++) g.advance(SIM_DT);
    expect(bus.hasListeners('waveLastKill')).toBe(false);
  });
});
