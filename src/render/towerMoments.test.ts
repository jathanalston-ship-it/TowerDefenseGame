import { afterEach, describe, expect, it } from 'vitest';
import { TOWER_MOMENTS, deployPop, drawDeployGround, drawEvolveBeat, evolveDuration, evolveLevel, evolveRings } from './towerMoments';
import { viewFeel } from './feel';

/** A recording Canvas2D stub: counts calls by name (gradients included) — enough to assert what a beat draws. */
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

afterEach(() => { viewFeel.motion = 1; viewFeel.flashes = true; });

describe('tower moments — deploy', () => {
  it('pops past full size then settles to exactly 1', () => {
    expect(deployPop(0)).toBe(1);
    expect(deployPop(TOWER_MOMENTS.deploy.popSec)).toBe(1);
    expect(deployPop(5)).toBe(1);
    let peak = 1;
    for (let a = 0; a < TOWER_MOMENTS.deploy.popSec; a += 0.01) peak = Math.max(peak, deployPop(a));
    expect(peak).toBeGreaterThan(1.05);
    expect(peak).toBeLessThan(1.2); // bounded — the body never lurches off its pad
  });

  it('reduced motion keeps the pad glow but drops the pop, rings and flecks', () => {
    viewFeel.motion = 0;
    expect(deployPop(0.2)).toBe(1);
    const { ctx, calls } = recCtx();
    drawDeployGround(ctx, 100, 100, 12, 0.2, '#5ad1ff', 3);
    expect(calls.createRadialGradient ?? 0).toBeGreaterThan(0); // the pad flare (information)
    expect(calls.ellipse ?? 0).toBe(0); // no expanding rings
    expect(calls.arc ?? 0).toBe(1); // only the flare disc — no flecks
  });

  it('draws nothing once the beat is over', () => {
    const { ctx, calls } = recCtx();
    drawDeployGround(ctx, 100, 100, 12, 5, '#5ad1ff', 3);
    expect(Object.keys(calls)).toHaveLength(0);
  });
});

describe('tower moments — evolve', () => {
  it('escalates with the organism depth: longer, more rings', () => {
    expect(evolveLevel(0, 1)).toBe(0);
    expect(evolveLevel(3, 1)).toBe(3);
    expect(evolveLevel(2, 3)).toBe(4);
    for (let l = 1; l < 9; l++) {
      expect(evolveDuration(l + 1)).toBeGreaterThan(evolveDuration(l));
      expect(evolveRings(l + 1)).toBeGreaterThanOrEqual(evolveRings(l));
    }
    expect(evolveRings(1)).toBe(1);
    expect(evolveRings(9)).toBeLessThanOrEqual(TOWER_MOMENTS.evolve.maxRings);
  });

  it('an apex step raises the light column; an ordinary step does not', () => {
    const a = recCtx();
    drawEvolveBeat(a.ctx, 100, 100, 12, 0.1, 5, true, '#5ad1ff', 1);
    expect(a.calls.createLinearGradient ?? 0).toBe(1);
    const b = recCtx();
    drawEvolveBeat(b.ctx, 100, 100, 12, 0.1, 2, false, '#5ad1ff', 1);
    expect(b.calls.createLinearGradient ?? 0).toBe(0);
  });

  it('reduced motion: a static halo only; Flashes off: no white pop', () => {
    viewFeel.motion = 0;
    viewFeel.flashes = false;
    const { ctx, calls } = recCtx();
    drawEvolveBeat(ctx, 100, 100, 12, 0.1, 5, true, '#5ad1ff', 1);
    expect(calls.arc).toBe(1); // the halo
    expect(calls.createRadialGradient ?? 0).toBe(0); // no pop
    expect(calls.createLinearGradient ?? 0).toBe(0); // no column
    expect(calls.fill ?? 0).toBe(0); // no shards
  });
});
