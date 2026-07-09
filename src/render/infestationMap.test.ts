// Infestation territory map smoke (docs/INFESTATION.md §map): the layout is deterministic
// and covers every sector; the painter renders across level ranges / pins / entrenchment /
// flashes against a stub 2D context, at several sizes, without throwing.

import { describe, expect, it } from 'vitest';
import { REGIONS } from '../core/infestation';
import { REDUCED_MAP_T, decayFlashes, drawInfestationMap, infestationLayout } from './infestationMap';
import type { MapDrawState } from './infestationMap';

const REGION_IDS = REGIONS.map((r) => ({ id: r.id, sectorIds: r.sectors.map((s) => s.id) }));
const ALL = REGIONS.flatMap((r) => r.sectors.map((s) => s.id));

function stubCtx(): CanvasRenderingContext2D {
  const proxy: unknown = new Proxy(function () { /* noop */ }, {
    get: (_t, prop) => (prop === 'canvas' ? { width: 400, height: 340 } : proxy),
    set: () => true,
    apply: () => proxy,
  });
  return proxy as CanvasRenderingContext2D;
}

describe('infestation map layout', () => {
  it('places every sector exactly once, inside the canvas', () => {
    const L = infestationLayout(400, 340, REGION_IDS);
    expect(L.cells).toHaveLength(ALL.length);
    expect(new Set(L.cells.map((c) => c.sectorId))).toEqual(new Set(ALL));
    expect(L.regions).toHaveLength(REGIONS.length);
    for (const c of L.cells) {
      expect(c.cx).toBeGreaterThan(-c.r);
      expect(c.cx).toBeLessThan(400 + c.r);
      expect(c.r).toBeGreaterThan(0);
    }
  });

  it('is deterministic for a given size', () => {
    expect(infestationLayout(400, 340, REGION_IDS)).toEqual(infestationLayout(400, 340, REGION_IDS));
  });

  it('keeps cell circles non-overlapping and tappable across board sizes', () => {
    for (const [w, h] of [[320, 320], [360, 305], [440, 440], [560, 475]] as const) {
      const L = infestationLayout(w, h, REGION_IDS);
      // Every cell is a real tap target (diameter ≥ 24px — WCAG 2.5.8).
      for (const c of L.cells) expect(c.r * 2).toBeGreaterThanOrEqual(24);
      // No two cell circles overlap (a small epsilon of slack for anti-alias touch).
      for (let i = 0; i < L.cells.length; i++) {
        for (let j = i + 1; j < L.cells.length; j++) {
          const a = L.cells[i]; const b = L.cells[j];
          const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
          expect(dist).toBeGreaterThan(a.r + b.r - 1);
        }
      }
    }
  });
});

describe('infestation map painter', () => {
  const state = (over: Partial<MapDrawState> = {}): MapDrawState => ({
    levels: Object.fromEntries(ALL.map((id, i) => [id, (i * 17) % 101])),
    accents: Object.fromEntries(REGIONS.map((r) => [r.id, r.accent])),
    entrenched: Object.fromEntries(REGIONS.map((r, i) => [r.id, i === 0])),
    fractions: Object.fromEntries(REGIONS.map((r, i) => [r.id, i / REGIONS.length])),
    pinnedSectors: new Set([ALL[3]]),
    feedsInto: ALL[5],
    flashes: { [ALL[2]]: 1, [ALL[8]]: 0.4 },
    ...over,
  });

  it('renders across sizes, levels, pins, entrenchment, flashes without throwing', () => {
    const ctx = stubCtx();
    expect(() => {
      for (const [w, h] of [[400, 340], [300, 254], [640, 543]] as const) {
        const L = infestationLayout(w, h, REGION_IDS);
        for (const t of [0, 1.2, REDUCED_MAP_T, 4.5]) drawInfestationMap(ctx, L, state(), t);
      }
    }).not.toThrow();
  });

  it('handles an empty board (fresh save) and a fully-saturated board', () => {
    const ctx = stubCtx();
    const L = infestationLayout(400, 340, REGION_IDS);
    const empty = state({ levels: {}, entrenched: {}, fractions: {}, pinnedSectors: new Set(), feedsInto: ALL[0], flashes: {} });
    const full = state({
      levels: Object.fromEntries(ALL.map((id) => [id, 100])),
      entrenched: Object.fromEntries(REGIONS.map((r) => [r.id, true])),
      fractions: Object.fromEntries(REGIONS.map((r) => [r.id, 1])),
    });
    expect(() => { drawInfestationMap(ctx, L, empty, 1); drawInfestationMap(ctx, L, full, 1); }).not.toThrow();
  });

  it('decays feed flashes toward zero and prunes them', () => {
    const f: Record<string, number> = { a: 1, b: 0.1 };
    decayFlashes(f, 0.5);
    expect(f.a).toBeCloseTo(0.6, 5);
    expect(f.b).toBeUndefined(); // 0.1 - 0.4 → clamped, pruned
  });
});
