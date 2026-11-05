// The DAMAGE LANGUAGE (render/combatFx.ts, docs/COMBAT-VISUAL-STANDARDS.md §damage-language):
// every damage type must read differently, every tower/hero must resolve to one, and the shared
// burst pool must stay bounded, ingest each event once, and never hand the canvas a bad value.

import { afterEach, describe, expect, it } from 'vitest';
import { COMBAT_CLASS_ORDER } from '../core/combatClass';
import { HERO_DEFS, TOWER_DEFS } from '../core/config';
import type { RenderState } from '../core/game';
import type { HeroKind, TowerKind } from '../core/types';
import { DAMAGE_NUMBERS, REACTION_LABELS, viewFeel } from './feel';
import { drawGame } from './renderer';
import { Game } from '../core/game';
import { towerSlots } from '../core/map';
import type { MetaModifiers } from '../core/types';
import {
  COMBAT_FX, DAMAGE_STYLE, clearCombatFx, drawBurst, drawCombatBursts, drawDamageShot, drawHitFlash, hotTint, liveBursts,
  pushHitBurst, pushKillPop, pushSplashBlast, shotClass, shotColor, updateCombatFx,
} from './combatFx';

/** A recording 2D-context stub: keeps assigned state, throws like Chromium on negative radii. */
function recCtx(): CanvasRenderingContext2D & { calls: number } {
  const state: Record<string, unknown> = { globalAlpha: 1, globalCompositeOperation: 'source-over', calls: 0 };
  const neg = (name: string, ...r: number[]): void => { for (const v of r) if (!(v >= 0)) throw new RangeError(`${name}: bad radius ${v}`); };
  return new Proxy(state, {
    get: (t, k) => {
      if (k in t) return t[k as string];
      if (k === 'arc') return (_x: number, _y: number, r: number) => { (t.calls as number)++; neg('arc', r); };
      if (k === 'ellipse') return (_x: number, _y: number, rx: number, ry: number) => { (t.calls as number)++; neg('ellipse', rx, ry); };
      if (k === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
      return () => { (t.calls as number)++; };
    },
    set: (t, k, v) => { t[k as string] = v; return true; },
  }) as unknown as CanvasRenderingContext2D & { calls: number };
}

function rs(over: Partial<RenderState>): RenderState {
  return { projectiles: [], deathEvents: [], effectiveRanges: {}, towers: [], enemies: [], ...over } as unknown as RenderState;
}

afterEach(() => {
  clearCombatFx();
  viewFeel.motion = 1;
  viewFeel.flashes = true;
});

describe('damage language — one form per damage type', () => {
  it('every combat class has a style row, and no two classes share a shot or burst form', () => {
    const shots = new Set<string>();
    const bursts = new Set<string>();
    for (const c of COMBAT_CLASS_ORDER) {
      const st = DAMAGE_STYLE[c];
      expect(st, c).toBeDefined();
      shots.add(st.shot);
      bursts.add(st.burst);
      expect(st.head).toBeGreaterThan(0);
      expect(st.hitSec).toBeGreaterThan(0);
    }
    expect(shots.size).toBe(COMBAT_CLASS_ORDER.length);
    expect(bursts.size).toBe(COMBAT_CLASS_ORDER.length);
  });

  it('every tower and every hero resolves to a damage type + a tint (new content inherits a read)', () => {
    for (const k of Object.keys(TOWER_DEFS) as TowerKind[]) {
      expect(shotClass(k), k).toBe(TOWER_DEFS[k].combatClass);
      expect(shotColor(k)).toBe(TOWER_DEFS[k].color);
    }
    for (const h of Object.keys(HERO_DEFS) as HeroKind[]) {
      expect(shotClass(null, h), h).toBe(HERO_DEFS[h].combatClass);
      expect(shotColor(null, h)).toBe(HERO_DEFS[h].color);
    }
    expect(shotClass(null)).toBeNull();
  });

  it('every shot form draws without bad geometry and restores the caller fade alpha', () => {
    for (const c of COMBAT_CLASS_ORDER) {
      const ctx = recCtx();
      ctx.globalAlpha = 0.6; // a fizzling shot
      expect(() => drawDamageShot(ctx, c, 100, 100, 0, -1, 1.4, '#5ad1ff', 3.21, 7)).not.toThrow();
      expect(() => drawDamageShot(ctx, c, 100, 100, 0.6, -0.8, 1, '#5ad1ff', 0, 8, false)).not.toThrow();
      expect(ctx.globalAlpha).toBe(0.6);
      expect(ctx.calls).toBeGreaterThan(0);
    }
  });

  it('every burst form draws at every age, in full and reduced motion, and leaves alpha at 1', () => {
    for (const motion of [1, 0]) {
      viewFeel.motion = motion;
      for (const c of COMBAT_CLASS_ORDER) {
        for (const k of [0, 0.2, 0.5, 0.99]) {
          const ctx = recCtx();
          expect(() => drawBurst(ctx, DAMAGE_STYLE[c].burst, 50, 50, 20, k, '#ff4f4f', 3)).not.toThrow();
          expect(ctx.globalAlpha).toBe(1);
        }
      }
    }
  });

  it('the hit flash is additive with Flashes on and plain with Flashes off — never leaks the blend mode', () => {
    const ctx = recCtx();
    drawHitFlash(ctx, 'hex', 10, 10, 12, 0.8, 'mortar');
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.globalAlpha).toBe(1);
    viewFeel.flashes = false;
    drawHitFlash(ctx, 'circle', 10, 10, 12, 0.8, null);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(hotTint('#5ad1ff')).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });
});

