// Status VFX for the two beam-tower "charge" statuses (Mark · Resonance). The reaction MATRIX is
// pinned in core/reactions*.test.ts; this proves the RENDERER draws a stack-scaled ring for each,
// by running a real frame through drawGame against a recording 2D context and checking the ring
// colors were stroked. Render-only ⇒ golden-safe (the sim never sees the canvas).

import { describe, it, expect } from 'vitest';
import { drawGame } from './renderer';
import { Game } from '../core/game';
import { towerSlots, WIDTH, HEIGHT } from '../core/map';
import type { MetaModifiers } from '../core/types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const MARK_RGB = '255, 120, 160'; // THEME.enemy.mark (Marrow Siphon pink)
const RESO_RGB = '245, 184, 61'; // THEME.enemy.resonance (Resonance Coil amber)

// A minimal recording CanvasRenderingContext2D: methods are no-ops, gradients are stubbed, and every
// stroke() records the current strokeStyle so we can assert which ring colors were drawn.
function recordingCtx(): { ctx: CanvasRenderingContext2D; strokes: string[] } {
  const strokes: string[] = [];
  const store: Record<string, unknown> = {
    globalAlpha: 1, lineWidth: 1, strokeStyle: '', fillStyle: '', font: '10px sans-serif',
    lineCap: 'butt', lineJoin: 'miter', textAlign: 'left', textBaseline: 'alphabetic',
    shadowBlur: 0, shadowColor: '', globalCompositeOperation: 'source-over', miterLimit: 10,
  };
  const grad = { addColorStop() {} };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop in store) return store[prop];
      if (prop === 'canvas') return { width: WIDTH, height: HEIGHT };
      if (prop === 'stroke') return () => { strokes.push(String(store.strokeStyle)); };
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => grad;
      if (prop === 'measureText') return () => ({ width: 0 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {}; // every other method: no-op
    },
    set(_t, prop: string, value) { store[prop] = value; return true; },
  };
  return { ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D, strokes };
}

function frameWithEnemy(mark: number, resonance: number): string[] {
  const g = new Game(3, NO_META);
  g.placeTower('needle', towerSlots[0].x, towerSlots[0].y);
  g.startWave();
  g.debugSpawn('colossus', 1); // one detailed enemy (LOD detail on) to carry the charge
  g.advance(1 / 60);
  const rs = g.getRenderState();
  expect(rs.enemies.length).toBeGreaterThan(0);
  rs.enemies[0].mark = mark;
  rs.enemies[0].resonance = resonance;
  const { ctx, strokes } = recordingCtx();
  drawGame(ctx, rs, null);
  return strokes;
}

describe('status VFX — Mark / Resonance charge rings', () => {
  it('strokes the Mark ring and the Resonance ring for an enemy carrying stacks', () => {
    const strokes = frameWithEnemy(5, 4);
    expect(strokes.some((s) => s.includes(MARK_RGB))).toBe(true); // Vital Mark ring drew
    expect(strokes.some((s) => s.includes(RESO_RGB))).toBe(true); // Resonant charge ring drew
  });

  it('draws NEITHER ring when the enemy has no charge (golden-safe status space)', () => {
    const strokes = frameWithEnemy(0, 0);
    expect(strokes.some((s) => s.includes(MARK_RGB))).toBe(false);
    expect(strokes.some((s) => s.includes(RESO_RGB))).toBe(false);
  });
});
