// The last-kill beat (render/lastKill.ts, docs/SIGNATURE-MOMENTS.md §1): its time curve, camera
// nudge, fanfare timing and every edge case the storyboard names — pure, no DOM.

import { describe, expect, it } from 'vitest';
import { LastKillMoment, lastKillSpec } from './lastKill';
import { LAST_KILL } from './feel';
import type { GameEventMap } from '../core/events';

type Ev = GameEventMap['waveLastKill'];
const ev = (o: Partial<Ev> = {}): Ev => ({ wave: 3, x: 300, y: 400, kill: true, boss: false, mega: false, final: false, ...o });

/** Run a beat at 60 fps; returns per-frame [rate, zoom] plus the fanfare frame times (ms). */
function play(m: LastKillMoment, speed: number, motion = 1, ms = 1500): { rates: number[]; zooms: number[]; fanfares: number[] } {
  const rates: number[] = [];
  const zooms: number[] = [];
  const fanfares: number[] = [];
  for (let t = 0; t < ms; t += 1000 / 60) {
    if (m.tick(1000 / 60)) fanfares.push(t + 1000 / 60);
    rates.push(m.rate(speed, motion));
    zooms.push(m.zoom(motion));
  }
  return { rates, zooms, fanfares };
}

const lastSlowFrame = (rates: number[]): number => { let i = rates.length - 1; while (i >= 0 && rates[i] >= 1) i--; return i; };

/** Extra wall ms the 0.7 s settle takes under the beat vs. without it (draft-open delay). */
function settleDelay(o: Partial<Ev>, speed: number, mode: 'campaign' | 'bossRush' = 'campaign'): number {
  const m = new LastKillMoment();
  m.start(ev(o), mode, speed);
  const dtMs = 1000 / 240;
  let sim = 0;
  let wall = 0;
  while (sim < 0.7) {
    m.tick(dtMs);
    sim += (dtMs / 1000) * speed * m.rate(speed, 1);
    wall += dtMs;
  }
  return wall - (0.7 / speed) * 1000;
}

describe('last-kill beat — which beat plays', () => {
  it('a kill plays the normal beat; a boss or the Mega falling this wave plays the long one', () => {
    expect(lastKillSpec(ev(), 'campaign')).toBe(LAST_KILL.normal);
    expect(lastKillSpec(ev({ boss: true }), 'campaign')).toBe(LAST_KILL.boss);
    expect(lastKillSpec(ev({ mega: true }), 'endless')).toBe(LAST_KILL.boss);
  });

  it('Boss Rush: every wave is a boss wave, so only a Mega column earns the long beat', () => {
    expect(lastKillSpec(ev({ boss: true }), 'bossRush')).toBe(LAST_KILL.rushBossBeat ? LAST_KILL.boss : LAST_KILL.normal);
    expect(lastKillSpec(ev({ boss: true, mega: true }), 'bossRush')).toBe(LAST_KILL.boss);
  });

  it('a wave that ENDED on a breach has no body to land on: no dip, no camera — fanfare only', () => {
    expect(lastKillSpec(ev({ kill: false }), 'campaign')).toBeNull();
    const m = new LastKillMoment();
    m.start(ev({ kill: false }), 'campaign', 1);
    const r = play(m, 1);
    expect(Math.min(...r.rates)).toBe(1);
    expect(Math.max(...r.zooms)).toBe(0);
    expect(r.fanfares).toHaveLength(1);
    expect(r.fanfares[0]).toBeGreaterThanOrEqual(LAST_KILL.leakFanfareMs);
    expect(r.fanfares[0]).toBeLessThan(LAST_KILL.leakFanfareMs + 20);
  });
});

