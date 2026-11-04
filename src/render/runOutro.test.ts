// RUN OUTRO FX (docs/SIGNATURE-MOMENTS.md §2) — the pure logic + the headless lifecycle. The DRAW
// path (wash blits, crack layer, the settle beat, the Results backdrop) is verified live from the
// frame-stepped captures; here we pin the timing table, the wall-clock (never sim-time) clock, the
// reduced-motion end state, the breach point, the crack geometry and the no-leak hand-off.

import { afterEach, describe, expect, it } from 'vitest';
import { OUTRO, breachPoint, deriveCracks, drawVictoryWash, reachFrom, runOutro } from './runOutro';
import { viewFeel } from './feel';
import { HEIGHT, WIDTH, nucleusPoint } from '../core/map';
import { HIVE } from '../core/config';
import type { RenderState } from '../core/game';

const rs = (enemies: { x: number; y: number }[] = [], time = 0): RenderState =>
  ({ enemies, time, biome: { id: 'neutral', name: 'Neutral', accent: '#5ad1ff' } }) as unknown as RenderState;

/** A recording 2D-context stub: counts calls, tracks save/restore balance and composite modes. */
function stubCtx(): { ctx: CanvasRenderingContext2D; calls: string[]; ops: string[]; depth: () => number } {
  const calls: string[] = [];
  const ops: string[] = [];
  let depth = 0;
  const target: Record<string, unknown> = { canvas: {} };
  const ctx = new Proxy(target, {
    get(t, k: string) {
      if (k in t) return t[k];
      return (..._a: unknown[]) => {
        calls.push(k);
        if (k === 'save') depth++;
        if (k === 'restore') depth--;
      };
    },
    set(t, k: string, v) {
      t[k] = v;
      if (k === 'globalCompositeOperation') ops.push(String(v));
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, ops, depth: () => depth };
}

afterEach(() => {
  runOutro.end();
  viewFeel.motion = 1;
});

describe('run outro — the taste table', () => {
  it('a VICTORY hold is shorter than a defeat now the wash carries the moment, and outlasts the wash', () => {
    expect(OUTRO.holdMs.won).toBeLessThan(OUTRO.holdMs.lost);
    expect(OUTRO.holdMs.won).toBeLessThanOrEqual(2600); // the lead's call: ~2.4 s (was 3.4 s)
    expect(OUTRO.wash.ms).toBeLessThan(OUTRO.holdMs.won - OUTRO.settleMs); // the wash lands before the settle
    expect(OUTRO.defeat.ms).toBeLessThan(OUTRO.holdMs.lost - OUTRO.settleMs);
    expect(OUTRO.holdMs.reduced).toBeLessThan(OUTRO.holdMs.won);
  });

  it('no moment holds input: every hold is skippable by a tap, the settle never exceeds 600 ms', () => {
    expect(OUTRO.settleMs).toBeLessThanOrEqual(600);
  });

  it('holdMs follows motionScale (reduced motion keeps a short static beat)', () => {
    viewFeel.motion = 1;
    expect(runOutro.holdMs(true)).toBe(OUTRO.holdMs.won);
    expect(runOutro.holdMs(false)).toBe(OUTRO.holdMs.lost);
    viewFeel.motion = 0;
    expect(runOutro.holdMs(true)).toBe(OUTRO.holdMs.reduced);
    expect(runOutro.holdMs(false)).toBe(OUTRO.holdMs.reduced);
  });
});

describe('run outro — the clock (wall-clock, never sim time)', () => {
  it('the wash advances with GameView\'s outro clock and reaches 1 at OUTRO.wash.ms', () => {
    const { ctx } = stubCtx();
    runOutro.begin(true, 1000, rs([], 50), null);
    runOutro.frame(ctx, 1000 + OUTRO.wash.ms / 2);
    expect(runOutro.progress().t).toBeCloseTo(0.5, 5);
    runOutro.frame(ctx, 1000 + OUTRO.wash.ms * 3);
    expect(runOutro.progress().t).toBe(1);
  });

  it('sim time is irrelevant — a frozen or rewound sim clock does not move the wash', () => {
    const { ctx } = stubCtx();
    runOutro.begin(true, 0, rs([], 9999), null);
    runOutro.frame(ctx, 0);
    expect(runOutro.progress().t).toBe(0);
  });

  it('reduced motion shows the END state at once (fully washed / fully cracked)', () => {
    viewFeel.motion = 0;
    const { ctx } = stubCtx();
    runOutro.begin(true, 500, rs(), null);
    runOutro.frame(ctx, 500);
    expect(runOutro.progress().t).toBe(1);
    runOutro.begin(false, 500, rs([{ x: 360, y: 700 }]), null);
    runOutro.frame(ctx, 500);
    expect(runOutro.progress().t).toBe(1);
  });

  it('is a no-op outside an outro (mid-run frames cost nothing)', () => {
    const { ctx, calls } = stubCtx();
    runOutro.frame(ctx, 123);
    drawVictoryWash(ctx);
    expect(calls).toEqual([]);
  });
});

describe('run outro — defeat grammar', () => {
  it('drains colour with a saturation blend and keeps save/restore balanced', () => {
    const { ctx, ops, depth } = stubCtx();
    runOutro.begin(false, 0, rs([{ x: 300, y: 900 }]), null);
    runOutro.frame(ctx, OUTRO.defeat.drainMs);
    expect(ops).toContain('saturation');
    expect(depth()).toBe(0);
  });

  it('the breach point sits on the Core surface facing the nearest attacker', () => {
    const p = breachPoint(rs([{ x: nucleusPoint.x - 200, y: nucleusPoint.y }, { x: 60, y: 60 }]));
    expect(p.x).toBeCloseTo(nucleusPoint.x - HIVE.coreRadius, 5);
    expect(p.y).toBeCloseTo(nucleusPoint.y, 5);
    expect(breachPoint(rs())).toEqual({ x: nucleusPoint.x, y: nucleusPoint.y }); // nothing standing → the Core
  });

  it('cracks are deterministic per breach, start at it, fan into the board and taper', () => {
    const o = breachPoint(rs([{ x: nucleusPoint.x + 40, y: nucleusPoint.y - 30 }]));
    const reach = reachFrom(o.x, o.y);
    const a = deriveCracks(o.x, o.y, reach);
    expect(deriveCracks(o.x, o.y, reach)).toEqual(a);
    expect(a.length % 5).toBe(0);
    const segs = a.length / 5;
    expect(segs).toBeGreaterThan(OUTRO.defeat.fissures * 4);
    let fromOrigin = 0;
    let upward = 0;
    for (let i = 0; i < a.length; i += 5) {
      if (a[i] === o.x && a[i + 1] === o.y) fromOrigin++;
      if (a[i + 3] < o.y) upward++;
      expect(a[i + 4]).toBeGreaterThan(0);
      expect(a[i + 4]).toBeLessThanOrEqual(OUTRO.defeat.width * 1.25 + 0.6);
      expect(a[i + 2]).toBeGreaterThan(-60);
      expect(a[i + 2]).toBeLessThan(WIDTH + 60);
      expect(a[i + 3]).toBeGreaterThan(-60);
      expect(a[i + 3]).toBeLessThan(HEIGHT + 60);
    }
    expect(fromOrigin).toBe(OUTRO.defeat.fissures);
    expect(upward / segs).toBeGreaterThan(0.8); // the breach is at the bottom — the cracks climb the board
  });
});

describe('run outro — victory reach + hand-off', () => {
  it('the wash radius covers the farthest board corner from the Hive Core', () => {
    const r = reachFrom(nucleusPoint.x, nucleusPoint.y);
    expect(r).toBeCloseTo(Math.hypot(nucleusPoint.x, nucleusPoint.y), 5);
    expect(r).toBeGreaterThanOrEqual(Math.hypot(WIDTH - nucleusPoint.x, nucleusPoint.y));
  });

  it('the wash never paints on a foreign canvas (the replay theater shares drawGame)', () => {
    const { ctx, calls } = stubCtx();
    runOutro.begin(true, 0, rs(), null);
    runOutro.frame(ctx, OUTRO.wash.ms);
    drawVictoryWash(ctx);
    expect(calls).toEqual([]);
  });

  it('capture() releases the outro (headless: no backdrop — Results keeps its dark room)', () => {
    runOutro.begin(true, 0, rs(), null);
    expect(runOutro.progress().active).toBe(true);
    expect(runOutro.capture()).toBeUndefined();
    expect(runOutro.progress().active).toBe(false);
  });
});