describe('the burst pool', () => {
  it('is bounded — a machine-gunned field never grows it past COMBAT_FX.pool', () => {
    for (let i = 0; i < COMBAT_FX.pool * 3; i++) pushHitBurst(i, i, 10, 'needle', 1, i);
    expect(liveBursts()).toBe(COMBAT_FX.pool);
    // blasts + kill pops recycle the oldest HIT when the pool is full (the big reads always land)
    pushSplashBlast(5, 5, 60, 'mortar', '#b6e84a', 2, 1);
    pushKillPop(5, 5, 'spitfang', '#fff', 1, 2, 2);
    expect(liveBursts()).toBe(COMBAT_FX.pool);
  });

  it('reaps bursts once their life is over', () => {
    pushHitBurst(10, 10, 10, 'quill', 1, 1);
    pushSplashBlast(10, 10, 60, 'mortar', '#b6e84a', 1, 2);
    expect(liveBursts()).toBe(2);
    drawCombatBursts(recCtx(), 1.1);
    expect(liveBursts()).toBe(2);
    drawCombatBursts(recCtx(), 5);
    expect(liveBursts()).toBe(0);
  });

  it('a splash shell that leaves the list DETONATES at its target (true radius); a fizzled one does not', () => {
    const shell = { id: 41, x: 100, y: 300, tx: 120, ty: 200, behavior: 'splash', splash: 60, sourceKind: 'mortar' };
    updateCombatFx(rs({ projectiles: [shell] as unknown as RenderState['projectiles'] }), 1, true);
    expect(liveBursts()).toBe(0);
    updateCombatFx(rs({}), 1.02, true); // gone ⇒ landed
    expect(liveBursts()).toBe(1);
    const fizz = { ...shell, id: 42, fade: 0.4 };
    updateCombatFx(rs({ projectiles: [fizz] as unknown as RenderState['projectiles'] }), 1.04, true);
    updateCombatFx(rs({}), 1.06, true);
    expect(liveBursts()).toBe(1); // the fading shell left without a blast
  });

  it('ingests each death event exactly once (kill pops), and none past the LOD line', () => {
    const ev = (seq: number) => ({ seq, x: 10, y: 10, color: '#fff', overkill: 0.5, bounty: 5, killerKind: 'needle', flying: false });
    const evs = [ev(0), ev(1), ev(2)];
    updateCombatFx(rs({ deathEvents: evs as unknown as RenderState['deathEvents'] }), 1, true);
    expect(liveBursts()).toBe(3);
    updateCombatFx(rs({ deathEvents: evs as unknown as RenderState['deathEvents'] }), 1.01, true);
    expect(liveBursts()).toBe(3); // same buffer, nothing new
    evs.push(ev(3), ev(4));
    updateCombatFx(rs({ deathEvents: evs as unknown as RenderState['deathEvents'] }), 1.02, false); // swarm LOD: skipped, but consumed
    updateCombatFx(rs({ deathEvents: evs as unknown as RenderState['deathEvents'] }), 1.03, true);
    expect(liveBursts()).toBe(3);
  });
});

