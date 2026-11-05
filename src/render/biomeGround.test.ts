import { describe, expect, it } from 'vitest';
import { BIOMES } from '../core/biomes';
import { BIOME_GROUND, drawBiomeAir, groundFor, groundSeed, paintGroundMotif, paintGroundTint, paintObstacles } from './biomeGround';
import type { GroundMotif } from './biomeGround';

/** A recording Canvas2D stub: counts calls by name; property writes are kept. */
function recCtx(): { ctx: CanvasRenderingContext2D; calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const grad = { addColorStop: () => undefined };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get: (_t, k: string) => {
      if (k in target) return target[k];
      return (..._a: unknown[]) => { calls[k] = (calls[k] ?? 0) + 1; return k.startsWith('create') ? grad : undefined; };
    },
    set: (_t, k: string, v) => { target[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const BOARD = { x0: 0, y0: 0, x1: 720, y1: 960 };

describe('biome ground — data', () => {
  it('every shipped biome has an authored ground row; NEUTRAL keeps the original arena', () => {
    for (const b of BIOMES) expect(BIOME_GROUND[b.id], b.id).toBeDefined();
    expect(groundFor('neutral', '#5ad1ff')).toBeNull();
  });

  it('the shipped biomes read apart — no two share a ground motif AND base tone', () => {
    const seen = new Set<string>();
    for (const b of BIOMES) {
      const g = BIOME_GROUND[b.id];
      const k = g.motif + g.base;
      expect(seen.has(k), b.id).toBe(false);
      seen.add(k);
    }
    expect(new Set(BIOMES.map((b) => BIOME_GROUND[b.id].motif)).size).toBe(BIOMES.length);
  });

  it('a biome with no row derives a stable, complete ground from its accent (zero code for biome #11)', () => {
    const a = groundFor('future_biome', '#44aa88');
    const b = groundFor('future_biome', '#44aa88');
    expect(a).not.toBeNull();
    expect(a).toBe(b); // cached ⇒ stable
    expect(a!.base).toMatch(/^#[0-9a-f]{6}$/);
    expect(a!.air.count).toBeGreaterThan(0);
  });

  it('stays dim by law — tint and air are bounded so the floor never competes with combat', () => {
    for (const g of Object.values(BIOME_GROUND)) {
      expect(g.tint).toBeLessThanOrEqual(0.32);
      expect(g.air.count).toBeLessThanOrEqual(40);
      expect(g.air.size).toBeLessThanOrEqual(2);
    }
  });
});

describe('biome ground — painters', () => {
  it('every motif paints the board and a gutter rect without throwing', () => {
    const motifs = new Set<GroundMotif>(Object.values(BIOME_GROUND).map((g) => g.motif));
    for (const m of motifs) {
      const spec = { ...Object.values(BIOME_GROUND).find((g) => g.motif === m)! };
      const { ctx, calls } = recCtx();
      paintGroundTint(ctx, BOARD, spec);
      paintGroundMotif(ctx, BOARD, spec, groundSeed(m), 360, 360);
      paintGroundMotif(ctx, { x0: -400, y0: 0, x1: 0, y1: 960 }, spec, groundSeed(m) + 1, 360, 360);
      expect((calls.stroke ?? 0) + (calls.fill ?? 0), m).toBeGreaterThan(10);
    }
  });

  it('the same biome always grows the same floor (deterministic bake)', () => {
    const spec = BIOME_GROUND.frostbound;
    const a = recCtx(); const b = recCtx();
    paintGroundMotif(a.ctx, BOARD, spec, groundSeed('frostbound'), 360, 360);
    paintGroundMotif(b.ctx, BOARD, spec, groundSeed('frostbound'), 360, 360);
    expect(a.calls).toEqual(b.calls);
  });

  it('obstacles paint as ONE merged mass (one body fill), classic palette when neutral', () => {
    const cells = [{ x: 220, y: 260 }, { x: 260, y: 260 }, { x: 220, y: 300 }];
    for (const spec of [null, BIOME_GROUND.molten]) {
      const { ctx, calls } = recCtx();
      paintObstacles(ctx, cells, spec);
      expect(calls.rect).toBeGreaterThanOrEqual(cells.length * 2); // shadow + body traces
      expect(calls.fillRect ?? 0).toBe(0); // no per-cell rects ⇒ no seams
    }
    const empty = recCtx();
    paintObstacles(empty.ctx, [], null);
    expect(Object.keys(empty.calls)).toHaveLength(0);
  });

  it('the air draws every kind, honours LOD, and sets one fill style per call', () => {
    for (const g of Object.values(BIOME_GROUND)) {
      const full = recCtx(); const lod = recCtx();
      drawBiomeAir(full.ctx, g, 12.3, false, 720, 960);
      drawBiomeAir(lod.ctx, g, 12.3, true, 720, 960);
      const n = (c: Record<string, number>): number => (c.fill ?? 0) + (c.fillRect ?? 0);
      expect(n(lod.calls)).toBeLessThanOrEqual(n(full.calls));
    }
  });
});
