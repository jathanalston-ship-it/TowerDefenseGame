// LIVING GUTTERS (docs/SIGNATURE-MOMENTS.md §4) — the periphery bake. The look is verified live
// (frame-stepped captures); here we pin the contract: the geometry lines the bake up with the board,
// no gutters ⇒ no bake, the change detector only re-bakes on a real input change (no flapping), a
// burrowed/dying Mega withdraws its limbs, and the ≤35 % brightness cap is applied OVER everything
// the bake paints.

import { describe, it, expect } from 'vitest';
import { GUTTERS, creepBucket, gutterGeometry, gutterInputFrom, gutterKey, paintGutters, sameGeom } from './gutters';
import type { GutterInput } from './gutters';
import type { Assimilation, Region } from './livingBattlefield';
import type { RenderState } from '../core/game';
import { HEIGHT, WIDTH } from '../core/map';

const tower = (x: number, y: number, strength = 3): Region => ({ x, y, strength, motif: 'ember', hue: '#ff7a3a', kind: 'tower', seed: x * 7 + y });
function assim(over: Partial<Assimilation> = {}): Assimilation {
  return {
    value: 0, stage: 0, progress: 0, intensity: 0, dominant: 'flesh', dominantHue: '#c0304e', tierColor: [70, 140, 150],
    regions: [{ x: 360, y: 940, strength: 4, motif: 'vein', hue: '#c0304e', kind: 'core', seed: 1 }],
    ...over,
  };
}
type Mega = NonNullable<RenderState['megaBoss']>;
const mega = (over: Partial<Mega> = {}): Mega => ({
  defId: 'meridia', palette: { body: '#1e2a4a', glow: '#6ad4e8', accent: '#b48ae0' }, visualTier: 1, deathT: 0, burrow: 0, ...over,
} as Mega);
const rs = (megaBoss: Mega | null = null, biome = { id: 'ashen', name: 'Ashen', accent: '#ff8a3a' }): Pick<RenderState, 'biome' | 'megaBoss'> => ({ biome, megaBoss });

describe('Living gutters — geometry', () => {
  it('maps the board origin + scale into the ¼-res bake (1440×900 run layout)', () => {
    const g = gutterGeometry(1014, 724, 235.5, 0, 543, 724)!;
    expect(g.cw).toBe(Math.ceil(1014 * GUTTERS.resScale));
    expect(g.ch).toBe(Math.ceil(724 * GUTTERS.resScale));
    // board unit (0,0) lands on the board's top-left; (WIDTH,HEIGHT) on its bottom-right
    expect(g.ox).toBeCloseTo(235.5 * (g.cw / 1014), 6);
    expect(g.ox + WIDTH * g.kx).toBeCloseTo((235.5 + 543) * (g.cw / 1014), 6);
    expect(g.oy + HEIGHT * g.ky).toBeCloseTo(724 * (g.ch / 724), 6);
  });

  it('a board that fills its frame has no gutters ⇒ no bake (null)', () => {
    expect(gutterGeometry(560, 724, 8, 0, 543, 724)).toBeNull();
    expect(gutterGeometry(0, 0, 0, 0, 0, 0)).toBeNull();
  });

  it('sameGeom ignores sub-pixel float noise but sees a real resize', () => {
    const a = gutterGeometry(1014, 724, 235.5, 0, 543, 724);
    expect(sameGeom(a, gutterGeometry(1014, 724, 235.5, 0, 543, 724))).toBe(true);
    expect(sameGeom(a, gutterGeometry(1214, 724, 335.5, 0, 543, 724))).toBe(false);
    expect(sameGeom(a, null)).toBe(false);
  });
});