describe('damage numbers — the crowd budget', () => {
  /** Records the globalAlpha every fillText lands with, keyed by its text. */
  function textAlphaCtx(): { ctx: CanvasRenderingContext2D; texts: { text: string; alpha: number }[] } {
    const texts: { text: string; alpha: number }[] = [];
    const store: Record<string, unknown> = { globalAlpha: 1, globalCompositeOperation: 'source-over', font: '', fillStyle: '', strokeStyle: '' };
    const ctx = new Proxy(store, {
      get: (t, k) => {
        if (k in t) return t[k as string];
        if (k === 'fillText') return (text: string) => { texts.push({ text, alpha: t.globalAlpha as number }); };
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: () => undefined });
        if (k === 'measureText') return () => ({ width: 0 });
        if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
        return () => undefined;
      },
      set: (t, k, v) => { t[k as string] = v; return true; },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, texts };
  }
  const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

  it('past crowdAt numbers, chip damage recedes while the big hit (and every crit) stays full', () => {
    const g = new Game(3, NO_META);
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y);
    const rs = g.getRenderState();
    const floats: RenderState['floats'] = [];
    for (let i = 0; i < DAMAGE_NUMBERS.crowdAt + 6; i++) floats.push({ x: 40 + i * 10, y: 300, text: '7', color: '#fff', life: 0.5 });
    floats.push({ x: 200, y: 200, text: '480', color: '#fff', life: 0.5 });
    floats.push({ x: 220, y: 220, text: '9!', color: '#ffcf5a', life: 0.5, kind: 'crit' });
    (rs as { floats: RenderState['floats'] }).floats = floats;
    const { ctx, texts } = textAlphaCtx();
    drawGame(ctx, rs, null);
    expect(texts.find((x) => x.text === '480')!.alpha).toBe(1);
    expect(texts.find((x) => x.text === '9!')!.alpha).toBe(1);
    expect(texts.find((x) => x.text === '7')!.alpha).toBeCloseTo(DAMAGE_NUMBERS.crowdAlpha);
  });

  it('reaction labels: past crowdAt, each word keeps `repeat` full copies and the rest recede', () => {
    const g = new Game(3, NO_META);
    const rs = g.getRenderState();
    const floats: RenderState['floats'] = [];
    for (let i = 0; i < REACTION_LABELS.crowdAt + 2; i++) floats.push({ x: 40 + i * 10, y: 300, text: 'DETONATE', color: '#ff8a3d', life: 0.5 });
    floats.push({ x: 300, y: 300, text: 'SHRED', color: '#ffd24d', life: 0.5 });
    (rs as { floats: RenderState['floats'] }).floats = floats;
    const { ctx, texts } = textAlphaCtx();
    drawGame(ctx, rs, null);
    const det = texts.filter((x) => x.text === 'DETONATE').map((x) => x.alpha);
    expect(det.filter((a) => a === 1).length).toBe(REACTION_LABELS.repeat);
    expect(det.filter((a) => a < 1).every((a) => Math.abs(a - REACTION_LABELS.crowdAlpha) < 1e-9)).toBe(true);
    expect(texts.find((x) => x.text === 'SHRED')!.alpha).toBe(1); // a different word still reads in full
    // a quiet field: every label full
    (rs as { floats: RenderState['floats'] }).floats = floats.slice(0, 3);
    const quiet = textAlphaCtx();
    drawGame(quiet.ctx, rs, null);
    expect(quiet.texts.filter((x) => x.text === 'DETONATE').every((x) => x.alpha === 1)).toBe(true);
  });

  it('a quiet field shows every number at full strength', () => {
    const g = new Game(3, NO_META);
    const rs = g.getRenderState();
    (rs as { floats: RenderState['floats'] }).floats = [
      { x: 40, y: 300, text: '7', color: '#fff', life: 0.5 },
      { x: 80, y: 300, text: '480', color: '#fff', life: 0.5 },
    ];
    const { ctx, texts } = textAlphaCtx();
    drawGame(ctx, rs, null);
    expect(texts.find((x) => x.text === '7')!.alpha).toBe(1);
  });
});
