// Status visualization framework (render/statusFx.ts) — the procedural trait-merge contract.
// Pure merge tests (no canvas) + a real-frame stroke test proving framework statuses actually
// paint through drawGame (the same recording-context pattern as statusVfx.test.ts).

import { describe, it, expect } from 'vitest';
import { mergeStatusFx, statusBodyTransform } from './statusFx';
import { drawGame } from './renderer';
import { Game } from '../core/game';
import { towerSlots, WIDTH, HEIGHT } from '../core/map';
import type { MetaModifiers } from '../core/types';
import type { RenderState } from '../core/game';

type EnemyView = RenderState['enemies'][number];

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

/** A minimal enemy view carrying only the fields mergeStatusFx reads. */
function bareEnemy(over: Partial<EnemyView> = {}): EnemyView {
  return { id: 7, fracture: 0, corrosion: 0, infection: 0, disrupt: 0, statuses: undefined, ...over } as EnemyView;
}

describe('mergeStatusFx — the procedural trait merge', () => {
  it('returns null for an untouched body (the common fast path)', () => {
    expect(mergeStatusFx(bareEnemy(), 2)).toBeNull();
    expect(mergeStatusFx(bareEnemy({ statuses: [] }), 2)).toBeNull();
  });

  it('a CONTROL rim reads as a grip, a dot rim as a glow — disruption vs corrosion share the rim kind, not the read', () => {
    const disrupted = mergeStatusFx(bareEnemy({ disrupt: 1.2 }), 2)!;
    const corroded = mergeStatusFx(bareEnemy({ corrosion: 2 }), 2)!;
    expect(disrupted.overlays.find((o) => o.kind === 'rim')?.control).toBe(true);
    expect(corroded.overlays.find((o) => o.kind === 'rim')?.control).toBe(false);
  });

  it('a single status carries its identity: poison → veins overlay + spore emitter', () => {
    const m = mergeStatusFx(bareEnemy({ statuses: [{ id: 'poison', stacks: 1, remaining: 4 }] }), 2)!;
    expect(m).toBeTruthy();
    expect(m.overlays.map((o) => o.kind)).toContain('veins');
    expect(m.emitters.map((o) => o.kind)).toContain('spores');
    expect(m.rgb).toBe('155, 226, 77'); // #9be24d — poison's own hue, unblended
  });

  it('two statuses BLEND instead of stacking: poison+burn merge hue and combine emitters', () => {
    const poison = mergeStatusFx(bareEnemy({ statuses: [{ id: 'poison', stacks: 1, remaining: 4 }] }), 2)!;
    const burn = mergeStatusFx(bareEnemy({ statuses: [{ id: 'burn', stacks: 5, remaining: 3 }] }), 2)!;
    const both = mergeStatusFx(bareEnemy({ statuses: [
      { id: 'poison', stacks: 1, remaining: 4 },
      { id: 'burn', stacks: 5, remaining: 3 },
    ] }), 2)!;
    expect(both.rgb).not.toBe(poison.rgb); // the blended hue is a new color…
    expect(both.rgb).not.toBe(burn.rgb); // …not either contributor's
    const kinds = both.emitters.map((o) => o.kind);
    expect(kinds).toContain('spores');
    expect(kinds).toContain('flames');
    expect(both.emitters.length).toBeLessThanOrEqual(3); // the budget holds even combined
    expect(both.intensity).toBeGreaterThan(poison.intensity); // two afflictions read heavier
  });

  it('intensity scales with stacks (a heavy application visibly IS heavier)', () => {
    const light = mergeStatusFx(bareEnemy({ statuses: [{ id: 'burn', stacks: 1, remaining: 3 }] }), 2)!;
    const heavy = mergeStatusFx(bareEnemy({ statuses: [{ id: 'burn', stacks: 5, remaining: 3 }] }), 2)!;
    expect(heavy.intensity).toBeGreaterThan(light.intensity);
    expect(heavy.overlays[0].k).toBeGreaterThan(light.overlays[0].k);
  });

  it('legacy fast-field statuses ride the same framework (fracture → cracks overlay)', () => {
    const m = mergeStatusFx(bareEnemy({ fracture: 4 }), 2)!;
    expect(m.overlays.map((o) => o.kind)).toContain('cracks');
  });

  it('quality tiers budget the emitters (reduced battle → 1 emitter; suppressed → null)', () => {
    const statuses = [
      { id: 'poison', stacks: 1, remaining: 4 },
      { id: 'burn', stacks: 3, remaining: 3 },
      { id: 'freeze', stacks: 1, remaining: 1.5 },
    ];
    expect(mergeStatusFx(bareEnemy({ statuses: [...statuses] }), 2)!.emitters.length).toBeLessThanOrEqual(3);
    expect(mergeStatusFx(bareEnemy({ statuses: [...statuses] }), 1)!.emitters.length).toBe(1);
    expect(mergeStatusFx(bareEnemy({ statuses: [...statuses] }), 0)).toBeNull();
  });

  it('ignores inert refractory markers (stacks 0) — an expired effect shows nothing', () => {
    expect(mergeStatusFx(bareEnemy({ statuses: [{ id: 'freeze', stacks: 0, remaining: 3 }] }), 2)).toBeNull();
  });

  it('control statuses animate the body: fear trembles, an untouched merge does not', () => {
    const fear = mergeStatusFx(bareEnemy({ statuses: [{ id: 'fear', stacks: 1, remaining: 1.5 }] }), 2)!;
    expect(statusBodyTransform(fear, 1.23, 7)).not.toBeNull();
    const slow = mergeStatusFx(bareEnemy({ statuses: [{ id: 'slow', stacks: 1, remaining: 2 }] }), 2)!;
    expect(statusBodyTransform(slow, 1.23, 7)).toBeNull(); // slow doesn't shake — tempo carries it
  });
});

// ── Real-frame proof: a framework status paints through drawGame ─────────────────────────

function recordingCtx(): { ctx: CanvasRenderingContext2D; strokes: string[]; fills: string[] } {
  const strokes: string[] = [];
  const fills: string[] = [];
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
      if (prop === 'fill') return () => { fills.push(String(store.fillStyle)); };
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => grad;
      if (prop === 'measureText') return () => ({ width: 0 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set(_t, prop: string, value) { store[prop] = value; return true; },
  };
  return { ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D, strokes, fills };
}

describe('status FX — real-frame rendering', () => {
  it('a burning enemy strokes its burn-hued rim; an icy one paints the freeze casing', () => {
    const g = new Game(3, NO_META);
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y);
    g.startWave();
    g.debugSpawn('colossus', 1);
    g.advance(1 / 60);
    const rs = g.getRenderState();
    expect(rs.enemies.length).toBeGreaterThan(0);
    rs.enemies[0].statuses = [
      { id: 'burn', stacks: 4, remaining: 3 },
      { id: 'freeze', stacks: 1, remaining: 1.5 },
    ];
    const { ctx, strokes } = recordingCtx();
    drawGame(ctx, rs, null);
    expect(strokes.some((s) => s.includes('255, 138, 61'))).toBe(true); // burn's #ff8a3d rim
    expect(strokes.some((s) => s.includes('127, 233, 255'))).toBe(true); // freeze's #7fe9ff casing
  });
});