describe('Living gutters — inputs + change detection', () => {
  it('the terraform wakes only with the field (stage ≥ 1) and the Living Battlefield on', () => {
    expect(gutterInputFrom(rs(), assim({ stage: 0 }), true).terraform).toBe(false);
    expect(gutterInputFrom(rs(), assim({ stage: 3 }), true).terraform).toBe(true);
    expect(gutterInputFrom(rs(), assim({ stage: 3 }), false).terraform).toBe(false);
    expect(gutterInputFrom(rs(), null, true).terraform).toBe(false); // before the first board frame
  });

  it('only TOWER hotspots bleed across the seam (core/combat/mega regions stay on the board)', () => {
    const inp = gutterInputFrom(rs(), assim({ stage: 2, regions: [...assim().regions, tower(40, 800)] }), true);
    expect(inp.towers).toHaveLength(1);
  });

  it('a surfaced, living Mega reaches into the gutters; burrowed or dying it withdraws', () => {
    expect(gutterInputFrom(rs(mega()), assim(), true).mega?.defId).toBe('meridia');
    expect(gutterInputFrom(rs(mega({ burrow: 0.9 })), assim(), true).mega).toBeNull();
    expect(gutterInputFrom(rs(mega({ deathT: 2 })), assim(), true).mega).toBeNull();
  });

  it('the creep step has hysteresis — an index hovering on a boundary never flaps the bake', () => {
    const step = 1 / GUTTERS.creepSteps;
    const baked = creepBucket(5 * step, null);
    expect(creepBucket(5.5 * step + 0.001, baked)).toBe(baked); // just past the rounding boundary: held
    expect(creepBucket(5.49 * step, baked)).toBe(baked);
    expect(creepBucket(5.8 * step, baked)).toBeCloseTo(6 * step, 9); // a real move steps
    expect(creepBucket(4.2 * step, baked)).toBeCloseTo(4 * step, 9);
    expect(creepBucket(2, null)).toBe(1); // clamped
  });

  it('the key changes on stage / creep / biome / mega / tower layout — and only then', () => {
    const base = gutterInputFrom(rs(), assim({ stage: 2, intensity: 0.4, regions: [tower(40, 800)] }), true);
    const k = gutterKey(base);
    expect(gutterKey(gutterInputFrom(rs(), assim({ stage: 2, intensity: 0.4, regions: [tower(40, 800)] }), true))).toBe(k);
    expect(gutterKey({ ...base, stage: 3 })).not.toBe(k);
    expect(gutterKey({ ...base, creep: base.creep + 1 / GUTTERS.creepSteps })).not.toBe(k);
    expect(gutterKey({ ...base, biomeId: 'frostbound' })).not.toBe(k);
    expect(gutterKey({ ...base, mega: { defId: 'm', body: '#000', glow: '#fff', accent: '#888', tier: 0 } })).not.toBe(k);
    expect(gutterKey({ ...base, towers: [tower(40, 800), tower(680, 760)] })).not.toBe(k);
    // a dormant field (stage 0) paints ground only — creep / towers can't trigger a re-bake there
    const dormant = gutterInputFrom(rs(), assim({ stage: 0, intensity: 0.1 }), true);
    expect(gutterKey({ ...dormant, creep: 0.5, towers: [tower(10, 10)] })).toBe(gutterKey(dormant));
  });
});

// A recording 2D-context stub: logs every paint op with the fill/stroke style current at the time.
function recorder(): { ctx: CanvasRenderingContext2D; ops: { op: string; style: string; comp: string }[] } {
  const ops: { op: string; style: string; comp: string }[] = [];
  const grad = { addColorStop: (): void => undefined };
  const st = { fillStyle: '' as unknown, strokeStyle: '' as unknown, globalCompositeOperation: 'source-over', globalAlpha: 1, lineWidth: 1, lineCap: 'butt' };
  const styleOf = (s: unknown): string => (typeof s === 'string' ? s : 'gradient');
  const ctx = new Proxy(st, {
    get(target, prop: string) {
      if (prop in target) return (target as Record<string, unknown>)[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => grad;
      if (prop === 'fill' || prop === 'fillRect') return () => ops.push({ op: prop, style: styleOf(st.fillStyle), comp: st.globalCompositeOperation });
      if (prop === 'stroke') return () => ops.push({ op: prop, style: styleOf(st.strokeStyle), comp: st.globalCompositeOperation });
      return () => undefined; // paths, transforms, save/restore, clearRect …
    },
    set(target, prop: string, v) { (target as Record<string, unknown>)[prop] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

describe('Living gutters — the bake', () => {
  const geom = gutterGeometry(1014, 724, 235.5, 0, 543, 724)!;
  const deep: GutterInput = gutterInputFrom(rs(mega()), assim({ stage: 5, progress: 1, intensity: 1, regions: [tower(40, 800), tower(680, 760)] }), true);

  it('paints the deepest state (terraform + Mega limbs) and the dormant ground without throwing', () => {
    const r = recorder();
    paintGutters(r.ctx, deep, geom);
    expect(r.ops.length).toBeGreaterThan(100);
    const calm = recorder();
    paintGutters(calm.ctx, gutterInputFrom(rs(null, { id: 'neutral', name: 'N', accent: '#5ad1ff' }), null, true), geom);
    expect(calm.ops.length).toBeLessThan(r.ops.length); // stage 0: ground only
  });

  it('the brightness cap is applied OVER everything painted — nothing bright lands after it', () => {
    const r = recorder();
    paintGutters(r.ctx, deep, geom);
    const capStyle = `rgba(0,0,0,${1 - GUTTERS.brightness})`;
    const cap = r.ops.findIndex((o) => o.op === 'fillRect' && o.style === capStyle);
    expect(cap).toBeGreaterThan(0);
    // after the cap: only black contact shadows (gradients from black) and destination-out dissolves
    for (const o of r.ops.slice(cap + 1)) expect(o.comp === 'destination-out' || o.style === 'gradient').toBe(true);
    expect(r.ops.slice(0, cap).every((o) => o.comp === 'source-over')).toBe(true);
  });

  it('tunables: capped dark, low-res, polled — never per frame', () => {
    expect(GUTTERS.brightness).toBeLessThanOrEqual(0.35);
    expect(GUTTERS.resScale).toBeLessThanOrEqual(0.5);
    expect(GUTTERS.pollMs).toBeGreaterThanOrEqual(100);
  });
});