describe('last-kill beat — the time curve (taste values in render/feel.ts LAST_KILL)', () => {
  it('normal wave at 1×: eases to 50 % within ~80 ms, holds, is back to 100 % by ~650 ms', () => {
    const m = new LastKillMoment();
    m.start(ev(), 'campaign', 1);
    const { rates } = play(m, 1);
    const at = (ms: number): number => rates[Math.floor(ms / (1000 / 60))];
    expect(at(100)).toBeCloseTo(LAST_KILL.normal.depth, 5);
    expect(at(380)).toBeCloseTo(LAST_KILL.normal.depth, 5);
    expect(at(500)).toBeGreaterThan(LAST_KILL.normal.depth);
    expect(at(LAST_KILL.normal.outMs + 20)).toBe(1);
    expect(Math.min(...rates)).toBeCloseTo(LAST_KILL.normal.depth, 5);
    expect(m.active).toBe(false);
  });

  it('boss / Mega waves go deeper (35 %) and ~1.5× longer', () => {
    expect(LAST_KILL.boss.depth).toBeLessThan(LAST_KILL.normal.depth);
    expect(LAST_KILL.boss.outMs / LAST_KILL.normal.outMs).toBeCloseTo(1.5, 1);
    const m = new LastKillMoment();
    m.start(ev({ boss: true }), 'campaign', 1);
    const { rates } = play(m, 1);
    expect(Math.min(...rates)).toBeCloseTo(LAST_KILL.boss.depth, 5);
    expect(lastSlowFrame(rates) * (1000 / 60)).toBeGreaterThan(LAST_KILL.normal.outMs);
  });

  it('the curve never snaps: one smooth dip (down, hold, up) with eased frames on both ramps', () => {
    for (const o of [{}, { boss: true }]) {
      for (const speed of [1, 2, 5]) {
        const m = new LastKillMoment();
        m.start(ev(o), 'campaign', speed);
        const { rates } = play(m, speed);
        const lo = Math.min(...rates);
        const bottom = rates.indexOf(lo);
        for (let i = 1; i <= bottom; i++) expect(rates[i]).toBeLessThanOrEqual(rates[i - 1]);
        for (let i = bottom + 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1] - 1e-12);
        const between = (a: number[]): number => a.filter((r) => r < 1 - 1e-6 && r > lo + 1e-6).length;
        expect(between(rates.slice(0, bottom))).toBeGreaterThanOrEqual(2); // eased in, never a step
        expect(between(rates.slice(bottom))).toBeGreaterThanOrEqual(8); // a longer, gentler release
      }
    }
  });

  it('at 2×/5× the dip floor is ABSOLUTE (the last kill reads at the same visible pace) and the beat compresses', () => {
    for (const speed of [2, 5]) {
      const m = new LastKillMoment();
      m.start(ev(), 'campaign', speed);
      const { rates } = play(m, speed);
      expect(Math.min(...rates) * speed).toBeCloseTo(LAST_KILL.normal.depth, 5); // effective = depth × real time
      const lastSlow = lastSlowFrame(rates) * (1000 / 60);
      expect(lastSlow).toBeLessThan(LAST_KILL.normal.outMs * Math.pow(speed, -LAST_KILL.speedCompress) + 20);
    }
  });

  it('the draft never waits long for it: the settle stretches < 600 ms at every speed (input is never held)', () => {
    for (const o of [{}, { boss: true }]) {
      for (const speed of [1, 2, 5]) {
        const extra = settleDelay(o, speed);
        expect(extra).toBeGreaterThan(0);
        expect(extra).toBeLessThan(600);
      }
    }
  });

  it('reduced motion (motionScale 0): no dip, no camera — the fanfare still plays on the beat', () => {
    const m = new LastKillMoment();
    m.start(ev({ boss: true }), 'campaign', 1);
    const r = play(m, 1, 0);
    expect(Math.min(...r.rates)).toBe(1);
    expect(Math.max(...r.zooms)).toBe(0);
    expect(r.fanfares).toHaveLength(1);
    expect(r.fanfares[0]).toBeLessThan(LAST_KILL.boss.fanfareMs + 20);
  });
});

describe('last-kill beat — camera + fanfare', () => {
  it('the camera nudge stays ≤ 4 % (docs/CAMERA.md) and is home again when the beat ends', () => {
    for (const s of [LAST_KILL.normal, LAST_KILL.boss]) expect(s.zoom).toBeLessThanOrEqual(0.04);
    const m = new LastKillMoment();
    m.start(ev(), 'campaign', 1);
    const { zooms } = play(m, 1);
    expect(Math.max(...zooms)).toBeCloseTo(LAST_KILL.normal.zoom, 3);
    expect(zooms[zooms.length - 1]).toBe(0);
  });

  it('applyCamera scales about the kill point (the view leans toward it), and is a no-op when idle', () => {
    const calls: string[] = [];
    const ctx = {
      translate: (x: number, y: number) => calls.push(`t${x},${y}`),
      scale: (a: number) => calls.push(`s${a.toFixed(3)}`),
    } as unknown as CanvasRenderingContext2D;
    const m = new LastKillMoment();
    m.applyCamera(ctx, 1);
    expect(calls).toEqual([]);
    m.start(ev({ x: 120, y: 200 }), 'campaign', 1);
    m.tick(LAST_KILL.normal.holdMs);
    m.applyCamera(ctx, 1);
    expect(calls).toEqual(['t120,200', `s${(1 + LAST_KILL.normal.zoom).toFixed(3)}`, 't-120,-200']);
  });

  it('the `clear` fanfare fires ONCE per wave at ~120 ms; a run-winning clear leaves it to the victory cadence', () => {
    const m = new LastKillMoment();
    m.start(ev(), 'campaign', 1);
    const r = play(m, 1);
    expect(r.fanfares).toHaveLength(1);
    expect(r.fanfares[0]).toBeGreaterThanOrEqual(LAST_KILL.normal.fanfareMs);
    expect(r.fanfares[0]).toBeLessThan(LAST_KILL.normal.fanfareMs + 20);
    const fin = new LastKillMoment();
    fin.start(ev({ final: true }), 'campaign', 1);
    expect(play(fin, 1).fanfares).toEqual([]);
  });

  it('a paused loop holds the beat (no tick ⇒ no progress); idle costs nothing', () => {
    const m = new LastKillMoment();
    expect(m.tick(16)).toBe(false);
    expect(m.rate(5, 1)).toBe(1);
    m.start(ev(), 'campaign', 1);
    m.tick(200);
    const held = m.rate(1, 1);
    expect(m.rate(1, 1)).toBe(held); // reading never advances it
  });
});
